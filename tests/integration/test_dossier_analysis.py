"""Fictional data only. Deterministic pipeline simulation is not RobBERT execution."""
import time
import uuid
import requests
from tests.integration.test_case_lifecycle import BASE_URL, create_case, case_tasks
from tests.oidc import auth_headers
from tests.contract.test_openapi_contract import schema
from jsonschema import Draft202012Validator, FormatChecker

def upload(case_id, name):
    r=requests.post(f"{BASE_URL}/cases/{case_id}/documents",headers=auth_headers("ciz-medewerker") | {
        "Content-Type":"application/octet-stream","X-Document-File-Name":name,"X-Document-Content-Type":"application/pdf"},
        data=b"%PDF-1.4\nfictional pipeline test\n%%EOF",timeout=15)
    assert r.status_code==201
    return r.json()["documentId"]

def extract(case_id, doc):
    url=f"{BASE_URL}/cases/{case_id}/documents/{doc}/structuring"
    assert requests.post(url,headers=auth_headers("beoordelaar"),timeout=25).status_code==202
    for _ in range(20):
        r=requests.get(url,headers=auth_headers("beoordelaar"),timeout=25)
        assert r.status_code==200
        if r.json()["status"]=="READY": return r.json()
        time.sleep(.5)
    raise AssertionError("Fictional OCR did not complete")

def test_dossier_analysis_scores_reviews_roles_and_staleness():
    case=create_case(); case_id=case["caseId"]
    url=f"{BASE_URL}/cases/{case_id}/impairment-analyses"
    researcher=auth_headers("beoordelaar"); ao=auth_headers("ciz-medewerker")
    assert requests.post(url,timeout=10).status_code==401
    assert requests.post(url,headers=ao,timeout=10).status_code==403
    assert requests.get(url,headers=ao,timeout=10).status_code==403
    incomplete = requests.post(url,headers=researcher,timeout=10)
    assert incomplete.status_code==409
    first=upload(case_id,"one.pdf"); second=upload(case_id,"two.pdf")
    extract(case_id,first)
    progressing = requests.post(url,headers=researcher,timeout=10)
    assert progressing.status_code in (409,202)  # Receipt processing may already have finished the second PDF.
    extract(case_id,second)
    tasks=case_tasks(case_id)
    started=requests.post(url,headers=researcher,timeout=20)
    assert started.status_code==202
    for _ in range(30):
        r=requests.get(url,headers=researcher,timeout=15)
        assert r.status_code==200
        value=r.json()[0]
        if value["status"]=="READY": break
        assert value["status"]!="FAILED", "Use compose.analysis-test.yaml for contract simulation"
        time.sleep(.5)
    else: raise AssertionError("Analysis did not complete")
    Draft202012Validator(schema("DossierAnalysis"),format_checker=FormatChecker()).validate(value)
    assert value["output"]["mock"] is True
    assert value["output"]["classifierModel"]=="simulation-no-robbert"
    findings=value["output"]["findings"]
    assert {f["sources"][0]["documentId"] for f in findings}=={first,second}
    assert all(f["sources"][0]["pages"]==[1] for f in findings)
    review={"findings":[dict(f,disposition="CONFIRMED") for f in findings]}
    review["findings"][0]["score"]=0;review["findings"][0]["disposition"]="ADJUSTED"
    review["findings"][1]["score"]=None;review["findings"][1]["disposition"]="ADJUSTED"
    review_url=f"{url}/{value['analysisId']}/review"
    assert requests.post(review_url,headers=ao,json=review,timeout=10).status_code==403
    saved=requests.post(review_url,headers=researcher,json=review,timeout=15)
    assert saved.status_code==200
    assert saved.json()["output"]["findings"][0]["score"]==2
    confirmed=saved.json()["reviews"][-1]
    assert confirmed["review"]["findings"][0]["score"]==0
    assert confirmed["review"]["findings"][1]["score"] is None
    assert confirmed["reviewedBy"] and confirmed["reviewedAt"]
    review["findings"][0]["disposition"]="REJECTED"
    assert requests.post(review_url,headers=researcher,json=review,timeout=15).json()["reviews"].__len__()==2
    review["findings"][0]["sources"][0]["documentId"]=str(uuid.uuid4())
    assert requests.post(review_url,headers=researcher,json=review,timeout=15).status_code==400
    assert case_tasks(case_id)==tasks
    assert requests.get(f"{BASE_URL}/cases/{case_id}/medical-assessments",headers=researcher,timeout=10).json()==[]
    upload(case_id,"addition.pdf")
    assert requests.get(url,headers=researcher,timeout=15).json()[0]["stale"] is True
    assert requests.post(review_url,headers=researcher,json=review,timeout=15).status_code==409

def test_submission_channels_do_not_change_applicant_identity():
    from tests.ciz_facts import unique_personal_data
    for channel in ("CLIENT_PORTAL","CARE_PROVIDER","POST"):
        payload=unique_personal_data() | {"applicantId":"fictional-channel","clientName":"Fictief", "birthDate":"1960-02-03",
            "permanentCareNeed":True,"permanentSupervision":True,"submissionChannel":channel}
        if channel=="POST":
            assert requests.post(f"{BASE_URL}/cases",json=payload,timeout=10).status_code==403
            assert requests.post(f"{BASE_URL}/cases",headers=auth_headers("ciz-medewerker"),json=payload,timeout=10).status_code==403
        r=requests.post(f"{BASE_URL}/cases",headers=auth_headers("beoordelaar") if channel=="POST" else {},json=payload,timeout=10)
        assert r.status_code==201
        assert r.json()["application"]["submissionChannel"]==channel
        assert r.json()["application"]["applicantId"]=="fictional-channel"
