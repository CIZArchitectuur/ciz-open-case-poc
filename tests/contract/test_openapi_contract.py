import os
import copy
import uuid
import xml.etree.ElementTree as ET

import requests
import yaml
from jsonschema import Draft202012Validator, FormatChecker
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT, unique_personal_data
from tests.oidc import auth_headers


BASE_URL = os.getenv("CASE_SERVICE_URL", "http://case-service:8080")
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")

COMPLETE_FACTS = COMPLETE_CIZ_FACTS


def schema(name):
    with open("contracts/openapi/case-service.yaml", encoding="utf-8") as source:
        spec = yaml.safe_load(source)
    value = spec["components"]["schemas"][name]
    if "allOf" in value:
        request = spec["components"]["schemas"]["CreateCaseRequest"]
        own = value["allOf"][1]
        value = {
            "type": "object",
            "required": request["required"] + own["required"],
            "properties": request["properties"] | own["properties"],
            "additionalProperties": False,
        }
    value = copy.deepcopy(value)

    def resolve_refs(node):
        if isinstance(node, dict):
            if "$ref" in node:
                referenced = node["$ref"].split("/")[-1]
                return resolve_refs(copy.deepcopy(spec["components"]["schemas"][referenced]))
            return {key: resolve_refs(child) for key, child in node.items()}
        if isinstance(node, list):
            return [resolve_refs(child) for child in node]
        return node

    value = resolve_refs(value)

    def convert_nullable(node):
        if isinstance(node, dict):
            if node.pop("nullable", False):
                if isinstance(node.get("type"), str):
                    node["type"] = [node["type"], "null"]
                if isinstance(node.get("enum"), list) and None not in node["enum"]:
                    node["enum"].append(None)
            for child in node.values():
                convert_nullable(child)
        elif isinstance(node, list):
            for child in node:
                convert_nullable(child)

    convert_nullable(value)
    return value


def test_create_and_get_responses_match_openapi_schema():
    payload = unique_personal_data() | {
        "applicantId": f"contract-{uuid.uuid4()}",
        "clientName": "Fictionele Contractcliënt",
        "birthDate": "1975-04-12",
        "permanentCareNeed": True,
        "permanentSupervision": False,
        "applicantRole": "gemachtigde",
        "signedBy": "gemachtigde",
        "authorizationSignedByClient": True,
    }
    created = requests.post(f"{BASE_URL}/cases", json=payload, timeout=10)
    assert created.status_code == 201
    Draft202012Validator(schema("Case"), format_checker=FormatChecker()).validate(created.json())

    fetched = requests.get(f"{BASE_URL}/cases/{created.json()['caseId']}", timeout=10)
    assert fetched.status_code == 200
    Draft202012Validator(schema("Case"), format_checker=FormatChecker()).validate(fetched.json())
    assert fetched.json()["application"]["applicantRole"] == "gemachtigde"
    assert fetched.json()["application"]["signedBy"] == "gemachtigde"
    assert fetched.json()["application"]["authorizationSignedByClient"] is True
    assert fetched.json()["application"]["applicantStatus"] == "WAITING_FOR_REGISTRATION"
    status = requests.get(f"{BASE_URL}/cases/{created.json()['caseId']}/status", timeout=10)
    assert status.status_code == 200
    assert status.json()["status"] == "WAITING_FOR_REGISTRATION"


def test_not_found_is_problem_details():
    response = requests.get(f"{BASE_URL}/cases/{uuid.uuid4()}", timeout=10)
    assert response.status_code == 404
    assert response.headers["Content-Type"].startswith("application/problem+json")
    Draft202012Validator(schema("Problem"), format_checker=FormatChecker()).validate(response.json())


def test_invalid_identifier_is_problem_details():
    response = requests.get(f"{BASE_URL}/cases/not-a-uuid", timeout=10)
    assert response.status_code == 404
    assert response.headers["Content-Type"].startswith("application/problem+json")
    Draft202012Validator(schema("Problem"), format_checker=FormatChecker()).validate(response.json())


def test_application_status_event_contract_is_asyncapi_and_contains_no_personal_data():
    with open("contracts/asyncapi/application-status-events.yaml", encoding="utf-8") as source:
        spec = yaml.safe_load(source)
    assert spec["asyncapi"].startswith("3.")
    assert spec["channels"]["applicationStatusChanged"]["address"] == "application.status.changed"
    payload = spec["components"]["messages"]["ApplicationStatusChanged"]["payload"]
    assert payload["required"] == ["eventId", "caseId", "status", "occurredAt", "correlationId"]
    assert set(payload["properties"]) == set(payload["required"])


def test_staff_openapi_operations_declare_bearer_security():
    with open("contracts/openapi/case-service.yaml", encoding="utf-8") as source:
        spec = yaml.safe_load(source)
    secured = [
        ("/tasks", "get"), ("/tasks/{taskId}/complete", "post"),
        ("/tasks/{taskId}/intake-form", "get"), ("/tasks/{taskId}/medical-assessment-form", "get"),
        ("/cases/{caseId}/documents", "post"), ("/cases/{caseId}/documents", "get"),
        ("/cases/{caseId}/documents/{documentId}/content", "get"),
        ("/cases/{caseId}/policy-evaluations", "get"),
        ("/cases/{caseId}/medical-assessments", "get"),
    ]
    for path, method in secured:
        assert spec["paths"][path][method]["security"] == [{"oidcBearer": []}]
    assert spec["components"]["securitySchemes"]["oidcBearer"]["scheme"] == "bearer"


def test_document_and_task_responses_match_openapi_schemas():
    payload = unique_personal_data() | {
        "applicantId": f"contract-flow-{uuid.uuid4()}",
        "clientName": "Fictionele Taakcliënt",
        "birthDate": "1984-11-08",
        "permanentCareNeed": True,
        "permanentSupervision": True,
    }
    created = requests.post(f"{BASE_URL}/cases", json=payload, timeout=10)
    assert created.status_code == 201
    case_id = created.json()["caseId"]

    registered = requests.post(
        f"{BASE_URL}/cases/{case_id}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "aanvraag.pdf", "X-Document-Content-Type": "application/pdf", **auth_headers("ciz-medewerker")},
        data=b"%PDF-1.4\nfictional contract document\n%%EOF",
        timeout=10,
    )
    assert registered.status_code == 201
    Draft202012Validator(schema("CaseDocument"), format_checker=FormatChecker()).validate(registered.json())

    anonymous_documents = requests.get(f"{BASE_URL}/cases/{case_id}/documents", timeout=10)
    assert anonymous_documents.status_code == 401
    listed_documents = requests.get(f"{BASE_URL}/cases/{case_id}/documents", headers=auth_headers("ciz-medewerker"), timeout=10)
    assert listed_documents.status_code == 200

    listed = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["type"] == "REGISTRATION_ACCEPTANCE"
    Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(listed.json()[0])

    queue = requests.get(
        f"{BASE_URL}/tasks",
        params={"status": "OPEN", "type": "REGISTRATION_ACCEPTANCE"},
        headers=auth_headers("ciz-medewerker"),
        timeout=10,
    )
    assert queue.status_code == 200
    assert any(task["caseId"] == case_id for task in queue.json())
    for task in queue.json():
        Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(task)

    completed = requests.post(
        f"{BASE_URL}/tasks/{listed.json()[0]['taskId']}/complete",
        headers=auth_headers("ciz-medewerker"),
        json={"facts": COMPLETE_FACTS, "registrationOutcome": "ACCEPTED"}, timeout=10,
    )
    assert completed.status_code == 200
    Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(completed.json())

    evaluations = requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", headers=auth_headers("ciz-medewerker"), timeout=10)
    assert evaluations.status_code == 200
    assert len(evaluations.json()) == 1
    Draft202012Validator(schema("PolicyEvaluation"), format_checker=FormatChecker()).validate(evaluations.json()[0])


def test_address_validation_response_matches_contract_via_gateway():
    response = requests.post(
        f"{BASE_URL}/cases/address-validation",
        json={"country": "België", "postalCode": "1000 AA", "houseNumber": "1"},
        timeout=10,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "NOT_SUPPORTED"
    Draft202012Validator(schema("AddressValidationResult"), format_checker=FormatChecker()).validate(response.json())


def test_bpmn_process_exposes_roles_and_wlz_routes():
    root = ET.parse("processes/wlz-aanvraag.bpmn").getroot()
    namespaces = {
        "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
        "operaton": "http://operaton.org/schema/1.0/bpmn",
    }
    process = root.find("bpmn:process", namespaces)
    assert process is not None
    assert process.attrib["id"] == "wlz-aanvraag"
    assert process.attrib[f"{{{namespaces['operaton']}}}historyTimeToLive"] == "180"
    lanes = {lane.attrib["name"]: {
        node.text for node in lane.findall("bpmn:flowNodeRef", namespaces)
    } for lane in process.findall("bpmn:laneSet/bpmn:lane", namespaces)}
    assert "Aanvrager" in lanes
    assert "WP-AO / CIZ-medewerker" in lanes
    assert "WP-Wlz / Beoordelaar" in lanes
    roles = {
        "registerAndCheckApplication": "ciz-medewerker",
        "requestSupplement": "ciz-medewerker",
        "provideSupplement": "aanvrager",
        "triageApplication": "beoordelaar",
        "investigateAndDecide": "beoordelaar",
        "sendOutgoingDecision": "ciz-medewerker",
    }
    for task_id, group in roles.items():
        task = process.find(f"bpmn:userTask[@id='{task_id}']", namespaces)
        assert task is not None
        assert task.attrib[f"{{{namespaces['operaton']}}}candidateGroups"] == group
        assert task_id in set().union(*lanes.values())
    flows = {(flow.attrib["sourceRef"], flow.attrib["targetRef"])
             for flow in process.findall("bpmn:sequenceFlow", namespaces)}
    assert ("applicationReceived", "registerAndCheckApplication") in flows
    assert ("requestSupplement", "provideSupplement") in flows
    assert ("provideSupplement", "registerAndCheckApplication") in flows
    assert ("triageOutcome", "investigateAndDecide") in flows
    assert ("triageOutcome", "sendOutgoingDecision") in flows
    assert ("investigateAndDecide", "sendOutgoingDecision") in flows
    assert ("sendOutgoingDecision", "applicationDecisionReceived") in flows


def test_kong_routes_reach_each_service_and_echo_correlation_id():
    correlation_id = str(uuid.uuid4())
    rules = requests.get(
        f"{GATEWAY_URL}/api/rules/intake-form",
        headers={"X-Correlation-ID": correlation_id}, timeout=10,
    )
    assert rules.status_code == 200
    assert rules.headers["X-Correlation-ID"] == correlation_id

    workflow = requests.get(f"{GATEWAY_URL}/api/workflow/engine", timeout=10)
    assert workflow.status_code == 200

    documents = requests.get(
        f"{GATEWAY_URL}/api/documents", params={"caseId": str(uuid.uuid4())}, timeout=10
    )
    assert documents.status_code == 200
    assert documents.json() == []

    missing_case = requests.get(f"{GATEWAY_URL}/api/cases/{uuid.uuid4()}", timeout=10)
    assert missing_case.status_code == 404
    assert missing_case.headers["Content-Type"].startswith("application/problem+json")
