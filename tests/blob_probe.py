"""Verify persisted document bytes through the public API across gateway restart."""
import json
import os
from pathlib import Path
import sys
import uuid

import requests
from tests.ciz_facts import unique_personal_data
from tests.integration.test_case_lifecycle import BASE_URL
from tests.oidc import auth_headers

PDF = Path('tests/fixtures/ocr/ann7_ann8_pagescombined_filled.pdf')


def main():
    if sys.argv[1] == 'store':
        response = requests.post(f'{BASE_URL}/cases/drafts', json=unique_personal_data() | {
            'applicantId': f'blob-probe-{uuid.uuid4()}', 'clientName': 'Fictieve opslagproef',
            'birthDate': '1980-01-01', 'permanentCareNeed': True, 'permanentSupervision': True,
        }, timeout=20)
        assert response.status_code == 201, 'Could not create the fictional storage probe'
        case_id = response.json()['caseId']
        document = requests.post(f'{BASE_URL}/cases/{case_id}/documents', data=PDF.read_bytes(), headers={
            'Content-Type': 'application/octet-stream', 'X-Document-File-Name': 'storage-probe.pdf',
            'X-Document-Content-Type': 'application/pdf',
        }, timeout=30)
        assert document.status_code == 201, 'Storage probe upload failed'
        # Only opaque identifiers, never the application or document content.
        print(json.dumps({'caseId': case_id, 'documentId': document.json()['documentId']}))
    elif sys.argv[1] == 'verify':
        scenario = json.loads(os.environ['BLOB_SCENARIO'])
        response = requests.get(f"{BASE_URL}/cases/{scenario['caseId']}/documents/{scenario['documentId']}/content",
                                headers=auth_headers('beoordelaar'), timeout=30)
        assert response.status_code == 200, 'Stored document unavailable after gateway restart'
        assert response.content == PDF.read_bytes(), 'Stored bytes changed across gateway restart'
        assert response.headers['Content-Type'].split(';')[0] == 'application/pdf'
        print('Document bytes and content type survived the stateless S3 gateway restart')


if __name__ == '__main__':
    main()
