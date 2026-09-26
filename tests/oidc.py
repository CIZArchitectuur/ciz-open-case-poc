import os

import requests


TOKEN_URL = os.getenv(
    "OIDC_TEST_TOKEN_URL",
    "http://keycloak:8080/realms/ciz-poc/protocol/openid-connect/token",
)
CLIENT_ID = os.getenv("OIDC_TEST_CLIENT_ID", "ciz-test-harness")
CLIENT_SECRET = os.getenv("OIDC_TEST_CLIENT_SECRET", "test-harness-local-only")
ACCOUNTS = {
    "ciz-medewerker": ("ciz.medewerker", "ciz-test-only"),
    "beoordelaar": ("beoordelaar", "beoordelaar-test-only"),
}


def auth_headers(role):
    username, password = ACCOUNTS[role]
    response = requests.post(TOKEN_URL, data={
        "grant_type": "password",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": username,
        "password": password,
    }, timeout=10)
    assert response.status_code == 200, "Local test identity provider did not issue a test token"
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
