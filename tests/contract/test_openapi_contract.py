import os
import copy
import uuid
import xml.etree.ElementTree as ET

import requests
import yaml
from jsonschema import Draft202012Validator, FormatChecker
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT


BASE_URL = os.getenv("CASE_SERVICE_URL", "http://case-service:8080")

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

    def convert_nullable(node):
        if isinstance(node, dict):
            if node.pop("nullable", False) and isinstance(node.get("type"), str):
                node["type"] = [node["type"], "null"]
            for child in node.values():
                convert_nullable(child)
        elif isinstance(node, list):
            for child in node:
                convert_nullable(child)

    convert_nullable(value)
    return value


def test_create_and_get_responses_match_openapi_schema():
    payload = PERSONAL_DATA | {
        "applicantId": f"contract-{uuid.uuid4()}",
        "clientName": "Fictionele Contractcliënt",
        "birthDate": "1975-04-12",
        "permanentCareNeed": True,
        "permanentSupervision": False,
    }
    created = requests.post(f"{BASE_URL}/cases", json=payload, timeout=10)
    assert created.status_code == 201
    Draft202012Validator(schema("Case"), format_checker=FormatChecker()).validate(created.json())

    fetched = requests.get(f"{BASE_URL}/cases/{created.json()['caseId']}", timeout=10)
    assert fetched.status_code == 200
    Draft202012Validator(schema("Case"), format_checker=FormatChecker()).validate(fetched.json())


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


def test_document_and_task_responses_match_openapi_schemas():
    payload = PERSONAL_DATA | {
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
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "aanvraag.pdf", "X-Document-Content-Type": "application/pdf"},
        data=b"%PDF-1.4\nfictional contract document\n%%EOF",
        timeout=10,
    )
    assert registered.status_code == 201
    Draft202012Validator(schema("CaseDocument"), format_checker=FormatChecker()).validate(registered.json())

    listed = requests.get(f"{BASE_URL}/cases/{case_id}/tasks", timeout=10)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["type"] == "APPLICATION_INTAKE"
    Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(listed.json()[0])

    queue = requests.get(
        f"{BASE_URL}/tasks",
        params={"status": "OPEN", "type": "APPLICATION_INTAKE"},
        timeout=10,
    )
    assert queue.status_code == 200
    assert any(task["caseId"] == case_id for task in queue.json())
    for task in queue.json():
        Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(task)

    completed = requests.post(
        f"{BASE_URL}/tasks/{listed.json()[0]['taskId']}/complete",
        json={"facts": COMPLETE_FACTS}, timeout=10,
    )
    assert completed.status_code == 200
    Draft202012Validator(schema("CaseTask"), format_checker=FormatChecker()).validate(completed.json())

    evaluations = requests.get(f"{BASE_URL}/cases/{case_id}/policy-evaluations", timeout=10)
    assert evaluations.status_code == 200
    assert len(evaluations.json()) == 1
    Draft202012Validator(schema("PolicyEvaluation"), format_checker=FormatChecker()).validate(evaluations.json()[0])


def test_bpmn_process_has_intake_before_the_review_transition():
    root = ET.parse("processes/wlz-aanvraag.bpmn").getroot()
    namespaces = {
        "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
        "operaton": "http://operaton.org/schema/1.0/bpmn",
    }
    process = root.find("bpmn:process", namespaces)
    assert process is not None
    assert process.attrib["id"] == "wlz-aanvraag"
    assert process.attrib[f"{{{namespaces['operaton']}}}historyTimeToLive"] == "180"
    intake = process.find("bpmn:userTask[@id='intakeApplication']", namespaces)
    assert intake is not None
    assert intake.attrib["name"] == "Compleetheid beoordelen"
    assert intake.attrib[f"{{{namespaces['operaton']}}}candidateGroups"] == "ciz-medewerker"
    review = process.find("bpmn:userTask[@id='reviewApplication']", namespaces)
    assert review is not None
    assert review.attrib["name"] == "Aanvraag beoordelen"
    assert review.attrib[f"{{{namespaces['operaton']}}}candidateGroups"] == "beoordelaar"
    decision = process.find("bpmn:userTask[@id='registerDecision']", namespaces)
    assert decision is not None
    assert decision.attrib["name"] == "Besluit administratief verwerken"
    assert decision.attrib[f"{{{namespaces['operaton']}}}candidateGroups"] == "ciz-medewerker"
    flows = {(flow.attrib["sourceRef"], flow.attrib["targetRef"])
             for flow in process.findall("bpmn:sequenceFlow", namespaces)}
    assert ("applicationReceived", "intakeApplication") in flows
    assert ("intakeApplication", "completenessGateway") in flows
    assert ("completenessGateway", "reviewApplication") in flows
    assert ("completenessGateway", "collectAdditionalInformation") in flows
    assert ("collectAdditionalInformation", "completenessGateway") in flows
    assert ("reviewApplication", "registerDecision") in flows
    gateway = process.find("bpmn:exclusiveGateway[@id='completenessGateway']", namespaces)
    assert gateway is not None
    assert gateway.attrib["default"] == "Flow_Incomplete"
