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


def call(method, path, expected=200, **kwargs):
    response = requests.request(method, BASE + path, timeout=60, **kwargs)
    if response.status_code != expected:
        raise RuntimeError(f'{method} deployment check failed: HTTP {response.status_code}, expected {expected}')
    return response


def wait(check, description, attempts=60):
    for _ in range(attempts):
        try:
            result = check()
            if result:
                print(f'PASS: {description}', flush=True)
                return result
        except (requests.RequestException, RuntimeError, KeyError, ValueError):
            pass
        time.sleep(10)
    raise RuntimeError(f'Timed out: {description}')


def main():
    wait(lambda: call('GET', '/health').text == 'healthy', 'public frontend')
    discovery = wait(lambda: call('GET', '/auth/realms/ciz-poc/.well-known/openid-configuration').json(), 'identity discovery')
    assert discovery['issuer'] == BASE + '/auth/realms/ciz-poc'
    wait(lambda: call('GET', '/api/tasks', expected=401).status_code == 401, 'anonymous staff access denied')
    for path in ('/internal/bas', '/api/workflow/engine', '/api/rules/intake-form', '/api/documents', '/auth/admin/', '/auth/realms/master/'):
        call('GET', path, expected=404)
    print('PASS: internal and admin routes blocked', flush=True)
    token = call('POST', '/auth/realms/ciz-poc/protocol/openid-connect/token', data={
        'grant_type': 'password', 'client_id': 'ciz-test-harness', 'client_secret': PASSWORD,
        'username': 'beoordelaar', 'password': PASSWORD,
    }).json()['access_token']
    staff = {'Authorization': f'Bearer {token}'}
    call('GET', '/api/tasks', headers=staff)
    print('PASS: authenticated staff access', flush=True)
    payload = unique_personal_data() | {
        'applicantId': f'azure-smoke-{uuid.uuid4()}', 'clientName': 'Fictieve deploymenttest',
        'birthDate': '1980-01-01', 'permanentCareNeed': True, 'permanentSupervision': True,
        'submissionChannel': 'CARE_PROVIDER',
    }
    # Do not automatically retry writes: a timeout may follow a committed operation.
    created = call('POST', '/api/cases/drafts', expected=201, json=payload).json()
    case_id = created['caseId']
    pdf = Path('tests/fixtures/ocr/ann7_ann8_pagescombined_filled.pdf').read_bytes()
    document = call('POST', f'/api/cases/{case_id}/documents', expected=201, data=pdf,
                    headers={'Content-Type': 'application/octet-stream', 'X-Document-File-Name': 'fictional-smoke.pdf',
                             'X-Document-Content-Type': 'application/pdf'}).json()
    document_id = document['documentId']
    downloaded = call('GET', f'/api/cases/{case_id}/documents/{document_id}/content', headers=staff)
    assert downloaded.content == pdf, 'Document round-trip differs'
    print('PASS: document storage round-trip', flush=True)
    call('POST', f'/api/cases/{case_id}/submit')
    tasks_path = f'/api/cases/{case_id}/tasks'
    wait(lambda: bool(call('GET', tasks_path, headers=staff).json()), 'Kafka submission and Operaton task')
    extraction_path = f'/api/cases/{case_id}/documents/{document_id}/structuring'
    wait(lambda: call('GET', extraction_path, headers=staff).json().get('status') == 'READY', 'BAS and labelled OCR mock')
    analyses_path = f'/api/cases/{case_id}/impairment-analyses'
    wait(lambda: any(item['status'] == 'READY' for item in call('GET', analyses_path, headers=staff).json()), 'labelled impairment-analysis mock')
    print('PASS: Azure smoke checks completed (fictional test record retained)', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (requests.RequestException, RuntimeError, AssertionError, KeyError, ValueError):
        # Exceptions may contain credential-bearing URLs; print no response bodies.
        sys.exit('Azure smoke checks failed; inspect deployment health without logging payloads or tokens')
