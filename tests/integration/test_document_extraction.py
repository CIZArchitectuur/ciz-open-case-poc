import time
import requests
from pathlib import Path
from tests.integration.test_case_lifecycle import BASE_URL, create_case, case_tasks
from tests.oidc import auth_headers
from tests.contract.test_openapi_contract import schema
from jsonschema import Draft202012Validator, FormatChecker

def test_extraction_review_is_role_protected_and_does_not_change_workflow_or_facts():
    case = create_case()
    case_id = case["caseId"]
    staff = auth_headers("ciz-medewerker")
    reviewer = auth_headers("beoordelaar")
    # Anonymized upstream PDF, approved by the user. The protocol mock does not OCR it.
    response = requests.post(f"{BASE_URL}/cases/{case_id}/documents",
        headers=staff | {"Content-Type": "application/octet-stream", "X-Document-File-Name": "fictional.pdf",
                        "X-Document-Content-Type": "application/pdf"},
        data=Path("tests/fixtures/ocr/ann7_ann8_pagescombined_filled.pdf").read_bytes(), timeout=20)
    assert response.status_code == 201
    document = response.json()["documentId"]
    url = f"{BASE_URL}/cases/{case_id}/documents/{document}/structuring"
    tasks = case_tasks(case_id)
    assert requests.post(url, timeout=10).status_code == 401
    assert requests.post(url, headers=staff, timeout=10).status_code == 403
    assert requests.get(url, headers=staff, timeout=10).status_code in (200, 404)
    started = requests.post(url, headers=reviewer, timeout=25)
    assert started.status_code == 202, "Extraction submission failed"
    extraction = started.json()
    assert extraction["status"] in ("PROCESSING", "READY") and extraction["mock"] is True
    repeated = requests.post(url, headers=reviewer, timeout=25)
    assert repeated.json()["extractionId"] == extraction["extractionId"]
    for _ in range(15):
        result = requests.get(url, headers=reviewer, timeout=25)
        assert result.status_code == 200
        if result.json()["status"] == "READY":
            break
        time.sleep(1)
    else:
        raise AssertionError("Mock extraction never became ready")
    assert result.json()["fragments"][0]["page"] == 1
    Draft202012Validator(schema("DocumentExtraction"), format_checker=FormatChecker()).validate(result.json())
    assert "reviewedText" not in result.json() or result.json()["reviewedText"] is None
    assert requests.post(url+"/review", headers=staff, json={"confirmed":True,"text":"test"}, timeout=10).status_code == 403
    assert requests.post(url+"/review", headers=reviewer, json={"confirmed":False,"text":"test"}, timeout=10).status_code == 400
    reviewed = requests.post(url+"/review", headers=reviewer,
        json={"confirmed":True,"text":"Fictieve, handmatig gecontroleerde documenttekst."}, timeout=10)
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "REVIEWED"
    assert reviewed.json()["reviewedBy"] and reviewed.json()["reviewedAt"]
    assert reviewed.json()["fragments"] == result.json()["fragments"]
    assert requests.post(url+"/review", headers=reviewer, json={"confirmed":True,"text":"overwrite"}, timeout=10).status_code == 409
    other = create_case()["caseId"]
    assert requests.get(url.replace(case_id, other), headers=staff, timeout=10).status_code == 404
    assert case_tasks(case_id) == tasks
    assert requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", headers=staff, timeout=10).status_code == 403
    assessments = requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", headers=reviewer, timeout=10)
    assert assessments.json() == []
