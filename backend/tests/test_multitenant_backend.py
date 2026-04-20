"""Backend tests for Sentinel-SRE multi-tenant SaaS.
Covers: auth (register/login/me), tenant isolation, webhook scoping,
rate limiting, webhook fingerprint dedup, and token rotation.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("SENTINEL_BASE_URL", "http://localhost:8001")


def _uniq_email(prefix="TEST_user"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- AUTH ----------------------------------------------------------

class TestAuth:
    def test_register_returns_jwt_and_webhook_once(self, session):
        body = {"email": _uniq_email(), "password": "Passw0rd!"}
        r = session.post(f"{BASE_URL}/api/v1/auth/register", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["access_token"], str) and data["access_token"]
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == body["email"].lower()
        assert "id" in data["user"]
        assert isinstance(data.get("webhook_token"), str) and len(data["webhook_token"]) > 20

    def test_register_duplicate_email_409(self, session):
        body = {"email": _uniq_email(), "password": "Passw0rd!"}
        assert session.post(f"{BASE_URL}/api/v1/auth/register", json=body).status_code == 200
        r = session.post(f"{BASE_URL}/api/v1/auth/register", json=body)
        assert r.status_code == 409

    def test_login_success_and_wrong_password(self, session):
        email = _uniq_email()
        pw = "Passw0rd!"
        session.post(f"{BASE_URL}/api/v1/auth/register", json={"email": email, "password": pw})
        ok = session.post(f"{BASE_URL}/api/v1/auth/login", json={"email": email, "password": pw})
        assert ok.status_code == 200
        assert "access_token" in ok.json()
        # webhook_token should NOT be returned on login
        assert ok.json().get("webhook_token") is None

        bad = session.post(f"{BASE_URL}/api/v1/auth/login", json={"email": email, "password": "wrong"})
        assert bad.status_code == 401

    def test_me_requires_bearer(self, session):
        r = session.get(f"{BASE_URL}/api/v1/auth/me")
        assert r.status_code == 401
        email = _uniq_email()
        reg = session.post(f"{BASE_URL}/api/v1/auth/register", json={"email": email, "password": "Passw0rd!"}).json()
        r = session.get(f"{BASE_URL}/api/v1/auth/me",
                        headers={"Authorization": f"Bearer {reg['access_token']}"})
        assert r.status_code == 200
        assert r.json()["email"] == email.lower()


# ---- PROTECTED ENDPOINTS 401 --------------------------------------

class TestProtectedEndpointsRequireAuth:
    @pytest.mark.parametrize("method,path,body", [
        ("GET", "/api/v1/incidents", None),
        ("POST", "/api/v1/incidents/ingest", {"service": "s", "environment": "e"}),
        ("POST", "/api/v1/simulation/trigger",
         {"service": "payment-api", "failure_type": "CPU spike", "severity": "severe"}),
        ("POST", "/api/v1/incidents/analyze",
         {"incident_id": "x", "symptoms": [], "signals": []}),
        ("POST", "/api/v1/incidents/feedback", {"incident_id": "x", "score": 1}),
        ("GET", "/api/v1/evaluation", None),
        ("POST", "/api/v1/incidents/x/postmortem", None),
        ("POST", "/api/v1/incidents/x/dispatch", {"destination": "slack"}),
        ("POST", "/api/v1/slack/simulate", {"incident_id": "x", "action": "acknowledge"}),
        ("GET", "/api/v1/chatops/logs", None),
    ])
    def test_endpoint_returns_401_without_token(self, session, method, path, body):
        r = session.request(method, f"{BASE_URL}{path}", json=body)
        assert r.status_code == 401, f"{method} {path} => {r.status_code} {r.text}"


# ---- TENANT ISOLATION ---------------------------------------------

@pytest.fixture(scope="module")
def user_a(session):
    email = _uniq_email("TEST_userA")
    r = session.post(f"{BASE_URL}/api/v1/auth/register",
                     json={"email": email, "password": "Passw0rd!"}).json()
    return {"email": email, "token": r["access_token"], "webhook": r["webhook_token"], "id": r["user"]["id"]}


@pytest.fixture(scope="module")
def user_b(session):
    email = _uniq_email("TEST_userB")
    r = session.post(f"{BASE_URL}/api/v1/auth/register",
                     json={"email": email, "password": "Passw0rd!"}).json()
    return {"email": email, "token": r["access_token"], "webhook": r["webhook_token"], "id": r["user"]["id"]}


class TestTenantIsolation:
    def test_simulation_visible_only_to_owner(self, session, user_a, user_b):
        # userA triggers a simulation
        hA = {"Authorization": f"Bearer {user_a['token']}"}
        hB = {"Authorization": f"Bearer {user_b['token']}"}
        r = session.post(f"{BASE_URL}/api/v1/simulation/trigger",
                         headers=hA,
                         json={"service": "payment-api",
                               "failure_type": "CPU spike",
                               "severity": "severe"})
        assert r.status_code == 200, r.text
        inc_id = r.json()["incident_id"]
        assert inc_id

        # userA sees exactly 1 incident
        la = session.get(f"{BASE_URL}/api/v1/incidents", headers=hA)
        assert la.status_code == 200
        a_ids = [i["id"] for i in la.json()]
        assert inc_id in a_ids
        assert len(a_ids) == 1

        # userB sees 0
        lb = session.get(f"{BASE_URL}/api/v1/incidents", headers=hB)
        assert lb.status_code == 200
        assert lb.json() == []

    def test_webhook_scoping_and_bad_token(self, session, user_a, user_b):
        hA = {"Authorization": f"Bearer {user_a['token']}"}
        hB = {"Authorization": f"Bearer {user_b['token']}"}

        payload = {
            "receiver": "test",
            "status": "firing",
            "alerts": [{
                "status": "firing",
                "labels": {"service": "auth-svc", "alertname": "HighCPU",
                           "severity": "critical"},
                "annotations": {"summary": "cpu", "description": "boom"},
            }],
        }
        r = session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/{user_a['webhook']}",
                         json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["incidents_processed"]

        # userA sees an auth-svc incident
        la = session.get(f"{BASE_URL}/api/v1/incidents", headers=hA)
        assert any(i["service"] == "auth-svc" for i in la.json())
        # userB does NOT
        lb = session.get(f"{BASE_URL}/api/v1/incidents", headers=hB)
        assert not any(i["service"] == "auth-svc" for i in lb.json())

        # bad token => 401
        bad = session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/nope-bad-token",
                           json=payload)
        assert bad.status_code == 401


# ---- WEBHOOK FINGERPRINT ------------------------------------------

class TestWebhookFingerprint:
    def test_same_service_alertname_different_severity_creates_two(self, session):
        # fresh user to isolate
        email = _uniq_email("TEST_fp")
        reg = session.post(f"{BASE_URL}/api/v1/auth/register",
                           json={"email": email, "password": "Passw0rd!"}).json()
        tok = reg["webhook_token"]
        auth = {"Authorization": f"Bearer {reg['access_token']}"}

        def mk(sev):
            return {"receiver": "t", "status": "firing",
                    "alerts": [{"status": "firing",
                                "labels": {"service": "orders-svc",
                                           "alertname": "HighCPU",
                                           "severity": sev},
                                "annotations": {"summary": f"cpu {sev}", "description": "x"}}]}

        r1 = session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/{tok}", json=mk("critical"))
        r2 = session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/{tok}", json=mk("warning"))
        assert r1.status_code == 200 and r2.status_code == 200
        id1 = r1.json()["incidents_processed"][0]
        id2 = r2.json()["incidents_processed"][0]
        assert id1 != id2, "Different severities must create separate incidents"

        incs = session.get(f"{BASE_URL}/api/v1/incidents", headers=auth).json()
        orders = [i for i in incs if i["service"] == "orders-svc"]
        assert len(orders) == 2


# ---- ROTATE WEBHOOK TOKEN ------------------------------------------

class TestRotateWebhookToken:
    def test_rotate_invalidates_old_token(self, session):
        email = _uniq_email("TEST_rot")
        reg = session.post(f"{BASE_URL}/api/v1/auth/register",
                           json={"email": email, "password": "Passw0rd!"}).json()
        old = reg["webhook_token"]
        auth = {"Authorization": f"Bearer {reg['access_token']}"}

        rot = session.post(f"{BASE_URL}/api/v1/auth/rotate-webhook-token", headers=auth)
        assert rot.status_code == 200, rot.text
        new = rot.json()["webhook_token"]
        assert new and new != old

        payload = {"receiver": "t", "status": "firing",
                   "alerts": [{"status": "firing",
                               "labels": {"service": "s", "alertname": "A", "severity": "warning"},
                               "annotations": {}}]}
        # old token must now fail
        assert session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/{old}",
                            json=payload).status_code == 401
        # new token works
        assert session.post(f"{BASE_URL}/api/v1/telemetry/prometheus/{new}",
                            json=payload).status_code == 200


# ---- RATE LIMIT (run last) -----------------------------------------

class TestRateLimit:
    def test_register_rate_limit_triggers_429(self, session):
        # 10/minute per IP — do 12 and expect at least one 429
        statuses = []
        for _ in range(12):
            r = session.post(f"{BASE_URL}/api/v1/auth/register",
                             json={"email": _uniq_email("TEST_rl"), "password": "Passw0rd!"})
            statuses.append(r.status_code)
        assert 429 in statuses, f"Expected 429 in {statuses}"
