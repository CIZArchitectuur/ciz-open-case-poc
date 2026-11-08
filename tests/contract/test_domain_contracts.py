import yaml
import requests
from tests.integration.test_case_lifecycle import BASE_URL, create_case, case_tasks
from tests.oidc import auth_headers


def test_active_policy_form_carries_dynamic_presentation_groups():
    case = create_case()
    task = case_tasks(case['caseId'])[0]
    result = requests.get(f"{BASE_URL}/tasks/{task['taskId']}/intake-form",
                          headers=auth_headers('beoordelaar'), timeout=10)
    assert result.status_code == 200
    fields = result.json()['fields']
    assert fields and all(field.get('groupId') and field.get('groupTitle') for field in fields)
    assert {'personal', 'insurance', 'representation'}.issubset({field['groupId'] for field in fields})
    assert all(isinstance(field['groupOrder'], int) for field in fields)


def test_submission_event_is_a_document_snapshot_without_personal_data():
    with open('contracts/asyncapi/application-status-events.yaml') as source:
        contract = yaml.safe_load(source)
    messages = contract['components']['messages']
    assert set(messages['ApplicationSubmitted']['payload']['properties']) == {
        'eventId', 'caseId', 'applicationId', 'occurredAt', 'correlationId', 'documentIds', 'traceparent'
    }
    assert 'documentId' in messages['DocumentReceived']['payload']['properties']
    assert contract['channels']['applicationSubmitted']['address'] == 'application.submitted'


def test_domain_services_have_independent_persistence():
    with open('compose.yaml') as source:
        compose = yaml.safe_load(source)
    services = compose['services']
    assert services['bas-service']['environment']['DB_HOST'] == 'bas-db'
    assert services['assessment-service']['environment']['DB_HOST'] == 'assessment-db'
    assert services['bas-db']['volumes'] != services['assessment-db']['volumes']
    assert not services['bas-service'].get('ports')
    assert not services['assessment-service'].get('ports')
    assert services['workflow-start-adapter']['environment']['DB_HOST'] == 'workflow-start-db'
    assert services['workflow-start-db']['volumes'] != services['bas-db']['volumes']
    assert not services['workflow-start-adapter'].get('ports')
    assert 'startWorkflowFromApplicationSubmitted' in yaml.safe_load(
        open('contracts/asyncapi/application-status-events.yaml'))['operations']
