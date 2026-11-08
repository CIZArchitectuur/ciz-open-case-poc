"""Verify idempotent API migration preserves historical identifiers and provenance."""
import os
import uuid
import requests
from tests.integration.test_case_lifecycle import BASE_URL, create_case
from tests.oidc import auth_headers

GATEWAY_URL = os.getenv('GATEWAY_URL', 'http://kong:8000')


def test_historical_assessments_and_decisions_are_imported_without_overwriting_audit():
    case_id = create_case()['caseId']
    evaluation_id, decision_id, task_id = (str(uuid.uuid4()) for _ in range(3))
    provenance = {'caseId': case_id, 'taskId': task_id, 'facts': {'fictional_fact': False},
        'outputs': {'fictional_output': True}, 'resolvedInputs': {'fictional_input': False},
        'policyVersion': 'historical-policy', 'engineVersion': 'historical-engine',
        'schemaVersion': 'historical-schema', 'regulationHash': 'a' * 64,
        'effectiveDate': '2026-01-01'}
    policy = provenance | {'evaluationId': evaluation_id, 'canBeTakenIntoConsideration': False,
                           'evaluatedAt': '2026-01-02T10:00:00Z'}
    decision = {'caseId': case_id, 'decisionId': decision_id, 'result': 'DECLINED',
        'motivation': 'Fictieve historische motivering', 'zorgprofiel': None,
        'grondslagen': ['Fictieve grondslag'], 'decidedAt': '2026-01-03T10:00:00Z',
        'sourceTaskId': task_id, 'policyEvaluationId': evaluation_id,
        'sentAt': '2026-01-04T10:00:00Z'}
    imported = requests.post(f'{GATEWAY_URL}/internal/assessment/legacy-import',
                            json={'policy': [policy], 'decisions': [decision]}, timeout=20)
    assert imported.status_code == 204
    repeated = requests.post(f'{GATEWAY_URL}/internal/assessment/legacy-import',
                            json={'policy': [policy | {'facts': {'overwrite': True}}],
                                  'decisions': [decision | {'motivation': 'Mag niet overschrijven'}]}, timeout=20)
    assert repeated.status_code == 204
    fetched = requests.get(f'{BASE_URL}/cases/{case_id}', timeout=20)
    assert fetched.status_code == 200
    records = fetched.json()['decisions']
    assert len(records) == 1
    assert records[0]['decisionId'] == decision_id
    assert records[0]['motivation'] == decision['motivation']
    assert records[0]['sentAt'].startswith('2026-01-04T10:00')
    evaluations = requests.get(f'{BASE_URL}/cases/{case_id}/policy-evaluations',
                              headers=auth_headers('beoordelaar'), timeout=20)
    assert evaluations.status_code == 200
    history = evaluations.json()
    assert len(history) == 1
    for field in ['facts', 'outputs', 'resolvedInputs', 'policyVersion', 'engineVersion',
                  'schemaVersion', 'regulationHash', 'effectiveDate']:
        assert history[0][field] == policy[field]


def test_historical_ocr_review_is_imported_with_its_original_identifiers():
    case_id = create_case()['caseId']
    document_id, extraction_id = str(uuid.uuid4()), str(uuid.uuid4())
    row = {'extractionId': extraction_id, 'caseId': case_id, 'documentId': document_id,
        'createdAt': '2026-01-01T10:00:00Z', 'reviewedAt': '2026-01-02T10:00:00Z',
        'reviewedBy': 'fictional-opaque-subject', 'reviewedText': 'Fictieve gecontroleerde tekst',
        'result': {'jobId': 'fictional-job', 'status': 'READY', 'mock': True, 'fragments': [],
                   'providerVersion': 'historical-pipeline', 'modelId': 'historical-model'}}
    imported = requests.post(f'{GATEWAY_URL}/internal/bas/legacy-import',
                            json={'extractions': [row]}, timeout=20)
    assert imported.status_code == 204
    repeated = requests.post(f'{GATEWAY_URL}/internal/bas/legacy-import',
                            json={'extractions': [row | {'reviewedText': 'Niet overschrijven'}]}, timeout=20)
    assert repeated.status_code == 204
    fetched = requests.get(f'{BASE_URL}/cases/{case_id}/documents/{document_id}/structuring',
                           headers=auth_headers('beoordelaar'), timeout=20)
    assert fetched.status_code == 200
    value = fetched.json()
    assert value['extractionId'] == extraction_id and value['status'] == 'REVIEWED'
    assert value['reviewedText'] == row['reviewedText']
    assert value['reviewedBy'] == row['reviewedBy']
    assert value['providerVersion'] == 'historical-pipeline'


def test_historical_provider_numbers_can_overlap_without_losing_analysis_versions():
    case_id = create_case()['caseId']
    document_id, extraction_id = str(uuid.uuid4()), str(uuid.uuid4())
    identifiers = [str(uuid.uuid4()), str(uuid.uuid4())]
    rows = [{'analysisId': identifier, 'caseId': case_id, 'analysisNumber': 1,
        'createdAt': f'2026-01-0{index+1}T10:00:00Z', 'status': 'FAILED',
        'input': {'analysisNumber': 1, 'documents': [{'documentId': document_id,
            'extractionId': extraction_id, 'docKey': 'fictional-historical', 'classificationUnits': []}]},
        'errorCode': 'UNAVAILABLE', 'requestContext': {}, 'reviews': []}
        for index, identifier in enumerate(identifiers)]
    imported = requests.post(f'{GATEWAY_URL}/internal/bas/legacy-import',
                            json={'analyses': rows}, timeout=20)
    assert imported.status_code == 204
    fetched = requests.get(f'{BASE_URL}/cases/{case_id}/impairment-analyses',
                           headers=auth_headers('beoordelaar'), timeout=20)
    assert fetched.status_code == 200
    assert {row['analysisId'] for row in fetched.json()} == set(identifiers)
