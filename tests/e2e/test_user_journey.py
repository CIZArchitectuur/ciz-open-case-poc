import os
import re
import uuid
from urllib.parse import urljoin

import requests
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://frontend:8080")

COMPLETE_FACTS = COMPLETE_CIZ_FACTS


def test_frontend_and_proxied_case_journey_are_available():
    page = requests.get(FRONTEND_URL, timeout=10)
    assert page.status_code == 200
    assert "CIZ Open Case PoC" in page.text
    for route in ("aanvrager", "beoordelaar", "ciz-medewerker"):
        routed_page = requests.get(f"{FRONTEND_URL}/{route}", timeout=10)
        assert routed_page.status_code == 200
        assert "CIZ Open Case PoC" in routed_page.text
    script_path = re.search(r'src="([^"]+\.js)"', page.text).group(1)
    application = requests.get(urljoin(f"{FRONTEND_URL}/", script_path), timeout=10)
    assert application.status_code == 200
    assert "Aanvrager" in application.text
    assert "Beoordelaar" in application.text
    assert "CIZ-medewerker" in application.text
    assert "Compleetheid beoordelen" in application.text
    assert "Document registreren" in application.text
    assert "Compleetheid toetsen" in application.text
    assert "Aanvullende informatie" in application.text
    assert "RegelRecht" in application.text
    assert "Controle volgens actueel beleid" in application.text
    assert "policyVersion" in application.text
    assert "Ontvangen stukken worden door een CIZ-medewerker" in application.text
    assert "Medische beoordeling vastleggen" in application.text
    assert "Besluit verwerken" in application.text

    payload = PERSONAL_DATA | {
        "applicantId": f"e2e-{uuid.uuid4()}",
        "clientName": "Fictionele E2E-cliënt",
        "birthDate": "1991-08-25",
        "permanentCareNeed": False,
        "permanentSupervision": True,
    }
    created = requests.post(f"{FRONTEND_URL}/cases", json=payload, timeout=10)
    assert created.status_code == 201
    fetched = requests.get(f"{FRONTEND_URL}/cases/{created.json()['caseId']}", timeout=10)
    assert fetched.status_code == 200
    assert fetched.json()["clientName"] == payload["clientName"]

    case_id = created.json()["caseId"]
    registered = requests.post(
        f"{FRONTEND_URL}/cases/{case_id}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "e2e-bijlage.pdf", "X-Document-Content-Type": "application/pdf"},
        data=b"%PDF-1.4\nfictional e2e document\n%%EOF",
        timeout=10,
    )
    assert registered.status_code == 201
    downloaded = requests.get(
        f"{FRONTEND_URL}/cases/{case_id}/documents/{registered.json()['documentId']}/content",
        timeout=10,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4\nfictional e2e document\n%%EOF"

    tasks = requests.get(f"{FRONTEND_URL}/cases/{case_id}/tasks", timeout=10)
    assert tasks.status_code == 200
    assert tasks.json()[0]["type"] == "APPLICATION_INTAKE"
    intake = requests.post(
        f"{FRONTEND_URL}/tasks/{tasks.json()[0]['taskId']}/complete",
        json={"facts": COMPLETE_FACTS}, timeout=10,
    )
    assert intake.status_code == 200
    assert intake.json()["status"] == "COMPLETED"

    after_intake = requests.get(f"{FRONTEND_URL}/cases/{case_id}/tasks", timeout=10).json()
    review_task = next(task for task in after_intake if task["type"] == "APPLICATION_REVIEW")
    assessment_form = requests.get(
        f"{FRONTEND_URL}/tasks/{review_task['taskId']}/medical-assessment-form", timeout=10
    )
    assert assessment_form.status_code == 200
    review = requests.post(
        f"{FRONTEND_URL}/tasks/{review_task['taskId']}/complete",
        json={"facts": POSITIVE_MEDICAL_ASSESSMENT}, timeout=10,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "COMPLETED"

    assessments = requests.get(f"{FRONTEND_URL}/cases/{case_id}/medical-assessments", timeout=10)
    assert assessments.status_code == 200
    assert assessments.json()[-1]["criteriaMet"] is True

    after_review = requests.get(f"{FRONTEND_URL}/cases/{case_id}/tasks", timeout=10).json()
    decision = next(task for task in after_review if task["type"] == "DECISION_REGISTRATION")
    completed = requests.post(f"{FRONTEND_URL}/tasks/{decision['taskId']}/complete", json={}, timeout=10)
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"
