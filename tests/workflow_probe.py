"""Container-only outage/replay probe. Outputs identifiers, never application data."""
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
import requests
from tests.ciz_facts import unique_personal_data
from tests.integration.test_case_lifecycle import BASE_URL, OPERATON_URL, case_tasks, wait_for_case_tasks


def main():
    if sys.argv[1] in ('submit', 'submit-unavailable', 'verify-fresh'):
        response = requests.post(f'{BASE_URL}/cases', json=unique_personal_data() | {
            'applicantId': f'fictional-async-{uuid.uuid4()}', 'clientName': 'Fictieve Kafka proef',
            'birthDate': '1980-01-01', 'permanentCareNeed': True, 'permanentSupervision': True,
        }, timeout=20)
        assert response.status_code == 201
        case = response.json()
        if sys.argv[1] == 'verify-fresh':
            assert len(wait_for_case_tasks(case['caseId'])) == 1
            print('Fresh asynchronous submission after consumer restart verified')
            return
        # The consumer is stopped: polling must never start the workflow itself.
        if sys.argv[1] == 'submit':
            for _ in range(3):
                assert case_tasks(case['caseId']) == []
                time.sleep(1)
        print(json.dumps({'eventId': str(uuid.uuid4()), 'caseId': case['caseId'],
            'applicationId': case['applicationId'], 'occurredAt': datetime.now(timezone.utc).isoformat(),
            'correlationId': str(uuid.uuid4()), 'documentIds': []}))
    elif sys.argv[1] == 'verify':
        event = json.loads(os.environ['WORKFLOW_SCENARIO'])
        assert len(wait_for_case_tasks(event['caseId'])) == 1
        result = requests.get(f'{OPERATON_URL}/history/process-instance',
            params={'processInstanceBusinessKey': event['caseId'], 'processDefinitionKey': 'wlz-aanvraag'}, timeout=15)
        assert result.status_code == 200
        assert len(result.json()) == 1, 'Replay created a second process'
        print('Asynchronous recovery/replay verified')


if __name__ == '__main__':
    main()
