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
