import os
import re
import uuid
from urllib.parse import urljoin

import requests
from tests.ciz_facts import COMPLETE_CIZ_FACTS, PERSONAL_DATA, POSITIVE_MEDICAL_ASSESSMENT, unique_personal_data
from tests.oidc import auth_headers


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://frontend:8080")

COMPLETE_FACTS = COMPLETE_CIZ_FACTS


def test_frontend_and_proxied_case_journey_are_available():
    page = requests.get(FRONTEND_URL, timeout=10)
    assert page.status_code == 200
    assert "CIZ Open Case PoC" in page.text
    anonymous_queue = requests.get(f"{FRONTEND_URL}/api/tasks", timeout=10)
    assert anonymous_queue.status_code == 401
    for internal_path in ("workflow/engine", "rules/intake-form", "documents"):
        assert requests.get(f"{FRONTEND_URL}/api/{internal_path}", timeout=10).status_code == 404
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
    assert "Registreren en controleren" in application.text
    assert "Document registreren" in application.text
    assert "Registratie vastleggen" in application.text
    assert "Aanvulling opvragen" in application.text
    assert "Aanvulling versturen" in application.text
    assert "Uitkomst triage" in application.text
    assert "Onderzoek en besluitvorming Wlz" in application.text
    assert "Beslissing verzenden" in application.text
    assert "RegelRecht" in application.text
    assert "Controle volgens actueel beleid" in application.text
    assert "policyVersion" in application.text
    assert "Aanvulling van de aanvrager ontvangen" in application.text
    assert "Onderzoek en besluit vastleggen" in application.text
    assert "Verzending vastleggen" in application.text
    assert "Persoonlijke gegevens" in application.text
    assert "Controleer uw aanvraag" in application.text
    assert "Ondertekening en vertegenwoordiging" in application.text
    assert "Wie doet de aanvraag?" in application.text
    assert "Uit aanvraag — controleer" in application.text
    assert "Uit zorgvraag — valideer" in application.text
    assert "Controleer postcode en huisnummer" in application.text

    address_check = requests.post(
        f"{FRONTEND_URL}/api/cases/address-validation",
        json={"country": "België", "postalCode": "1000 AA", "houseNumber": "1"},
        timeout=10,
    )
    assert address_check.status_code == 200
    assert address_check.json()["status"] == "NOT_SUPPORTED"

    payload = unique_personal_data() | {
        "applicantId": f"e2e-{uuid.uuid4()}",
        "clientName": "Fictionele E2E-cliënt",
        "birthDate": "1991-08-25",
        "permanentCareNeed": False,
        "permanentSupervision": True,
    }
    created = requests.post(f"{FRONTEND_URL}/api/cases", json=payload, timeout=10)
    assert created.status_code == 201
    fetched = requests.get(f"{FRONTEND_URL}/api/cases/{created.json()['caseId']}", timeout=10)
    assert fetched.status_code == 200
    assert fetched.json()["person"]["clientName"] == payload["clientName"]

    case_id = created.json()["caseId"]
    registered = requests.post(
        f"{FRONTEND_URL}/api/cases/{case_id}/documents",
        headers={"Content-Type": "application/octet-stream", "X-Document-File-Name": "e2e-bijlage.pdf", "X-Document-Content-Type": "application/pdf", **auth_headers("ciz-medewerker")},
        data=b"%PDF-1.4\nfictional e2e document\n%%EOF",
        timeout=10,
    )
    assert registered.status_code == 201
    downloaded = requests.get(
        f"{FRONTEND_URL}/api/cases/{case_id}/documents/{registered.json()['documentId']}/content",
        headers=auth_headers("ciz-medewerker"),
        timeout=10,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4\nfictional e2e document\n%%EOF"

    tasks = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}/tasks", timeout=10)
    assert tasks.status_code == 200
    assert tasks.json()[0]["type"] == "REGISTRATION_ACCEPTANCE"
    intake = requests.post(
        f"{FRONTEND_URL}/api/tasks/{tasks.json()[0]['taskId']}/complete",
        headers=auth_headers("ciz-medewerker"),
        json={"facts": COMPLETE_FACTS, "registrationOutcome": "ACCEPTED"}, timeout=10,
    )
    assert intake.status_code == 200
    assert intake.json()["status"] == "COMPLETED"

    after_intake = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}/tasks", timeout=10).json()
    triage_task = next(task for task in after_intake if task["type"] == "TRIAGE")
    triage = requests.post(f"{FRONTEND_URL}/api/tasks/{triage_task['taskId']}/complete", headers=auth_headers("beoordelaar"),
                           json={"triageOutcome": "FURTHER_INVESTIGATION"}, timeout=10)
    assert triage.status_code == 200
    after_triage = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}/tasks", timeout=10).json()
    review_task = next(task for task in after_triage if task["type"] == "WLZ_INVESTIGATION_DECISION")
    assessment_form = requests.get(
        f"{FRONTEND_URL}/api/tasks/{review_task['taskId']}/medical-assessment-form", headers=auth_headers("beoordelaar"), timeout=10
    )
    assert assessment_form.status_code == 200
    review = requests.post(
        f"{FRONTEND_URL}/api/tasks/{review_task['taskId']}/complete",
        headers=auth_headers("beoordelaar"),
        json={"facts": POSITIVE_MEDICAL_ASSESSMENT, "decisionResult": "GRANTED",
              "decisionMotivation": "E2E-test van de uitkomst."}, timeout=10,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "COMPLETED"

    assessments = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}/medical-assessments", headers=auth_headers("beoordelaar"), timeout=10)
    assert assessments.status_code == 200
    assert assessments.json()[-1]["criteriaMet"] is True

    after_review = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}/tasks", timeout=10).json()
    decision = next(task for task in after_review if task["type"] == "OUTGOING_COMMUNICATION")
    completed = requests.post(f"{FRONTEND_URL}/api/tasks/{decision['taskId']}/complete", headers=auth_headers("ciz-medewerker"), json={}, timeout=10)
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"
    final = requests.get(f"{FRONTEND_URL}/api/cases/{case_id}", timeout=10).json()
    assert final["application"]["decisionSentAt"]
