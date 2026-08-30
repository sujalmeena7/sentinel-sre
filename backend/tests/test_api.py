"""
API integration tests — FastAPI TestClient, no live server needed.

Covers auth, the email-verification gate, multi-tenant isolation, the async
analyze lifecycle, chaos simulation and evaluation. The heavy RAG/LLM pipeline
is stubbed per-test so nothing here touches the network.
"""

import pytest

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


# ─── Health & root ──────────────────────────────────────────────────

@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health(client, path):
    res = client.get(path)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_root_is_reachable(client):
    assert client.get("/").status_code == 200


# ─── Registration ───────────────────────────────────────────────────

def test_register_returns_token_and_one_time_webhook(client):
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "newtenant@example.com", "password": "Passw0rdTest", "name": "New"},
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["access_token"]
    assert body["webhook_token"], "webhook token must be returned exactly once"
    assert body["user"]["email"] == "newtenant@example.com"
    # No mail provider is configured, so verification cannot be enforced.
    assert body["user"]["email_verified"] is True


def test_duplicate_registration_is_rejected(client):
    payload = {"email": "duplicate@example.com", "password": "Passw0rdTest"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 200
    assert client.post("/api/v1/auth/register", json=payload).status_code == 409


@pytest.mark.parametrize(
    "password",
    ["short1A", "nouppercase1", "NOLOWERCASE1", "NoDigitsHere"],
)
def test_weak_passwords_are_rejected(client, password):
    res = client.post(
        "/api/v1/auth/register",
        json={"email": f"weak-{password}@example.com", "password": password},
    )
    assert res.status_code == 422


def test_reserved_tld_emails_are_rejected(client):
    """Documents why the admin account must not live on a `.local` domain."""
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "someone@sentinel.local", "password": "Passw0rdTest"},
    )
    assert res.status_code == 422


# ─── Login ──────────────────────────────────────────────────────────

def test_login_round_trip(client, make_user):
    _, body = make_user()
    email = body["user"]["email"]

    res = client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rdTest"})
    assert res.status_code == 200, res.text
    assert res.json()["access_token"]
    # The webhook token is never re-issued on login.
    assert res.json()["webhook_token"] is None


def test_login_with_wrong_password_is_401(client, make_user):
    _, body = make_user()
    res = client.post(
        "/api/v1/auth/login",
        json={"email": body["user"]["email"], "password": "WrongPassw0rd"},
    )
    assert res.status_code == 401


def test_login_unknown_user_is_401(client):
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@example.com", "password": "Passw0rdTest"},
    )
    assert res.status_code == 401


def test_seeded_admin_can_log_in(client):
    """Regression: the seeded admin used to sit on an unusable `.local` domain."""
    res = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["role"] == "admin"


def test_verification_gate_is_enforced_when_mail_is_configured(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "email_delivery_configured", lambda: True)

    res = client.post(
        "/api/v1/auth/register",
        json={"email": "gated@example.com", "password": "Passw0rdTest"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["email_verified"] is False

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "gated@example.com", "password": "Passw0rdTest"},
    )
    assert res.status_code == 403
    assert "not verified" in res.json()["detail"].lower()


def test_unverified_user_can_log_in_without_a_mail_provider(client):
    """The account created above becomes usable once the gate is off again."""
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "gated@example.com", "password": "Passw0rdTest"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["email_verified"] is True


# ─── Auth enforcement on protected routes ───────────────────────────

@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/incidents"),
        ("get", "/api/v1/evaluation"),
        ("get", "/api/v1/auth/me"),
        ("post", "/api/v1/simulation/trigger"),
        ("post", "/api/v1/incidents/analyze"),
    ],
)
def test_protected_routes_reject_anonymous_callers(client, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    res = getattr(client, method)(path, **kwargs)
    assert res.status_code == 401


def test_garbage_bearer_token_is_rejected(client):
    res = client.get("/api/v1/incidents", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


def test_me_returns_the_current_user(client, make_user):
    headers, body = make_user()
    res = client.get("/api/v1/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == body["user"]["email"]


def test_refresh_issues_a_new_token(client, make_user):
    headers, _ = make_user()
    res = client.post("/api/v1/auth/refresh", headers=headers)
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_webhook_token_rotation(client, make_user):
    headers, body = make_user()
    original = body["webhook_token"]

    res = client.post("/api/v1/auth/rotate-webhook-token", headers=headers)
    assert res.status_code == 200
    rotated = res.json()["webhook_token"]

    assert rotated and rotated != original


# ─── Chaos simulation ───────────────────────────────────────────────

@pytest.mark.parametrize(
    "failure_type",
    ["Memory leak (OOM Kill)", "CPU spike", "DB connection failure", "Latency spike"],
)
def test_chaos_trigger_creates_an_owned_incident(client, make_user, failure_type):
    headers, _ = make_user()

    res = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "payment-api", "failure_type": failure_type, "severity": "severe"},
    )
    assert res.status_code == 200, res.text
    incident_id = res.json()["incident_id"]

    res = client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
    assert res.status_code == 200
    incident = res.json()
    assert incident["service"] == "payment-api"
    assert incident["symptoms"]
    assert incident["signals"]
    assert incident["analysis_status"] == "idle"


def test_incident_feed_only_returns_own_incidents(client, make_user):
    headers_a, _ = make_user()
    headers_b, _ = make_user()

    client.post(
        "/api/v1/simulation/trigger",
        headers=headers_a,
        json={"service": "user-gateway", "failure_type": "CPU spike", "severity": "mild"},
    )

    assert client.get("/api/v1/incidents", headers=headers_b).json() == []
    assert len(client.get("/api/v1/incidents", headers=headers_a).json()) == 1


def test_cross_tenant_access_is_404_not_403(client, make_user):
    """404 avoids leaking that another tenant's incident exists."""
    headers_a, _ = make_user()
    headers_b, _ = make_user()

    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers_a,
        json={"service": "inventory-service", "failure_type": "CPU spike", "severity": "mild"},
    ).json()["incident_id"]

    assert client.get(f"/api/v1/incidents/{incident_id}", headers=headers_b).status_code == 404
    assert client.post(
        "/api/v1/incidents/analyze",
        headers=headers_b,
        json={"incident_id": incident_id, "symptoms": [], "signals": [], "changes": []},
    ).status_code == 404


# ─── Ingest ─────────────────────────────────────────────────────────

def test_manual_ingest_strips_html(client, make_user):
    headers, _ = make_user()
    res = client.post(
        "/api/v1/incidents/ingest",
        headers=headers,
        json={
            "service": "<script>alert(1)</script>evil-service",
            "environment": "production",
            "symptoms": ["<b>High Latency</b>"],
            "signals": [{"metric": "cpu_usage", "value": "97%"}],
        },
    )
    assert res.status_code == 200, res.text

    incident = client.get(f"/api/v1/incidents/{res.json()['incident_id']}", headers=headers).json()
    assert "<script>" not in incident["service"]
    assert incident["symptoms"] == ["High Latency"]


# ─── Async analyze lifecycle ────────────────────────────────────────

def _stub_analysis(app_module, monkeypatch, hypothesis_title="[Rule RULE-002] Memory Leak / OOM Kill"):
    """Replace the RAG/LLM pipeline with a deterministic in-process result."""
    from hybrid_analyzer import Hypothesis, HybridAnalysisResult

    def fake_run(service, symptoms, signals, changes, user_id):
        return HybridAnalysisResult(
            hypotheses=[
                Hypothesis(
                    rank=1,
                    source="rules",
                    title=hypothesis_title,
                    description="stubbed",
                    confidence=90,
                    evidence=["stub"],
                    mitigation="stub",
                    long_term_fix="stub",
                    category="resource",
                )
            ],
            anomaly_report={"overall_score": 1.0, "summary": "stub", "anomalies": [], "error_signals": []},
            similar_incidents=[],
            llm_narrative="stubbed narrative",
            reasoning_chain=["step 1"],
            analysis_breakdown={"Rules Engine": "1 rule matched"},
            rejected_hypotheses=[],
        )

    monkeypatch.setattr(app_module, "run_hybrid_analysis", fake_run)


def test_analyze_completes_and_status_reports_the_result(client, app_module, make_user, monkeypatch):
    _stub_analysis(app_module, monkeypatch)
    headers, _ = make_user()

    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "checkout-ui", "failure_type": "Memory leak (OOM Kill)", "severity": "severe"},
    ).json()["incident_id"]

    res = client.post(
        "/api/v1/incidents/analyze",
        headers=headers,
        json={"incident_id": incident_id, "symptoms": ["OOM Killed"], "signals": [], "changes": []},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "processing"
    assert res.json()["task_id"] == incident_id

    status = _wait_for_status(client, headers, incident_id)
    assert status["status"] == "completed", status
    assert status["result"]["hypotheses"][0]["confidence"] == 90
    assert status["result"]["llm_narrative"] == "stubbed narrative"


def test_analyze_failure_is_recorded(client, app_module, make_user, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("groq exploded")

    monkeypatch.setattr(app_module, "run_hybrid_analysis", boom)
    headers, _ = make_user()

    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "payment-api", "failure_type": "CPU spike", "severity": "mild"},
    ).json()["incident_id"]

    client.post(
        "/api/v1/incidents/analyze",
        headers=headers,
        json={"incident_id": incident_id, "symptoms": [], "signals": [], "changes": []},
    )

    status = _wait_for_status(client, headers, incident_id)
    assert status["status"] == "failed"
    assert "groq exploded" in status["error"]


def test_analyze_rejects_unknown_incident(client, make_user):
    headers, _ = make_user()
    res = client.post(
        "/api/v1/incidents/analyze",
        headers=headers,
        json={"incident_id": "does-not-exist", "symptoms": [], "signals": [], "changes": []},
    )
    assert res.status_code == 404


def test_analyze_get_explains_itself_instead_of_405(client):
    res = client.get("/api/v1/incidents/analyze")
    assert res.status_code == 400
    assert "POST" in res.json()["detail"]


# ─── Feedback & evaluation ──────────────────────────────────────────

def test_feedback_is_recorded(client, make_user):
    headers, _ = make_user()
    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "payment-api", "failure_type": "CPU spike", "severity": "mild"},
    ).json()["incident_id"]

    res = client.post(
        "/api/v1/incidents/feedback",
        headers=headers,
        json={"incident_id": incident_id, "score": 1, "comment": "spot on"},
    )
    assert res.status_code == 200

    incident = client.get(f"/api/v1/incidents/{incident_id}", headers=headers).json()
    assert incident["human_feedback_score"] == 1
    assert incident["human_feedback_count"] == 1


def test_evaluation_scores_predictions_against_expected_cause(client, app_module, make_user, monkeypatch):
    _stub_analysis(app_module, monkeypatch)
    headers, _ = make_user()

    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "checkout-ui", "failure_type": "Memory leak (OOM Kill)", "severity": "severe"},
    ).json()["incident_id"]

    client.post(
        "/api/v1/incidents/analyze",
        headers=headers,
        json={"incident_id": incident_id, "symptoms": [], "signals": [], "changes": []},
    )
    _wait_for_status(client, headers, incident_id)

    res = client.get("/api/v1/evaluation", headers=headers)
    assert res.status_code == 200
    body = res.json()
    # expected_cause "Memory Leak" is contained in the stubbed prediction title.
    assert body["total_tests"] == 1
    assert body["correct_predictions"] == 1
    assert body["accuracy"] == 100.0


# ─── Postmortem ─────────────────────────────────────────────────────

def test_postmortem_degrades_to_a_data_only_document(client, make_user):
    """No LLM key is configured in tests, which used to return HTTP 500."""
    headers, _ = make_user()
    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers,
        json={"service": "payment-api", "failure_type": "Memory leak (OOM Kill)", "severity": "severe"},
    ).json()["incident_id"]

    res = client.post(f"/api/v1/incidents/{incident_id}/postmortem", headers=headers, json={})
    assert res.status_code == 200, res.text

    doc = res.json()["postmortem"]
    assert "Incident Postmortem" in doc
    assert "payment-api" in doc
    assert "without AI narration" in doc
    # The deterministic layers still contribute real content.
    assert "Timeline" in doc and "Ranked Hypotheses" in doc


def test_postmortem_is_tenant_scoped(client, make_user):
    headers_a, _ = make_user()
    headers_b, _ = make_user()
    incident_id = client.post(
        "/api/v1/simulation/trigger",
        headers=headers_a,
        json={"service": "user-gateway", "failure_type": "CPU spike", "severity": "mild"},
    ).json()["incident_id"]

    res = client.post(f"/api/v1/incidents/{incident_id}/postmortem", headers=headers_b, json={})
    assert res.status_code == 404


# ─── Prometheus webhook ─────────────────────────────────────────────

def test_prometheus_webhook_requires_a_valid_token(client):
    res = client.post(
        "/api/v1/telemetry/prometheus/not-a-real-token",
        json={"receiver": "sentinel", "status": "firing", "alerts": []},
    )
    assert res.status_code == 401


def test_prometheus_webhook_creates_an_incident(client, make_user):
    headers, body = make_user()
    token = body["webhook_token"]

    res = client.post(
        f"/api/v1/telemetry/prometheus/{token}",
        json={
            "receiver": "sentinel",
            "status": "firing",
            "alerts": [
                {
                    "status": "firing",
                    "labels": {"service": "payment-api", "alertname": "HighMemory", "severity": "critical"},
                    "annotations": {"summary": "Memory above 95%", "description": "container OOMKilled"},
                }
            ],
        },
    )
    assert res.status_code == 200, res.text

    incidents = client.get("/api/v1/incidents", headers=headers).json()
    assert any(i["service"] == "payment-api" for i in incidents)


def test_rotated_webhook_token_invalidates_the_old_one(client, make_user):
    headers, body = make_user()
    old_token = body["webhook_token"]
    client.post("/api/v1/auth/rotate-webhook-token", headers=headers)

    res = client.post(
        f"/api/v1/telemetry/prometheus/{old_token}",
        json={"receiver": "sentinel", "status": "firing", "alerts": []},
    )
    assert res.status_code == 401


# ─── Helpers ────────────────────────────────────────────────────────

def _wait_for_status(client, headers, incident_id, timeout=15.0):
    """Poll the status endpoint until the background worker settles."""
    import time

    deadline = time.time() + timeout
    payload = None
    while time.time() < deadline:
        res = client.get(f"/api/v1/incidents/analyze/{incident_id}/status", headers=headers)
        assert res.status_code == 200, res.text
        payload = res.json()
        if payload["status"] in {"completed", "failed"}:
            return payload
        time.sleep(0.1)
    raise AssertionError(f"analysis never settled: {payload}")
