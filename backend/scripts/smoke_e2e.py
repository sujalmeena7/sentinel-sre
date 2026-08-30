"""One-shot end-to-end probe against a running backend.

Reads credentials from backend/.env and prints outcomes only — never secrets.
Not part of the pytest suite (this one deliberately hits the real LLM).

Targets localhost by default. Pass a base origin to probe a deployed instance:

    python scripts/smoke_e2e.py https://sentinel-backend-box9.onrender.com

The deployed admin password is whatever ADMIN_PASSWORD is set to on the host,
which may differ from the local .env — override with SMOKE_PASSWORD if so.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ORIGIN = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
BASE = f"{ORIGIN}/api/v1"
ENV = Path(__file__).resolve().parent.parent / ".env"


def load_env():
    creds = {}
    for line in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        creds[key.strip()] = value.split("#")[0].strip()
    return creds


def call(method, path, payload=None, token=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        return exc.code, body


def main():
    env = load_env()
    email = os.getenv("SMOKE_EMAIL") or env.get("ADMIN_EMAIL")
    password = os.getenv("SMOKE_PASSWORD") or env.get("ADMIN_PASSWORD")
    if not email or not password:
        sys.exit("ADMIN_EMAIL / ADMIN_PASSWORD missing from .env")

    print(f"    target                 : {ORIGIN}")

    status, body = call("POST", "/auth/login", {"email": email, "password": password})
    print(f"[1] admin login            -> {status} verified={body['user']['email_verified'] if status == 200 else body}")
    if status != 200:
        sys.exit(1)
    token = body["access_token"]

    status, body = call("GET", "/incidents", token=token)
    print(f"[2] incident feed          -> {status} count={len(body) if status == 200 else body}")

    status, body = call(
        "POST",
        "/simulation/trigger",
        {"service": "checkout-ui", "failure_type": "Memory leak (OOM Kill)", "severity": "severe"},
        token,
    )
    print(f"[3] chaos trigger          -> {status}")
    if status != 200:
        sys.exit(1)
    incident_id = body["incident_id"]

    status, incident = call("GET", f"/incidents/{incident_id}", token=token)
    metrics = [s for s in incident["signals"] if "metric" in s]
    print(f"[4] incident stored        -> {status} symptoms={len(incident['symptoms'])} metric_signals={len(metrics)}")

    status, body = call(
        "POST",
        "/incidents/analyze",
        {
            "incident_id": incident_id,
            "symptoms": incident["symptoms"],
            "signals": incident["signals"],
            "changes": incident["changes"],
        },
        token,
    )
    print(f"[5] analyze accepted       -> {status} state={body.get('status') if status == 200 else body}")
    if status != 200:
        sys.exit(1)

    deadline = time.time() + 180
    state = None
    while time.time() < deadline:
        status, body = call("GET", f"/incidents/analyze/{incident_id}/status", token=token)
        state = body.get("status")
        if state in {"completed", "failed"}:
            break
        time.sleep(2)

    print(f"[6] analysis settled       -> {state}")
    if state != "completed":
        print(f"    error: {body.get('error')}")
        sys.exit(1)

    result = body["result"]
    anomalies = result["anomaly_report"]["anomalies"]
    top = result["hypotheses"][0]
    print(f"    anomalies scored       : {len(anomalies)}")
    for a in anomalies:
        print(f"      - {a['metric']}={a['value']} z={a['z_score']} {a['severity']}")
    print(f"    overall anomaly score  : {result['anomaly_report']['overall_score']}")
    print(f"    top hypothesis         : [{top['confidence']}%] {top['title']}")
    print(f"    reasoning steps        : {len(result['reasoning_chain'])}")
    print(f"    narrative chars        : {len(result['llm_narrative'] or '')}")
    print(f"    rejected hypotheses    : {len(result.get('rejected_hypotheses') or [])}")

    status, body = call("POST", f"/incidents/{incident_id}/postmortem", {}, token)
    doc = (body or {}).get("postmortem", "") if status == 200 else ""
    print(f"[7] postmortem             -> {status} chars={len(doc)}")

    status, body = call("POST", "/incidents/feedback", {"incident_id": incident_id, "score": 1}, token)
    print(f"[8] feedback               -> {status}")

    status, body = call("GET", "/evaluation", token=token)
    print(f"[9] evaluation             -> {status} accuracy={body.get('accuracy')}% "
          f"({body.get('correct_predictions')}/{body.get('total_tests')})")


if __name__ == "__main__":
    main()
