"""Azure deployment smoke check using fictional data; never print payloads/tokens."""
import os
from pathlib import Path
import sys
import time
import uuid

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tests.ciz_facts import unique_personal_data

BASE = os.environ['FRONTEND_URL'].rstrip('/')
PASSWORD = os.environ['DEMO_USER_PASSWORD']
CURRENT_CHECK = 'initialization'
BAS_OCR_VERSION = 'a18b0c9-bas-ocr'
OCR_BUDGET_SECONDS = 35 * 60


def stage(description):
    global CURRENT_CHECK
    CURRENT_CHECK = description
    print(f'CHECK: {description}', flush=True)


def safe_error(error):
    # Never render arbitrary exception messages, URLs, response bodies or keys.
    if isinstance(error, requests.HTTPError) and error.response is not None:
        return f'HTTP {error.response.status_code}'
    return type(error).__name__


def call(method, path, expected=200, timeout=150, **kwargs):
    response = requests.request(method, BASE + path, timeout=timeout, **kwargs)
    if response.status_code != expected:
        raise requests.HTTPError(response=response)
    return response


def wait(check, description, attempts=60, *, deadline=None):
    stage(description)
    last_error = 'condition not satisfied'
    attempt = 0
    while (attempts is None or attempt < attempts) and (deadline is None or time.monotonic() < deadline):
        attempt += 1
        try:
            result = check()
            if result:
                print(f'PASS: {description}', flush=True)
                return result
        except (requests.RequestException, RuntimeError, KeyError, ValueError) as error:
            last_error = safe_error(error)
        remaining = 10 if deadline is None else max(0, deadline - time.monotonic())
        time.sleep(min(10, remaining))
    print(f'FAIL: {description}; last result: {last_error}', flush=True)
    raise RuntimeError('Timed out')


def wait_for_case_service(headers):
    return wait(
        lambda: call('GET', f'/api/cases/{uuid.uuid4()}', expected=404, headers=headers).status_code == 404,
        'case-service readiness',
    )


def staff_authentication():
    headers = None
    renew_at = 0

    def get_headers(*, timeout=150):
        nonlocal headers, renew_at
        now = time.monotonic()
        if headers is None or now >= renew_at:
            token = call('POST', '/auth/realms/ciz-poc/protocol/openid-connect/token', timeout=timeout, data={
                'grant_type': 'password', 'client_id': 'ciz-test-harness', 'client_secret': PASSWORD,
                'username': 'beoordelaar', 'password': PASSWORD,
            }).json()
            headers = {'Authorization': f"Bearer {token['access_token']}"}
            renew_at = now + max(0, int(token['expires_in']) - 30)
        return headers

    return get_headers


def verify_bas_ocr(path, get_staff_headers, deadline):
    def check():
        headers = get_staff_headers(timeout=min(20, deadline - time.monotonic()))
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        response = call('GET', path, headers=headers, timeout=min(20, remaining)).json()
        status = response.get('status')
        assert status != 'FAILED', 'BAS OCR extraction failed'
        if status != 'READY':
            return False
        assert response.get('mock') is False, 'Expected provider-backed OCR'
        assert response.get('providerVersion') == BAS_OCR_VERSION, 'Unexpected BAS OCR pipeline version'
        assert response.get('hasSourceArtifact') is True, 'OCR source artifact is missing'
        fragments = response.get('fragments', [])
        assert any(fragment.get('text', '').strip() and (fragment.get('page') or fragment.get('pages'))
                   for fragment in fragments), 'Expected OCR text with a page reference'
        return True

    wait(check, 'BAS OCR and source artifact', attempts=None, deadline=deadline)


def main():
    wait(lambda: call('GET', '/health').text == 'healthy', 'public frontend')
    discovery = wait(lambda: call('GET', '/auth/realms/ciz-poc/.well-known/openid-configuration').json(), 'identity discovery')
    stage('identity issuer')
    assert discovery['issuer'] == BASE + '/auth/realms/ciz-poc'
    wait(lambda: call('GET', '/api/tasks', expected=401).status_code == 401, 'anonymous staff access denied')
    stage('internal and admin routes blocked')
    for path in ('/internal/bas', '/api/workflow/engine', '/api/rules/intake-form', '/api/documents', '/auth/admin/', '/auth/realms/master/'):
        call('GET', path, expected=404)
    print('PASS: internal and admin routes blocked', flush=True)
    stage('demo token request')
    staff = staff_authentication()
    staff()
    # Operaton may still be starting after the API itself is ready. Retry only this read.
    wait(lambda: call('GET', '/api/tasks', headers=staff()), 'authenticated staff access', attempts=12)
    # Warm the case API and its database with a safe lookup before the one-shot write.
    wait_for_case_service(staff())
    payload = unique_personal_data() | {
        'applicantId': f'azure-smoke-{uuid.uuid4()}', 'clientName': 'Fictieve deploymenttest',
        'birthDate': '1980-01-01', 'permanentCareNeed': True, 'permanentSupervision': True,
        'submissionChannel': 'CARE_PROVIDER',
    }
    # Do not automatically retry writes: a timeout may follow a committed operation.
    stage('create fictional draft')
    created = call('POST', '/api/cases/drafts', expected=201, json=payload).json()
    case_id = created['caseId']
    pdf = Path('tests/fixtures/ocr/ann7_ann8_pagescombined_filled.pdf').read_bytes()
    stage('document upload')
    document = call('POST', f'/api/cases/{case_id}/documents', expected=201, data=pdf,
                    headers={'Content-Type': 'application/octet-stream', 'X-Document-File-Name': 'fictional-smoke.pdf',
                             'X-Document-Content-Type': 'application/pdf'}).json()
    document_id = document['documentId']
    stage('document download')
    downloaded = call('GET', f'/api/cases/{case_id}/documents/{document_id}/content', headers=staff())
    assert downloaded.content == pdf, 'Document round-trip differs'
    print('PASS: document storage round-trip', flush=True)
    stage('case submission')
    call('POST', f'/api/cases/{case_id}/submit')
    ocr_deadline = time.monotonic() + OCR_BUDGET_SECONDS
    tasks_path = f'/api/cases/{case_id}/tasks'
    wait(lambda: bool(call('GET', tasks_path, headers=staff()).json()), 'Kafka submission and Operaton task')
    extraction_path = f'/api/cases/{case_id}/documents/{document_id}/structuring'
    verify_bas_ocr(extraction_path, staff, ocr_deadline)
    analyses_path = f'/api/cases/{case_id}/impairment-analyses'
    wait(lambda: any(item['status'] == 'READY' for item in call('GET', analyses_path, headers=staff()).json()), 'labelled impairment-analysis mock')
    print('PASS: Azure smoke checks completed (fictional test record retained)', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (requests.RequestException, RuntimeError, AssertionError, KeyError, ValueError) as error:
        # Exceptions may contain credential-bearing URLs; print no response bodies.
        sys.exit(f'Azure smoke check failed at {CURRENT_CHECK}: {safe_error(error)}')
