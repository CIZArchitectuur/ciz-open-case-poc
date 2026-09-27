import os
import time
import uuid

import pytest
import requests
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT, unique_personal_data
from tests.oidc import auth_headers


BASE_URL = os.getenv("CASE_SERVICE_URL", "http://case-service:8080")
OPERATON_URL = os.getenv("OPERATON_URL", "http://operaton:8080/engine-rest")
POLICY_URL = os.getenv("POLICY_SERVICE_URL", "http://policy-service:8080")
COMPLETE_FACTS = COMPLETE_CIZ_FACTS


def create_case():
    response = requests.post(f"{BASE_URL}/cases", json=unique_personal_data() | {
        "applicantId": f"integration-{uuid.uuid4()}",
        "clientName": "Fictionele Integratiecliënt",
        "birthDate": "1960-02-03",
        "permanentCareNeed": True,
        "permanentSupervision": True,
    }, timeout=10)
    assert response.status_code == 201
    return response.json()


def test_staff_api_rejects_anonymous_and_wrong_role_access():
    anonymous = requests.get(f"{BASE_URL}/tasks", timeout=10)
    assert anonymous.status_code == 401
    malformed = requests.get(f"{BASE_URL}/tasks", headers={"Authorization": "Bearer not-a-token"}, timeout=10)
    assert malformed.status_code == 401

    case = create_case()
    task = case_tasks(case["caseId"])[0]
    reviewer = auth_headers("beoordelaar")
    forbidden = requests.get(f"{BASE_URL}/tasks/{task['taskId']}/intake-form", headers=reviewer, timeout=10)
    assert forbidden.status_code == 403
    forbidden_completion = requests.post(
        f"{BASE_URL}/tasks/{task['taskId']}/complete", headers=reviewer,
        json={"facts": COMPLETE_FACTS, "registrationOutcome": "ACCEPTED"}, timeout=10,
    )
    assert forbidden_completion.status_code == 403

    ciz_queue = requests.get(f"{BASE_URL}/tasks", params={"status": "OPEN", "type": "REGISTRATION_ACCEPTANCE"},
                             headers=auth_headers("ciz-medewerker"), timeout=10)
    assert ciz_queue.status_code == 200
    assert any(item["caseId"] == case["caseId"] for item in ciz_queue.json())


def case_tasks(case_id):
    response = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10)
    assert response.status_code == 200
    return response.json()


def complete(case_id, task_type, body):
    task = next(task for task in case_tasks(case_id) if task["type"] == task_type and task["status"] == "OPEN")
    role = "ciz-medewerker" if task_type in {"REGISTRATION_ACCEPTANCE", "REQUEST_ADDITIONAL_INFORMATION", "OUTGOING_COMMUNICATION"} else "beoordelaar"
    response = requests.post(f"{BASE_URL}/tasks/{task['taskId']}/complete", headers=auth_headers(role), json=body, timeout=10)
    assert response.status_code == 200, response.text
    return response.json()


def register(case_id, outcome="ACCEPTED", facts=None, motivation=None):
    task = next(task for task in case_tasks(case_id)
                if task["type"] == "REGISTRATION_ACCEPTANCE" and task["status"] == "OPEN")
    payload = {
        "facts": facts if facts is not None else COMPLETE_FACTS,
        "registrationOutcome": outcome,
    }
    if motivation is not None:
        payload["decisionMotivation"] = motivation
    response = requests.post(f"{BASE_URL}/tasks/{task['taskId']}/complete", headers=auth_headers("ciz-medewerker"), json=payload, timeout=10)
    assert response.status_code == 200, response.text
    return response.json()


def test_case_survives_a_separate_read_request():
    payload = unique_personal_data() | {
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
    assert fetched.json()["personId"] == created.json()["personId"]
    for key in ("clientName", "lastName", "initials", "citizenServiceNumber", "birthDate"):
        assert fetched.json()["person"][key] == payload[key]
    for key in ("street", "houseNumber", "postalCode", "city", "country"):
        assert fetched.json()["address"][key] == payload[key]
    for key in ("applicantId", "permanentCareNeed", "permanentSupervision", "applicantRole", "signedBy", "authorizationSignedByClient"):
        assert fetched.json()["application"][key] == payload[key]


def test_registration_status_reaches_applicant_through_kafka_projection():
    case = create_case()
    case_id = case["caseId"]
    initial = requests.get(f"{BASE_URL}/cases/{case_id}/status", timeout=10)
    assert initial.status_code == 200
    assert initial.json()["status"] == "WAITING_FOR_REGISTRATION"

    register(case_id)

    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        status = requests.get(f"{BASE_URL}/cases/{case_id}/status", timeout=10)
        assert status.status_code == 200
        if status.json()["status"] == "WAITING_FOR_TRIAGE":
            return
        time.sleep(0.2)
    raise AssertionError("Applicant status projection did not consume the Kafka event")


def test_one_person_can_have_multiple_cases():
    personal = unique_personal_data()
    first = requests.post(f"{BASE_URL}/cases", json=personal | {
        "applicantId": f"person-first-{uuid.uuid4()}", "clientName": "Fictionele cliënt",
        "birthDate": "1971-01-10", "permanentCareNeed": True, "permanentSupervision": False,
    }, timeout=10)
    second = requests.post(f"{BASE_URL}/cases", json=personal | {
        "applicantId": f"person-second-{uuid.uuid4()}", "clientName": "Fictionele cliënt",
        "birthDate": "1971-01-10", "permanentCareNeed": False, "permanentSupervision": True,
    }, timeout=10)
    assert first.status_code == second.status_code == 201
    assert first.json()["caseId"] != second.json()["caseId"]
    assert first.json()["personId"] == second.json()["personId"]
    assert first.json()["applicationId"] != second.json()["applicationId"]
    listed = requests.get(f"{BASE_URL}/persons/{first.json()['personId']}/cases", timeout=10)
    assert listed.status_code == 200
    assert {item["caseId"] for item in listed.json()} == {first.json()["caseId"], second.json()["caseId"]}
    conflicting = requests.post(f"{BASE_URL}/cases", json=personal | {
        "applicantId": f"person-conflict-{uuid.uuid4()}", "clientName": "Fictionele cliënt",
        "birthDate": "1972-01-10", "permanentCareNeed": True, "permanentSupervision": False,
    }, timeout=10)
    assert conflicting.status_code == 409
    assert "citizenServiceNumber" not in conflicting.text


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


def test_supplement_is_returned_by_applicant_and_loops_back_to_registration():
    case = create_case()
    case_id = case["caseId"]
    initial = case_tasks(case_id)
    assert [(task["type"], task["status"]) for task in initial] == [("REGISTRATION_ACCEPTANCE", "OPEN")]
    registration_task = initial[0]
    form = requests.get(f"{BASE_URL}/tasks/{registration_task['taskId']}/intake-form", headers=auth_headers("ciz-medewerker"), timeout=10)
    assert form.status_code == 200

    evaluation = requests.post(f"{BASE_URL}/tasks/{registration_task['taskId']}/complete", headers=auth_headers("ciz-medewerker"), json={
        "facts": COMPLETE_FACTS | {"medische_informatie_aanwezig": False},
        "registrationOutcome": "REQUEST_ADDITIONAL_INFORMATION",
    }, timeout=10)
    assert evaluation.status_code == 200
    assert requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", headers=auth_headers("ciz-medewerker"), timeout=10).json()[-1]["canBeTakenIntoConsideration"] is False

    request_task = next(task for task in case_tasks(case_id) if task["type"] == "REQUEST_ADDITIONAL_INFORMATION")
    request_text = "Lever de ontbrekende medische informatie aan."
    requested = requests.post(f"{BASE_URL}/tasks/{request_task['taskId']}/complete", headers=auth_headers("ciz-medewerker"),
                              json={"supplementText": request_text}, timeout=10)
    assert requested.status_code == 200
    applicant_task = next(task for task in case_tasks(case_id) if task["type"] == "SUPPLEMENT_PROVISION")
    answer_text = "De aanvullende informatie is ontvangen door het CIZ."
    supplied = requests.post(f"{BASE_URL}/cases/{case_id}/supplement",
                             json={"supplementText": answer_text}, timeout=10)
    assert supplied.status_code == 200

    updated = requests.get(f"{BASE_URL}/cases/{case_id}", timeout=10).json()["application"]
    assert updated["supplementRequest"] == request_text
    assert updated["supplementResponse"] == answer_text
    assert updated["supplementRequestedAt"]
    assert updated["supplementRespondedAt"]
    assert [(task["type"], task["status"]) for task in case_tasks(case_id)] == [
        ("REGISTRATION_ACCEPTANCE", "COMPLETED"),
        ("REQUEST_ADDITIONAL_INFORMATION", "COMPLETED"),
        ("SUPPLEMENT_PROVISION", "COMPLETED"),
        ("REGISTRATION_ACCEPTANCE", "OPEN"),
    ]

    register(case_id, facts=COMPLETE_FACTS)
    assert any(task["type"] == "TRIAGE" and task["status"] == "OPEN" for task in case_tasks(case_id))


def test_medical_route_records_decision_then_outgoing_confirmation():
    case = create_case()
    case_id = case["caseId"]
    register(case_id)
    complete(case_id, "TRIAGE", {"triageOutcome": "FURTHER_INVESTIGATION"})

    investigation = next(task for task in case_tasks(case_id) if task["type"] == "WLZ_INVESTIGATION_DECISION")
    assessment_form = requests.get(f"{BASE_URL}/tasks/{investigation['taskId']}/medical-assessment-form", headers=auth_headers("beoordelaar"), timeout=10)
    assert assessment_form.status_code == 200
    assert {field["factId"] for field in assessment_form.json()["fields"]} == set(POSITIVE_MEDICAL_ASSESSMENT)
    completed = complete(case_id, "WLZ_INVESTIGATION_DECISION", {
        "facts": POSITIVE_MEDICAL_ASSESSMENT,
        "decisionResult": "GRANTED",
        "decisionMotivation": "De gevalideerde bevindingen ondersteunen toekenning.",
    })
    assert completed["status"] == "COMPLETED"

    medical = requests.get(f"{BASE_URL}/cases/{case_id}/medical-assessments", headers=auth_headers("beoordelaar"), timeout=10).json()[-1]
    assert medical["criteriaMet"] is True
    assert medical["facts"] == POSITIVE_MEDICAL_ASSESSMENT
    assert len(medical["regulationHash"]) == 64
    application = requests.get(f"{BASE_URL}/cases/{case_id}", timeout=10).json()["application"]
    assert application["decisionResult"] == "GRANTED"
    assert application["decisionSentAt"] is None

    outgoing = complete(case_id, "OUTGOING_COMMUNICATION", {})
    assert outgoing["status"] == "COMPLETED"
    final_application = requests.get(f"{BASE_URL}/cases/{case_id}", timeout=10).json()["application"]
    assert final_application["decisionSentAt"]
    process = requests.get(f"{OPERATON_URL}/history/process-instance", params={
        "processInstanceBusinessKey": case_id, "processDefinitionKey": "wlz-aanvraag",
    }, timeout=10).json()[0]
    assert process["state"] == "COMPLETED"


@pytest.mark.parametrize("triage_outcome,decision_result", [
    ("DIRECT_HANDLED", "GRANTED"),
    ("NOT_TAKEN_INTO_CONSIDERATION", "NOT_TAKEN_INTO_CONSIDERATION"),
])
def test_short_triage_routes_skip_investigation(triage_outcome, decision_result):
    case = create_case()
    case_id = case["caseId"]
    register(case_id)
    body = {"triageOutcome": triage_outcome, "decisionMotivation": "Afgehandeld na triage."}
    if triage_outcome == "DIRECT_HANDLED":
        body["decisionResult"] = decision_result
    complete(case_id, "TRIAGE", body)
    active_types = {task["type"] for task in case_tasks(case_id) if task["status"] == "OPEN"}
    assert active_types == {"OUTGOING_COMMUNICATION"}
    application = requests.get(f"{BASE_URL}/cases/{case_id}", timeout=10).json()["application"]
    assert application["decisionResult"] == decision_result


def test_registration_rejection_routes_directly_to_outgoing():
    case = create_case()
    case_id = case["caseId"]
    register(case_id, "NOT_TAKEN_INTO_CONSIDERATION", motivation="De aanvraag voldoet niet aan de voorwaarden voor behandeling.")
    active_types = {task["type"] for task in case_tasks(case_id) if task["status"] == "OPEN"}
    assert active_types == {"OUTGOING_COMMUNICATION"}


def test_regelrecht_policy_result_is_explainable_and_reproducible():
    form = requests.get(f"{POLICY_URL}/intake-form", timeout=10)
    assert form.status_code == 200
    assert len(form.json()["fields"]) == len(COMPLETE_FACTS)
    assert any(field.get("description") for field in form.json()["fields"])

    complete_response = requests.post(
        f"{POLICY_URL}/intake-evaluations", json={"facts": COMPLETE_FACTS}, timeout=10
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["canBeTakenIntoConsideration"] is True
    assert complete_response.json()["outputs"]["aanvraag_voldoet_aan_awb_vereisten"] is True
    assert isinstance(complete_response.json()["resolvedInputs"], dict)
    assert complete_response.json()["engineVersion"]
    assert complete_response.json()["schemaVersion"] == "0.5.2"
    assert len(complete_response.json()["regulationHash"]) == 64
