"""Smoke failures identify the stage without leaking credentials or payloads."""
import importlib.util
from pathlib import Path
import requests
import pytest

@pytest.fixture
def smoke(monkeypatch):
    monkeypatch.setenv('FRONTEND_URL', 'https://example.invalid')
    monkeypatch.setenv('DEMO_USER_PASSWORD', 'not-a-real-secret')
    spec = importlib.util.spec_from_file_location('deployment_smoke', Path(__file__).parents[1] / 'deployment/smoke.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def test_http_failure_reports_only_status(smoke):
    response = requests.Response()
    response.status_code = 504
    response._content = b'sensitive payload'
    response.url = 'https://example.invalid?token=secret'
    error = requests.HTTPError('sensitive exception', response=response)
    assert smoke.safe_error(error) == 'HTTP 504'

def test_transport_failure_does_not_render_exception(smoke):
    assert smoke.safe_error(requests.Timeout('token=secret')) == 'Timeout'

def test_wait_reports_stage_and_last_status(smoke, monkeypatch, capsys):
    monkeypatch.setattr(smoke.time, 'sleep', lambda _: None)
    response = requests.Response()
    response.status_code = 503
    def unavailable():
        raise requests.HTTPError('secret', response=response)
    with pytest.raises(RuntimeError):
        smoke.wait(unavailable, 'document processing', attempts=2)
    output = capsys.readouterr().out
    assert 'document processing' in output
    assert 'HTTP 503' in output
    assert 'secret' not in output
    assert smoke.CURRENT_CHECK == 'document processing'


def test_readiness_recovers_after_transient_service_unavailable(smoke, monkeypatch):
    monkeypatch.setattr(smoke.time, 'sleep', lambda _: None)
    attempts = []
    def read_only_check():
        attempts.append(True)
        response = requests.Response()
        response.status_code = 503 if len(attempts) == 1 else 200
        if response.status_code == 503:
            raise requests.HTTPError(response=response)
        return response
    result = smoke.wait(read_only_check, 'authenticated staff access', attempts=2)
    assert result.status_code == 200
    assert len(attempts) == 2

def test_case_service_readiness_retries_a_safe_unknown_case_lookup(smoke, monkeypatch):
    monkeypatch.setattr(smoke.time, 'sleep', lambda _: None)
    attempts = []
    def safe_lookup(method, path, expected, headers):
        attempts.append((method, path, expected, headers))
        response = requests.Response()
        response.status_code = 503 if len(attempts) == 1 else 404
        if response.status_code != expected:
            raise requests.HTTPError(response=response)
        return response
    monkeypatch.setattr(smoke, 'call', safe_lookup)
    headers = {'Authorization': 'Bearer test-token'}

    result = smoke.wait_for_case_service(headers)

    assert result is True
    assert len(attempts) == 2
    assert all(method == 'GET' and path.startswith('/api/cases/') and expected == 404
               for method, path, expected, _ in attempts)
    assert all(request_headers is headers for _, _, _, request_headers in attempts)


def test_bas_ocr_requires_provider_output_and_provenance(smoke, monkeypatch):
    result = dict(status='READY', mock=False, providerVersion=smoke.BAS_OCR_VERSION,
                  hasSourceArtifact=True, fragments=[{'text': 'Fictieve tekst', 'pages': [1]}])

    class Response:
        def json(self):
            return result

    monkeypatch.setattr(smoke, 'call', lambda *args, **kwargs: Response())
    staff = lambda **kwargs: {}
    smoke.verify_bas_ocr('/extraction', staff, smoke.time.monotonic() + 60)
    result['mock'] = True
    with pytest.raises(AssertionError, match='Expected provider-backed OCR'):
        smoke.verify_bas_ocr('/extraction', staff, smoke.time.monotonic() + 60)


def test_bas_ocr_stops_at_its_deadline(smoke, monkeypatch):
    elapsed = [0]
    monkeypatch.setattr(smoke.time, 'monotonic', lambda: elapsed[0])
    monkeypatch.setattr(smoke.time, 'sleep', lambda duration: elapsed.__setitem__(0, elapsed[0] + duration))
    timeouts = []

    def unavailable(*args, timeout, **kwargs):
        timeouts.append(timeout)
        raise requests.Timeout()

    monkeypatch.setattr(smoke, 'call', unavailable)
    with pytest.raises(RuntimeError, match='Timed out'):
        smoke.verify_bas_ocr('/extraction', lambda **kwargs: {}, deadline=11)
    assert elapsed[0] == 11
    assert timeouts == [11, 1]


def test_staff_authentication_renews_before_expiry(smoke, monkeypatch):
    elapsed = [0]
    monkeypatch.setattr(smoke.time, 'monotonic', lambda: elapsed[0])
    tokens = iter(['original', 'renewed'])

    class Response:
        def json(self):
            return {'access_token': next(tokens), 'expires_in': 300}

    monkeypatch.setattr(smoke, 'call', lambda *args, **kwargs: Response())
    staff = smoke.staff_authentication()
    assert staff() == {'Authorization': 'Bearer original'}
    elapsed[0] = 269
    assert staff() == {'Authorization': 'Bearer original'}
    elapsed[0] = 270
    assert staff() == {'Authorization': 'Bearer renewed'}
