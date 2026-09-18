import os
import uuid

import requests
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT


BASE_URL = os.getenv("CASE_SERVICE_URL", "http://case-service:8080")
OPERATON_URL = os.getenv("OPERATON_URL", "http://operaton:8080/engine-rest")
POLICY_URL = os.getenv("POLICY_SERVICE_URL", "http://policy-service:8080")

COMPLETE_FACTS = COMPLETE_CIZ_FACTS
APPLICANT_FACT_IDS = {
    "achternaam_aanwezig", "voorletters_aanwezig", "bsn_aanwezig", "geboortedatum_aanwezig",
    "straat_aanwezig", "huisnummer_aanwezig", "postcode_aanwezig", "woonplaats_aanwezig", "land_aanwezig",
}


def test_case_survives_a_separate_read_request():
    payload = PERSONAL_DATA | {
        "applicantId": f"integration-{uuid.uuid4()}",
        "clientName": "Fictionele Integratiecliënt",
        "birthDate": "1960-02-03",
        "permanentCareNeed": True,
        "permanentSupervision": True,
    }
    created = requests.post(f"{BASE_URL}/cases", json=payload, timeout=10)
    assert created.status_code == 201
    assert created.headers["Location"].endswith(created.json()["caseId"])

    fetched = requests.get(created.headers["Location"], timeout=10)
    assert fetched.status_code == 200
    assert {key: fetched.json()[key] for key in payload} == payload


def test_invalid_request_is_rejected_without_echoing_personal_data():
    marker = f"private-{uuid.uuid4()}"
    response = requests.post(
        f"{BASE_URL}/cases",
        json=PERSONAL_DATA | {"applicantId": marker, "clientName": "", "birthDate": "2999-01-01",
              "permanentCareNeed": True, "permanentSupervision": False},
        timeout=10,
    )
    assert response.status_code == 400
    assert response.headers["Content-Type"].startswith("application/problem+json")
    assert marker not in response.text


def test_case_runs_intake_before_review_and_stores_document_in_s3():
    created = requests.post(
        f"{BASE_URL}/cases",
        json=PERSONAL_DATA | {
            "applicantId": f"workflow-{uuid.uuid4()}",
            "clientName": "Fictionele Workflowcliënt",
            "birthDate": "1954-06-19",
            "permanentCareNeed": True,
            "permanentSupervision": False,
        },
        timeout=10,
    )
    assert created.status_code == 201
    case_id = created.json()["caseId"]

    document = requests.post(
        f"{BASE_URL}/cases/{case_id}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "medische-bijlage.pdf", "X-Document-Content-Type": "application/pdf"},
        data=b"%PDF-1.4\nfictional integration document\n%%EOF",
        timeout=10,
    )
    assert document.status_code == 201
    assert document.json()["caseId"] == case_id
    assert document.json()["fileName"] == "medische-bijlage.pdf"
    assert document.json()["size"] > 0
    assert len(document.json()["sha256"]) == 64

    documents = requests.get(f"{BASE_URL}/cases/{case_id}/documents", timeout=10)
    assert documents.status_code == 200
    assert [item["documentId"] for item in documents.json()] == [document.json()["documentId"]]

    downloaded = requests.get(
        f"{BASE_URL}/cases/{case_id}/documents/{document.json()['documentId']}/content", timeout=10
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4\nfictional integration document\n%%EOF"
    assert downloaded.headers["Content-Type"].startswith("application/pdf")

    rejected = requests.post(
        f"{BASE_URL}/cases/{case_id}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "script.html", "X-Document-Content-Type": "text/html"},
        data=b"<script>untrusted</script>",
        timeout=10,
    )
    assert rejected.status_code == 400
    assert "untrusted" not in rejected.text

    tasks = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10)
    assert tasks.status_code == 200
    assert [(task["type"], task["status"]) for task in tasks.json()] == [("APPLICATION_INTAKE", "OPEN")]

    intake_queue = requests.get(
        f"{BASE_URL}/tasks",
        params={"status": "OPEN", "type": "APPLICATION_INTAKE"},
        timeout=10,
    )
    assert intake_queue.status_code == 200
    assert any(task["caseId"] == case_id for task in intake_queue.json())

    reviewer_queue = requests.get(
        f"{BASE_URL}/tasks",
        params={"status": "OPEN", "type": "APPLICATION_REVIEW"},
        timeout=10,
    )
    assert reviewer_queue.status_code == 200
    assert not any(task["caseId"] == case_id for task in reviewer_queue.json())

    process_instances = requests.get(
        f"{OPERATON_URL}/history/process-instance",
        params={"processInstanceBusinessKey": case_id, "processDefinitionKey": "wlz-aanvraag"},
        timeout=10,
    )
    assert process_instances.status_code == 200
    assert len(process_instances.json()) == 1
    assert process_instances.json()[0]["state"] == "ACTIVE"

    intake_task_id = tasks.json()[0]["taskId"]
    intake_form = requests.get(f"{BASE_URL}/tasks/{intake_task_id}/intake-form", timeout=10)
    assert intake_form.status_code == 200
    assert len(intake_form.json()["fields"]) == len(COMPLETE_FACTS)
    assert intake_form.json()["policyVersion"]

    incomplete_facts = COMPLETE_FACTS | {"dagtekening_aanvraag_aanwezig": False}
    supplied_incomplete_facts = {
        name: value for name, value in incomplete_facts.items() if name not in APPLICANT_FACT_IDS
    }
    completed_intake = requests.post(
        f"{BASE_URL}/tasks/{intake_task_id}/complete", json={"facts": supplied_incomplete_facts}, timeout=10
    )
    assert completed_intake.status_code == 200
    assert completed_intake.json()["status"] == "COMPLETED"

    after_intake = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10).json()
    assert [(task["type"], task["status"]) for task in after_intake] == [
        ("APPLICATION_INTAKE", "COMPLETED"),
        ("ADDITIONAL_INFORMATION", "OPEN"),
    ]
    additional_task_id = next(task for task in after_intake if task["type"] == "ADDITIONAL_INFORMATION")["taskId"]
    additional_form = requests.get(f"{BASE_URL}/tasks/{additional_task_id}/intake-form", timeout=10)
    assert additional_form.status_code == 200
    assert additional_form.json()["policyVersion"] == intake_form.json()["policyVersion"]

    saved_evaluations = requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", timeout=10)
    assert saved_evaluations.status_code == 200
    assert saved_evaluations.json()[-1]["facts"] == incomplete_facts

    additional = requests.post(
        f"{BASE_URL}/tasks/{additional_task_id}/complete", json={"facts": COMPLETE_FACTS}, timeout=10
    )
    assert additional.status_code == 200

    after_additional = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10).json()
    assert [(task["type"], task["status"]) for task in after_additional] == [
        ("APPLICATION_INTAKE", "COMPLETED"),
        ("ADDITIONAL_INFORMATION", "COMPLETED"),
        ("APPLICATION_REVIEW", "OPEN"),
    ]
    saved_evaluations = requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", timeout=10).json()
    assert len(saved_evaluations) == 2
    assert saved_evaluations[-1]["facts"] == COMPLETE_FACTS
    assert saved_evaluations[-1]["canBeTakenIntoConsideration"] is True

    review_task_id = next(task for task in after_additional if task["type"] == "APPLICATION_REVIEW")["taskId"]
    assessment_form = requests.get(f"{BASE_URL}/tasks/{review_task_id}/medical-assessment-form", timeout=10)
    assert assessment_form.status_code == 200
    assert {field["factId"] for field in assessment_form.json()["fields"]} == set(POSITIVE_MEDICAL_ASSESSMENT)

    completed_review = requests.post(
        f"{BASE_URL}/tasks/{review_task_id}/complete",
        json={"facts": POSITIVE_MEDICAL_ASSESSMENT}, timeout=10,
    )
    assert completed_review.status_code == 200
    assert completed_review.json()["status"] == "COMPLETED"
    assert completed_review.json()["completedAt"] is not None

    assessments = requests.get(f"{BASE_URL}/cases/{case_id}/medical-assessments", timeout=10)
    assert assessments.status_code == 200
    assert assessments.json()[-1]["criteriaMet"] is True
    assert assessments.json()[-1]["facts"] == POSITIVE_MEDICAL_ASSESSMENT
    assert len(assessments.json()[-1]["regulationHash"]) == 64

    after_review = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10).json()
    assert [(task["type"], task["status"]) for task in after_review] == [
        ("APPLICATION_INTAKE", "COMPLETED"),
        ("ADDITIONAL_INFORMATION", "COMPLETED"),
        ("APPLICATION_REVIEW", "COMPLETED"),
        ("DECISION_REGISTRATION", "OPEN"),
    ]
    decision_task = next(task for task in after_review if task["type"] == "DECISION_REGISTRATION")
    ciz_queue = requests.get(
        f"{BASE_URL}/tasks",
        params={"status": "OPEN", "type": "DECISION_REGISTRATION"},
        timeout=10,
    )
    assert ciz_queue.status_code == 200
    assert any(task["taskId"] == decision_task["taskId"] for task in ciz_queue.json())

    completed_decision = requests.post(
        f"{BASE_URL}/tasks/{decision_task['taskId']}/complete", json={}, timeout=10
    )
    assert completed_decision.status_code == 200
    assert completed_decision.json()["status"] == "COMPLETED"

    finished_process = requests.get(
        f"{OPERATON_URL}/history/process-instance",
        params={"processInstanceBusinessKey": case_id, "processDefinitionKey": "wlz-aanvraag"},
        timeout=10,
    ).json()[0]
    assert finished_process["state"] == "COMPLETED"
    assert finished_process["endTime"] is not None

    repeated = requests.post(
        f"{BASE_URL}/tasks/{intake_task_id}/complete", json={"facts": incomplete_facts}, timeout=10
    )
    assert repeated.status_code == 200
    assert repeated.json()["completedAt"] == completed_intake.json()["completedAt"]


def test_document_and_task_endpoints_return_generic_not_found_problems():
    unknown_case = uuid.uuid4()
    document = requests.post(
        f"{BASE_URL}/cases/{unknown_case}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "unknown.pdf", "X-Document-Content-Type": "application/pdf"},
        data=b"%PDF-1.4\nunknown\n%%EOF",
        timeout=10,
    )
    tasks = requests.get(f"{BASE_URL}/cases/{unknown_case}/tasks", timeout=10)
    completion = requests.post(f"{BASE_URL}/tasks/{uuid.uuid4()}/complete", json={}, timeout=10)
    assert [document.status_code, tasks.status_code, completion.status_code] == [404, 404, 404]
    assert all(response.headers["Content-Type"].startswith("application/problem+json")
               for response in (document, tasks, completion))


def test_regelrecht_policy_result_is_explainable_and_reproducible():
    form = requests.get(f"{POLICY_URL}/intake-form", timeout=10)
    assert form.status_code == 200
    assert len(form.json()["fields"]) == len(COMPLETE_FACTS)
    assert any(field.get("description") for field in form.json()["fields"])

    complete = requests.post(
        f"{POLICY_URL}/intake-evaluations", json={"facts": COMPLETE_FACTS}, timeout=10
    )
    assert complete.status_code == 200
    assert complete.json()["canBeTakenIntoConsideration"] is True
    assert complete.json()["outputs"]["aanvraag_voldoet_aan_awb_vereisten"] is True
    assert isinstance(complete.json()["resolvedInputs"], dict)
    assert complete.json()["engineVersion"]
    assert complete.json()["schemaVersion"] == "0.5.2"
    assert len(complete.json()["regulationHash"]) == 64

    incomplete = requests.post(
        f"{POLICY_URL}/intake-evaluations",
        json={"facts": COMPLETE_FACTS | {"dagtekening_aanvraag_aanwezig": False}}, timeout=10,
    )
    assert incomplete.status_code == 200
    assert incomplete.json()["canBeTakenIntoConsideration"] is False

    required_fact_ids = {field["factId"] for field in form.json()["fields"] if field["required"]}
    partial_facts = {name: value for name, value in COMPLETE_FACTS.items() if name in required_fact_ids}
    partial = requests.post(
        f"{POLICY_URL}/intake-evaluations", json={"facts": partial_facts}, timeout=10,
    )
    assert partial.status_code == 200
    assert partial.json()["canBeTakenIntoConsideration"] is False
    unknown_outputs = [value for value in partial.json()["outputs"].values()
                       if isinstance(value, dict) and value.get("__unknown") is True]
    assert unknown_outputs
    assert any(value.get("missing") for value in unknown_outputs)

    medical_form = requests.get(f"{POLICY_URL}/medical-assessment-form", timeout=10)
    assert medical_form.status_code == 200
    assert {field["factId"] for field in medical_form.json()["fields"]} == set(POSITIVE_MEDICAL_ASSESSMENT)
    medical = requests.post(
        f"{POLICY_URL}/medical-assessments", json={"facts": POSITIVE_MEDICAL_ASSESSMENT}, timeout=10,
    )
    assert medical.status_code == 200
    assert medical.json()["assessmentComplete"] is True
    assert medical.json()["criteriaMet"] is True
    assert medical.json()["outputs"]["voldoet_aan_medische_wlz_criteria"] is True
