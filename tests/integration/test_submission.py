import time
import uuid
import os
from pathlib import Path
import requests
from tests.integration.test_case_lifecycle import BASE_URL, case_tasks, wait_for_case_tasks
from tests.ciz_facts import unique_personal_data
from tests.oidc import auth_headers

GATEWAY_URL = os.getenv('GATEWAY_URL', 'http://kong:8000')


def test_upload_starts_document_ocr_and_submission_starts_dossier_analysis():
    payload = unique_personal_data() | {
        'applicantId': f'fictional-draft-{uuid.uuid4()}', 'clientName': 'Fictieve conceptcliënt',
        'birthDate': '1980-01-01', 'permanentCareNeed': True, 'permanentSupervision': True,
        'submissionChannel': 'CARE_PROVIDER',
    }
    created = requests.post(f'{BASE_URL}/cases/drafts', json=payload, timeout=20)
    assert created.status_code == 201
    case_id = created.json()['caseId']
    assert created.json()['application']['submittedAt'] is None
    assert created.json()['application']['applicantStatus'] == 'DRAFT'
    assert case_tasks(case_id) == []
    document = requests.post(f'{BASE_URL}/cases/{case_id}/documents',
        headers={'Content-Type': 'application/octet-stream', 'X-Document-File-Name': 'fictional.pdf',
                 'X-Document-Content-Type': 'application/pdf'},
        data=Path('tests/fixtures/ocr/ann7_ann8_pagescombined_filled.pdf').read_bytes(), timeout=20)
    assert document.status_code == 201
    document_id = document.json()['documentId']
    extraction_url = f'{BASE_URL}/cases/{case_id}/documents/{document_id}/structuring'
    reviewer = auth_headers('beoordelaar')
    assert requests.post(extraction_url, headers=reviewer, timeout=20).status_code == 409
    for _ in range(60):
        result = requests.get(extraction_url, headers=reviewer, timeout=20)
        if result.status_code == 200 and result.json()['status'] == 'READY':
            break
        time.sleep(1)
    else:
        raise AssertionError('BAS did not process the document receipt')
    assert requests.get(f'{BASE_URL}/cases/{case_id}/impairment-analyses', headers=reviewer, timeout=20).json() == []
    assert case_tasks(case_id) == []
    submitted = requests.post(f'{BASE_URL}/cases/{case_id}/submit', timeout=20)
    assert submitted.status_code == 200
    assert submitted.json()['application']['submittedAt']
    again = requests.post(f'{BASE_URL}/cases/{case_id}/submit', timeout=20)
    assert again.status_code == 200
    assert again.json()['application']['submittedAt'] == submitted.json()['application']['submittedAt']
    assert len(wait_for_case_tasks(case_id)) == 1
    for _ in range(60):
        result = requests.get(extraction_url, headers=reviewer, timeout=20)
        if result.status_code == 200 and result.json()['status'] == 'READY':
            break
        time.sleep(1)
    else:
        raise AssertionError('BAS did not process the committed submission event')
    assert result.json()['mock'] is True
    for _ in range(60):
        analyses = requests.get(f'{BASE_URL}/cases/{case_id}/impairment-analyses', headers=reviewer, timeout=20)
        if analyses.status_code == 200 and analyses.json() and analyses.json()[0]['status'] == 'READY':
            break
        time.sleep(1)
    else:
        raise AssertionError('BAS did not analyse the committed dossier snapshot')
    original_extraction = result.json()['extractionId']
    run_id = str(uuid.uuid4())
    runs_url = f'{GATEWAY_URL}/internal/bas/cases/{case_id}/runs'
    run_payload = {'runId': run_id, 'documentIds': [document_id], 'components': ['METADATA'], 'reason': 'MANUAL_RERUN'}
    run = requests.post(runs_url, json=run_payload, timeout=20)
    assert run.status_code == 202
    assert requests.post(runs_url, json=run_payload, timeout=20).json()['runId'] == run_id
    for _ in range(20):
        records = requests.get(runs_url, timeout=20).json()
        if next(item for item in records if item['runId'] == run_id)['status'] == 'READY':
            break
        time.sleep(1)
    else:
        raise AssertionError('Metadata-only BAS invocation did not complete')
    assert requests.get(extraction_url, headers=reviewer, timeout=20).json()['extractionId'] == original_extraction
    rerun = requests.post(runs_url, json=run_payload | {
        'runId': str(uuid.uuid4()), 'components': ['OCR'], 'forceRerun': True,
        'reason': 'MANUAL_RERUN'}, timeout=20)
    assert rerun.status_code == 202
    for _ in range(30):
        extraction = requests.get(extraction_url, headers=reviewer, timeout=20)
        if extraction.status_code == 200 and extraction.json()['extractionId'] != original_extraction and extraction.json()['status'] == 'READY':
            break
        time.sleep(1)
    else:
        raise AssertionError('Forced OCR rerun did not produce a new extraction version')
    assert requests.post(f'{BASE_URL}/cases/{case_id}/documents',
        headers={'X-Document-File-Name': 'late.pdf', 'X-Document-Content-Type': 'application/pdf'},
        data=b'%PDF-1.4\n%%EOF', timeout=10).status_code == 403
