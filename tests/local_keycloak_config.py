"""Apply only the version-controlled audit-subject mapper to an existing LOCAL realm."""
import json
import os
from pathlib import Path
import requests

base = os.getenv("LOCAL_KEYCLOAK_URL", "http://keycloak:8080")
response = requests.post(base+"/realms/master/protocol/openid-connect/token",
    data={"client_id":"admin-cli", "grant_type":"password",
          "username":os.getenv("LOCAL_KEYCLOAK_ADMIN", "admin"),
          "password":os.getenv("LOCAL_KEYCLOAK_PASSWORD", "admin-local-only")}, timeout=10)
if response.status_code != 200:
    raise SystemExit("Local Keycloak configuration login failed")
headers = {"Authorization":"Bearer "+response.json()["access_token"]}
api = base+"/admin/realms/ciz-poc"
scopes = requests.get(api+"/client-scopes",headers=headers,timeout=10)
if scopes.status_code != 200:
    raise SystemExit("Cannot read local client scopes")
scope = next(scope for scope in scopes.json() if scope["name"]=="ciz-api-audience")
spec = json.loads(Path("/realm/ciz-poc-realm.json").read_text())
mapper = next(m for s in spec["clientScopes"] if s["name"]=="ciz-api-audience"
              for m in s["protocolMappers"] if m["protocolMapper"]=="oidc-sub-mapper")
path = api+"/client-scopes/"+scope["id"]+"/protocol-mappers/models"
existing = requests.get(path,headers=headers,timeout=10)
if existing.status_code != 200:
    raise SystemExit("Cannot read local mappers")
if not any(m["protocolMapper"]=="oidc-sub-mapper" for m in existing.json()):
    saved = requests.post(path,headers=headers,json=mapper,timeout=10)
    if saved.status_code != 201:
        raise SystemExit("Cannot apply local audit mapper")
print("Local audit-subject configuration is present. Sign in again to obtain updated claims.")
