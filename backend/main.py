
import os
import asyncio
import logging
import re
import httpx
import concurrent.futures
from urllib.parse import urlparse
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import hmac
import hashlib
import json
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
from models import Incident, User
from database import init_db, get_session, engine
from rag_engine import add_incident_to_index, query_similar_incidents, generate_hypothesis, update_incident_in_index
from hybrid_analyzer import run_hybrid_analysis
from data_generator import generate_deterministic_incident
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    generate_webhook_token,
    hash_webhook_token,
    get_current_user,
    get_user_by_webhook_token,
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
app = FastAPI(title="AI Root Cause Analyzer", version="0.3.0")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )

allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*").strip()
if not allowed_origins_raw or allowed_origins_raw == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
    if not allowed_origins:
        allowed_origins = ["*"]

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IncidentIngest(BaseModel):
    id: Optional[str] = None
    service: str
    environment: str
    start_time: Optional[str] = None
    peak_time: Optional[str] = None
    resolved_time: Optional[str] = None
    symptoms: List[str] = []
    signals: List[dict] = []
    changes: List[dict] = []
    root_cause: Optional[str] = None
    fixes_applied: List[str] = []
    runbook_refs: List[str] = []


def parse_dt(val: Optional[str]) -> Optional[datetime]:
    if val:
        return datetime.fromisoformat(val)
    return None


security = HTTPBearer()


def verify_telemetry_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    expected_token = os.getenv("TELEMETRY_SECRET_TOKEN", "change-me-in-production")
    if credentials.credentials != expected_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid telemetry authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


class PrometheusAlert(BaseModel):
    status: str
    labels: Dict[str, str] = {}
    annotations: Dict[str, str] = {}
    startsAt: Optional[str] = None
    endsAt: Optional[str] = None


class PrometheusPayload(BaseModel):
    receiver: str
    status: str
    alerts: List[PrometheusAlert] = []


@app.on_event("startup")
def on_startup():
    init_db()
    _seed_admin_and_backfill()


def _seed_admin_and_backfill() -> None:
    admin_email = os.getenv("ADMIN_EMAIL", "admin@sentinel.local").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")

    with Session(engine) as session:
        admin = session.exec(select(User).where(User.email == admin_email)).first()
        if admin is None:
            raw_webhook = generate_webhook_token()
            admin = User(
                email=admin_email,
                password_hash=hash_password(admin_password),
                webhook_token_hash=hash_webhook_token(raw_webhook),
                role="admin",
                name="Admin",
            )
            session.add(admin)
            session.commit()
            session.refresh(admin)
            logger.info(f"Admin user seeded: {admin_email}")
            logger.info(
                f"Admin webhook token (save this - shown once):\n   {raw_webhook}\n"
                f"   Use it at POST /api/v1/telemetry/prometheus/{raw_webhook}"
            )
        else:
            if not verify_password(admin_password, admin.password_hash):
                admin.password_hash = hash_password(admin_password)
                session.add(admin)
                session.commit()
                logger.info("Admin password hash refreshed from env.")

        orphan_count = session.exec(
            select(Incident).where(Incident.user_id == None)  # noqa: E711
        ).all()
        if orphan_count:
            for inc in orphan_count:
                inc.user_id = admin.id
                session.add(inc)
            session.commit()
            logger.info(f"Backfilled {len(orphan_count)} legacy incidents -> admin.")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Root Cause Analyzer API v0.3.0 - Multi-Tenant SaaS"}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]
    webhook_token: Optional[str] = None


def _public_user(user: User, webhook_token: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@app.post("/api/v1/auth/register", response_model=AuthResponse)
@limiter.limit("10/minute")
def register(request: Request, body: RegisterRequest, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    raw_webhook = generate_webhook_token()
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        webhook_token_hash=hash_webhook_token(raw_webhook),
        name=body.name,
        role="user",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(user.id, user.email)
    logger.info(f"User registered: {email}")
    return AuthResponse(
        access_token=token,
        user=_public_user(user),
        webhook_token=raw_webhook,
    )


@app.post("/api/v1/auth/login", response_model=AuthResponse)
@limiter.limit("20/minute")
def login(request: Request, body: LoginRequest, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id, user.email)
    logger.info(f"Login: {email}")
    return AuthResponse(access_token=token, user=_public_user(user))


@app.get("/api/v1/auth/me")
def read_me(current_user: User = Depends(get_current_user)):
    return _public_user(current_user)


@app.post("/api/v1/auth/rotate-webhook-token", response_model=AuthResponse)
def rotate_webhook_token(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    raw = generate_webhook_token()
    current_user.webhook_token_hash = hash_webhook_token(raw)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    token = create_access_token(current_user.id, current_user.email)
    return AuthResponse(access_token=token, user=_public_user(current_user), webhook_token=raw)


def process_incident_background(incident: Incident):
    try:
        add_incident_to_index(incident)
        logger.info(f"Incident {incident.id} indexed into ChromaDB.")
    except Exception as e:
        logger.error(f"Failed to index incident {incident.id}: {e}")


@app.post("/api/v1/incidents/ingest", response_model=Dict[str, Any])
def ingest_incident(
    payload: IncidentIngest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = Incident(
        id=payload.id or str(uuid4()),
        user_id=current_user.id,
        service=payload.service,
        environment=payload.environment,
        start_time=parse_dt(payload.start_time) or datetime.now(timezone.utc),
        peak_time=parse_dt(payload.peak_time),
        resolved_time=parse_dt(payload.resolved_time),
        symptoms=payload.symptoms,
        signals=payload.signals,
        changes=payload.changes,
        root_cause=payload.root_cause,
        fixes_applied=payload.fixes_applied,
        runbook_refs=payload.runbook_refs,
    )

    session.add(incident)
    session.commit()
    session.refresh(incident)

    asyncio.create_task(asyncio.to_thread(process_incident_background, incident))

    return {"status": "accepted", "incident_id": str(incident.id)}


@app.post("/api/v1/telemetry/prometheus/{webhook_token}", response_model=Dict[str, Any])
@limiter.limit("120/minute")
def ingest_prometheus_alerts(
    request: Request,
    webhook_token: str,
    payload: PrometheusPayload,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    owner = get_user_by_webhook_token(webhook_token, session)
    if not owner:
        raise HTTPException(status_code=401, detail="Invalid webhook token")

    logger.info(f"Prometheus webhook for user={owner.email} with {len(payload.alerts)} alerts")

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    processed = []

    firing_alerts_by_fingerprint = {}
    resolved_alerts = []

    for alert in payload.alerts:
        service = alert.labels.get("service") or alert.labels.get("job") or "unknown-service"
        alertname = alert.labels.get("alertname", "unknown")

        raw_sev = alert.labels.get("severity", "unknown").lower()
        if raw_sev in ["critical", "fatal", "page", "emergency"]:
            sev = "severe"
        elif raw_sev in ["warning", "warn", "high"]:
            sev = "moderate"
        else:
            sev = "low"

        alert.labels["mapped_severity"] = sev
        fingerprint = f"{service}::{alertname}::{sev}"

        if alert.status == "resolved":
            resolved_alerts.append((service, alertname))
        else:
            if fingerprint not in firing_alerts_by_fingerprint:
                firing_alerts_by_fingerprint[fingerprint] = []
            firing_alerts_by_fingerprint[fingerprint].append((service, alertname, alert))

    for service, alertname in resolved_alerts:
        open_incidents = session.exec(
            select(Incident)
            .where(Incident.user_id == owner.id)
            .where(Incident.service == service)
            .where(Incident.resolved_time == None)  # noqa: E711
        ).all()
        for inc in open_incidents:
            has_alert = any(sig.get("metric") == alertname for sig in (inc.signals or []))
            if has_alert:
                inc.resolved_time = now
                session.add(inc)
                processed.append(str(inc.id))
                logger.info(f"Resolved incident {inc.id} for {service} due to resolved alert")
    session.commit()

    for fingerprint, data_list in firing_alerts_by_fingerprint.items():
        service = data_list[0][0]
        alertname = data_list[0][1]
        alerts = [item[2] for item in data_list]
        current_sev = fingerprint.rsplit("::", 1)[-1]

        open_incidents = session.exec(
            select(Incident)
            .where(Incident.user_id == owner.id)
            .where(Incident.service == service)
            .where(Incident.resolved_time == None)  # noqa: E711
            .where(Incident.start_time >= cutoff)
            .order_by(Incident.start_time.desc())
        ).all()

        recent_incident = next(
            (
                inc for inc in open_incidents
                if any(
                    sig.get("metric") == alertname
                    and sig.get("signal_severity") == current_sev
                    for sig in (inc.signals or [])
                )
            ),
            None,
        )

        new_symptoms = [a.annotations.get("summary", a.labels.get("alertname", "Unknown Alert")) for a in alerts]
        new_signals = [{
            "metric": a.labels.get("alertname", "alert"),
            "log": a.annotations.get("description", ""),
            "status": a.status,
            "signal_severity": a.labels.get("mapped_severity", "low")
        } for a in alerts]

        if recent_incident:
            current_symptoms = list(recent_incident.symptoms) if recent_incident.symptoms else []
            for s in new_symptoms:
                if s not in current_symptoms:
                    current_symptoms.append(s)
            recent_incident.symptoms = current_symptoms

            current_signals = list(recent_incident.signals) if recent_incident.signals else []
            current_signals.extend(new_signals)
            recent_incident.signals = current_signals

            session.add(recent_incident)
            session.commit()
            processed.append(str(recent_incident.id))
            logger.info(f"Appended alerts to incident {recent_incident.id} with fingerprint {fingerprint}")
        else:
            env = alerts[0].labels.get("environment", "production")
            incident = Incident(
                id=str(uuid4()),
                user_id=owner.id,
                service=service,
                environment=env,
                start_time=now,
                symptoms=new_symptoms,
                signals=new_signals
            )
            session.add(incident)
            session.commit()
            session.refresh(incident)
            asyncio.create_task(asyncio.to_thread(process_incident_background, incident))
            processed.append(str(incident.id))
            logger.info(f"Created new incident {incident.id} for fingerprint {fingerprint}")

    return {"status": "accepted", "incidents_processed": processed}


class AnalyzeRequest(BaseModel):
    incident_id: str
    symptoms: List[str]
    signals: List[Union[str, Dict[str, Any]]]
    changes: List[Union[str, Dict[str, Any]]] = []


def _serialize_analysis_result(result) -> Dict[str, Any]:
    """Convert HybridAnalysisResult dataclass into the JSON dict shape
    the frontend already consumes (matches the previous inline response)."""
    import dataclasses
    return {
        "hypotheses": [dataclasses.asdict(h) for h in result.hypotheses],
        "anomaly_report": result.anomaly_report,
        "similar_historic_incidents": result.similar_incidents,
        "llm_narrative": result.llm_narrative,
        "reasoning_chain": result.reasoning_chain,
        "analysis_breakdown": result.analysis_breakdown,
        "rejected_hypotheses": result.rejected_hypotheses,
    }


def run_analysis_task(
    incident_id: str,
    symptoms: List[str],
    signals: List[Any],
    changes: List[Any],
    user_id: str,
) -> None:
    """Background task - runs the heavy RAG + LLM pipeline OUTSIDE the request/response cycle."""
    import traceback
    service = "unknown"
    expected_cause = None
    
    # Briefly fetch required fields to avoid holding a DB connection for 60+ seconds
    with Session(engine) as session:
        incident = session.get(Incident, incident_id)
        if not incident:
            logger.error(f"[bg-analyze] Incident {incident_id} vanished before analysis")
            return
        service = incident.service
        expected_cause = incident.expected_cause
        
    try:
        # Run heavy ML operations completely detached from DB locks/connections
        result = run_hybrid_analysis(
            service, symptoms, signals, changes, user_id
        )
        payload = _serialize_analysis_result(result)
        
        predicted = "Unknown"
        is_correct = False
        if expected_cause:
            predicted = result.hypotheses[0].title if result.hypotheses else "Unknown"
            is_correct = expected_cause.lower() in predicted.lower()

        # Re-acquire DB connection only briefly to save results
        with Session(engine) as session:
            incident = session.get(Incident, incident_id)
            if incident:
                incident.predicted_cause = predicted
                if expected_cause:
                    incident.is_correct = is_correct
                incident.analysis_result = payload
                incident.analysis_status = "completed"
                incident.analysis_error = None
                session.add(incident)
                session.commit()
            logger.info(f"[bg-analyze] Analysis completed for {incident_id}")
            
    except Exception as e:
        logger.error(f"[bg-analyze] Analysis failed for {incident_id}: {traceback.format_exc()}")
        with Session(engine) as session:
            incident = session.get(Incident, incident_id)
            if incident:
                incident.analysis_status = "failed"
                incident.analysis_error = str(e)[:2000]
                session.add(incident)
                session.commit()


@app.get("/api/v1/incidents/analyze")
def analyze_anomaly_get():
    """Return an informative error instead of 405 Method Not Allowed."""
    return JSONResponse(status_code=400, content={"detail": "Use POST with incident payload"})


@app.post("/api/v1/incidents/analyze")
def analyze_anomaly(
    req: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """NON-BLOCKING analyze endpoint - returns instantly. Heavy pipeline runs in background."""
    incident = session.get(Incident, req.incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.analysis_status == "processing":
        return {
            "status": "processing",
            "message": "Analysis already in progress",
            "incident_id": incident.id,
            "task_id": incident.id,
        }

    incident.analysis_status = "processing"
    incident.analysis_error = None
    incident.analysis_result = None
    session.add(incident)
    session.commit()

    # Move to a totally detached asyncio background task. 
    # This prevents Starlette's BackgroundTasks from holding the HTTP 
    # connection/ASGI cycle open and timing out Gunicorn or Render's proxy.
    asyncio.create_task(
        asyncio.to_thread(
            run_analysis_task,
            req.incident_id,
            req.symptoms,
            req.signals,
            req.changes,
            current_user.id,
        )
    )

    return {
        "status": "processing",
        "message": "Analysis started",
        "incident_id": incident.id,
        "task_id": incident.id,
    }


@app.get("/api/v1/incidents/analyze/{task_id}/status")
def get_analyze_status(
    task_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Polling endpoint for background analysis status."""
    incident = session.get(Incident, task_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
        
    return {
        "task_id": task_id,
        "status": incident.analysis_status,
        "result": incident.analysis_result,
        "error": incident.analysis_error
    }


@app.get("/api/v1/incidents/{incident_id}")
def get_incident(
    incident_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single incident - used by the frontend to poll analysis_status / analysis_result."""
    incident = session.get(Incident, incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


class FeedbackRequest(BaseModel):
    incident_id: str
    score: int
    comment: Optional[str] = None


class DispatchRequest(BaseModel):
    destination: str
    webhook_override: Optional[str] = None


@app.post("/api/v1/incidents/feedback")
def submit_feedback(
    req: FeedbackRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    incident = session.get(Incident, req.incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.human_feedback_score is None:
        incident.human_feedback_score = 0
    if incident.human_feedback_count is None:
        incident.human_feedback_count = 0

    incident.human_feedback_score += req.score
    incident.human_feedback_count += 1
    if req.comment:
        incident.human_feedback_comment = req.comment

    session.add(incident)
    session.commit()
    session.refresh(incident)

    asyncio.create_task(asyncio.to_thread(update_incident_in_index, incident))

    logger.info(f"Feedback received for {req.incident_id}. Score: {req.score}")
    return {"status": "success", "message": "Feedback recorded and RAG trained"}


class SimulationRequest(BaseModel):
    service: str
    failure_type: str
    severity: str


@app.post("/api/v1/simulation/trigger")
def trigger_simulation(
    req: SimulationRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    logger.info(f"Chaos trigger: service={req.service}, failure={req.failure_type}, severity={req.severity} by {current_user.email}")
    try:
        inc_data = generate_deterministic_incident(req.service, req.failure_type, req.severity)

        EXPECTED_MAP = {
            "Memory leak (OOM Kill)": "Memory Leak",
            "CPU spike": "CPU Saturation",
            "DB connection failure": "DB Connection Pool Exhaustion",
            "Latency spike": "Downstream Dependency Overload"
        }
        inc_data["expected_cause"] = EXPECTED_MAP.get(req.failure_type, "Unknown Pattern")
        inc_data["user_id"] = current_user.id

        incident = Incident(**inc_data)
        session.add(incident)
        session.commit()
        session.refresh(incident)

        background_tasks.add_task(process_incident_background, incident)
        logger.info(f"Chaos incident {incident.id} created for {req.service}")
        return {"status": "triggered", "incident_id": str(incident.id)}
    except Exception as e:
        logger.error(f"Chaos trigger failed: {e}")
        raise


@app.get("/api/v1/incidents", response_model=List[Incident])
def get_incidents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incidents = session.exec(
        select(Incident)
        .where(Incident.user_id == current_user.id)
        .order_by(Incident.start_time.desc())
    ).all()
    return incidents


@app.get("/api/v1/evaluation")
def get_evaluation(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incidents = session.exec(
        select(Incident)
        .where(Incident.user_id == current_user.id)
        .where(Incident.expected_cause != None)  # noqa: E711
        .where(Incident.predicted_cause != None)  # noqa: E711
    ).all()

    total = len(incidents)
    correct = sum(1 for i in incidents if i.is_correct)
    accuracy = round((correct / total * 100), 1) if total > 0 else 0.0

    return {
        "total_tests": total,
        "correct_predictions": correct,
        "accuracy": accuracy,
        "results": [
            {
                "service": i.service,
                "expected": i.expected_cause,
                "predicted": i.predicted_cause,
                "is_correct": i.is_correct
            }
            for i in reversed(incidents)
        ]
    }


def _truncate_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    clipped = text[:limit]
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "..."


def _markdown_sections(markdown: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    active = "Executive Summary"
    buffer: List[str] = []

    for line in markdown.splitlines():
        heading = re.match(r"^##\s+(.+)", line.strip())
        if heading:
            sections[active] = "\n".join(buffer).strip()
            active = heading.group(1).strip()
            buffer = []
        elif not re.match(r"^#\s+.+", line.strip()):
            buffer.append(line)

    sections[active] = "\n".join(buffer).strip()
    return {k: v for k, v in sections.items() if v}


def _extract_section(sections: Dict[str, str], candidates: List[str], fallback: str) -> str:
    for key, value in sections.items():
        low = key.lower()
        if any(token in low for token in candidates):
            return value
    return fallback


def _incident_severity(incident: Incident) -> str:
    feedback_score = incident.human_feedback_score or 0
    if feedback_score >= 8:
        return "severe"
    if feedback_score >= 3:
        return "moderate"

    signal_severity_rank = {"low": 1, "moderate": 2, "medium": 2, "high": 3, "critical": 4, "severe": 4}
    highest_signal_rank = 0
    for sig in (incident.signals if isinstance(incident.signals, list) else []):
        if isinstance(sig, dict):
            raw = sig.get("signal_severity")
            if isinstance(raw, str):
                highest_signal_rank = max(highest_signal_rank, signal_severity_rank.get(raw.strip().lower(), 0))

    if highest_signal_rank >= 4:
        return "severe"
    if highest_signal_rank >= 2:
        return "moderate"

    symptom_count = len(incident.symptoms) if isinstance(incident.symptoms, list) else 0
    if symptom_count >= 6:
        return "severe"
    if symptom_count >= 3:
        return "moderate"

    if incident.expected_cause:
        return "moderate"
    return "low"


def _allowed_webhook_hosts(destination: str) -> List[str]:
    env_key = "SLACK_ALLOWED_HOSTS" if destination == "slack" else "TEAMS_ALLOWED_HOSTS"
    raw = os.getenv(env_key, "")
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def _is_override_webhook_allowed(webhook_override: str, destination: str) -> bool:
    parsed = urlparse(webhook_override)
    if parsed.scheme.lower() != "https":
        return False
    if not parsed.hostname:
        return False

    host = parsed.hostname.lower()
    if parsed.port is not None and parsed.port <= 0:
        return False

    allowed_hosts = _allowed_webhook_hosts(destination)
    if not allowed_hosts:
        return False

    for allowed in allowed_hosts:
        if allowed.startswith("*."):
            suffix = allowed[1:]
            if host.endswith(suffix):
                return True
        elif host == allowed:
            return True
    return False


def _slack_payload(markdown: str, incident: Incident) -> Dict[str, Any]:
    sections = _markdown_sections(markdown)
    severity = _incident_severity(incident)
    accent = "#E01E5A" if severity == "severe" else "#FF8C00"
    timestamp = incident.start_time.isoformat() if incident.start_time else "Unknown"
    title = f"Postmortem - {incident.service}"

    impact = _extract_section(sections, ["impact"], "Impact details unavailable.")
    root_cause = _extract_section(sections, ["root cause"], "Root cause pending.")
    actions = _extract_section(sections, ["action", "prevention"], "Action items pending.")

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": _truncate_text(title, 150)}},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        f"*Incident:* `{incident.id[:8]}`  *Env:* `{incident.environment}`  "
                        f"*Severity:* `{severity}`  *Start:* `{timestamp}`"
                    )
                }
            ],
        },
        {"type": "divider"},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Impact*\n{_truncate_text(impact, 2900)}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Root Cause*\n{_truncate_text(root_cause, 2900)}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Actions*\n{_truncate_text(actions, 2900)}"}},
        {
            "type": "actions",
            "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "Acknowledge"}, "action_id": "acknowledge_incident", "value": str(incident.id)},
                {"type": "button", "text": {"type": "plain_text", "text": "Execute Runbook"}, "style": "primary", "action_id": "execute_runbook", "value": str(incident.id)},
                {"type": "button", "text": {"type": "plain_text", "text": "Resolve"}, "style": "danger", "action_id": "mark_resolved", "value": str(incident.id)}
            ]
        }
    ]

    return {
        "text": _truncate_text(f"Incident postmortem for {incident.service}", 300),
        "attachments": [{"color": accent, "blocks": blocks[:50]}],
    }


def _teams_payload(markdown: str, incident: Incident) -> Dict[str, Any]:
    sections = _markdown_sections(markdown)
    severity = _incident_severity(incident)
    theme_color = "D32F2F" if severity == "severe" else "F57C00"
    timestamp = incident.start_time.isoformat() if incident.start_time else "Unknown"

    impact = _extract_section(sections, ["impact"], "Impact details unavailable.")
    root_cause = _extract_section(sections, ["root cause"], "Root cause pending.")
    actions = _extract_section(sections, ["action", "prevention"], "Action items pending.")

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": f"Incident postmortem for {incident.service}",
        "themeColor": theme_color,
        "title": f"Postmortem - {incident.service}",
        "text": (
            f"**Incident:** `{incident.id[:8]}`\n\n"
            f"**Environment:** `{incident.environment}`\n\n"
            f"**Severity:** `{severity}`\n\n"
            f"**Start:** `{timestamp}`"
        ),
        "sections": [
            {"activityTitle": "Impact", "text": _truncate_text(impact, 7000), "markdown": True},
            {"activityTitle": "Root Cause", "text": _truncate_text(root_cause, 7000), "markdown": True},
            {"activityTitle": "Actions", "text": _truncate_text(actions, 7000), "markdown": True},
        ],
    }


async def _generate_postmortem_markdown(incident_id: str, session: Session) -> str:
    import traceback
    from rag_engine import get_llm

    incident = session.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    service = incident.service
    environment = incident.environment
    severity = "severe" if incident.expected_cause else "moderate"
    timestamp = incident.start_time.isoformat() if incident.start_time else "Unknown"
    peak_time = incident.peak_time.isoformat() if incident.peak_time else "N/A"
    resolved_time = incident.resolved_time.isoformat() if incident.resolved_time else "Ongoing"

    symptoms = ", ".join(incident.symptoms) if incident.symptoms else "None recorded"
    signals_text = "\n".join(
        [f"  - {s}" for s in (incident.signals if isinstance(incident.signals, list) else [])]
    ) or "  - No signals recorded"
    changes_text = "\n".join(
        [f"  - {c}" for c in (incident.changes if isinstance(incident.changes, list) else [])]
    ) or "  - No changes recorded"

    root_cause = incident.root_cause or incident.predicted_cause or "Not yet determined"

    if incident.fixes_applied:
        fixes_strs = []
        for fix in incident.fixes_applied:
            if isinstance(fix, dict):
                fixes_strs.append(f"{fix.get('action')}: {fix.get('description')}")
            else:
                fixes_strs.append(str(fix))
        fixes = ", ".join(fixes_strs)
    else:
        fixes = "None applied yet"

    SERVICE_DEPS = {
        "user-gateway": ["checkout-ui", "payment-api", "inventory-service"],
        "checkout-ui": ["payment-api", "inventory-service"],
        "payment-api": ["database-cluster"],
        "inventory-service": ["database-cluster"],
        "database-cluster": ["payment-api", "inventory-service", "checkout-ui", "user-gateway"],
    }
    downstream = SERVICE_DEPS.get(service, [])
    blast_radius = ", ".join(f"`{s}`" for s in downstream) if downstream else "No known downstream dependencies."

    timeline_events = []
    if incident.start_time:
        timeline_events.append(f"- **{incident.start_time.strftime('%H:%M:%S UTC')}** - Incident detected on `{service}` in `{environment}`")
    if incident.symptoms:
        timeline_events.append(f"- **{incident.start_time.strftime('%H:%M:%S UTC')} +30s** - Symptoms observed: {symptoms}")
    if incident.peak_time:
        timeline_events.append(f"- **{incident.peak_time.strftime('%H:%M:%S UTC')}** - Peak impact reached")
    if incident.resolved_time:
        timeline_events.append(f"- **{incident.resolved_time.strftime('%H:%M:%S UTC')}** - Incident resolved")
    else:
        timeline_events.append("- **Ongoing** - Incident not yet resolved")

    timeline_str = "\n".join(timeline_events) if timeline_events else "No timeline events available."

    detection_source = "monitoring alerts"
    reasoning_summary = ""
    try:
        result = await asyncio.to_thread(
            run_hybrid_analysis, service, incident.symptoms, incident.signals, incident.changes, incident.user_id
        )
        hypotheses_text = "\n".join(
            [f"  {i+1}. {h.title} (Confidence: {h.confidence}%) - {h.description}"
             for i, h in enumerate(result.hypotheses[:5])]
        ) or "  No hypotheses generated."
        suggested_fixes_short = "\n".join(
            [f"  - {h.mitigation}" for h in result.hypotheses[:3] if h.mitigation]
        ) or "  - No specific fixes suggested."
        suggested_fixes_long = "\n".join(
            [f"  - {h.long_term_fix}" for h in result.hypotheses[:3] if h.long_term_fix]
        ) or "  - Conduct full architectural review."
        anomaly_summary = result.anomaly_report.get("summary", "No anomaly data.")

        chain = result.reasoning_chain or []
        for step in chain:
            if "rule(s) matched" in step and "0 rule" not in step:
                detection_source = "deterministic rules engine (pattern matching on known failure signatures)"
                break
            elif "anomalous metric" in step and "0 anomalous" not in step:
                detection_source = "statistical anomaly detection system (z-score deviation from baseline)"
                break

        reasoning_summary = "\n".join([f"  {s}" for s in chain]) if chain else "  No reasoning chain available."

    except Exception:
        hypotheses_text = "  Analysis unavailable."
        suggested_fixes_short = "  - Review logs manually."
        suggested_fixes_long = "  - Conduct full architectural review."
        anomaly_summary = "Anomaly scoring unavailable."
        reasoning_summary = "  Analysis pipeline did not complete."

    prompt = f"""You are a senior Site Reliability Engineer (SRE) writing a professional incident postmortem.

Use ONLY the provided data. Do NOT invent or hallucinate events, metrics, or timestamps.

---

Incident Details:
Service: {service}
Environment: {environment}
Severity: {severity}
Start Time: {timestamp}
Peak Time: {peak_time}
Resolved Time: {resolved_time}

---

Timeline:
{timeline_str}

---

Observed Signals (real telemetry):
{signals_text}

Recent Changes (real deployments/config):
{changes_text}

Anomaly Summary: {anomaly_summary}

Symptoms: {symptoms}

---

AI Analysis:
Root Cause: {root_cause}
Detection Method: {detection_source}
Hypotheses:
{hypotheses_text}

Reasoning Chain:
{reasoning_summary}

---

Suggested Short-Term Fixes:
{suggested_fixes_short}

Suggested Long-Term Fixes:
{suggested_fixes_long}

Fixes Already Applied: {fixes}

---

Blast Radius:
Affected service: `{service}`
Downstream services at risk: {blast_radius}

---

Write a structured postmortem with the following sections. Be concise, professional, and technical.

## Executive Summary
- 2-3 sentence description of what happened, when, and the business impact

## Impact
- Derive MEASURABLE impact from the signals above
- State which user-facing capabilities were degraded
- Mention downstream services affected: {blast_radius}

## Timeline
- Use ONLY the provided timeline events. Do NOT add fictional timestamps.

## Root Cause
- Clear technical explanation based on the AI analysis

## Causal Chain (Why Analysis)
- Trace the chain: What changed -> What mechanism broke -> What failed -> What users experienced
- Use the actual changes and signals provided above

## Detection & Response
- State clearly: "Detected via {detection_source}"
- Describe what automated systems flagged the issue
- Describe response actions taken

## Action Items
### Short-term (immediate)
- Based on the suggested short-term fixes above
### Long-term (prevention)
- Based on the suggested long-term fixes above
- Include monitoring/alerting improvements

---

Constraints:
- Be concise and professional
- No hallucinated data
- Use bullet points for readability
- Output clean Markdown only
"""

    llm = get_llm()
    if llm is None:
        raise HTTPException(status_code=503, detail="No LLM configured. Set GROQ_API_KEY or OPENAI_API_KEY.")

    response = await asyncio.to_thread(llm.complete, prompt)
    logger.info(f"Postmortem generated for incident {incident_id}")
    return response.text


@app.post("/api/v1/incidents/{incident_id}/postmortem")
async def generate_postmortem(
    incident_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    import traceback
    incident = session.get(Incident, incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")
    try:
        markdown = await _generate_postmortem_markdown(incident_id, session)
        return {"postmortem": markdown}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Postmortem generation failed: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.post("/api/v1/incidents/{incident_id}/dispatch")
async def dispatch_postmortem(
    incident_id: str,
    req: DispatchRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = session.get(Incident, incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")

    destination = (req.destination or "").strip().lower()
    if destination not in {"slack", "teams"}:
        raise HTTPException(status_code=400, detail="destination must be either 'slack' or 'teams'")

    webhook_url = os.getenv("SLACK_WEBHOOK_URL" if destination == "slack" else "TEAMS_WEBHOOK_URL")
    if req.webhook_override:
        if _is_override_webhook_allowed(req.webhook_override, destination):
            webhook_url = req.webhook_override
        else:
            if not webhook_url:
                raise HTTPException(status_code=400, detail=f"Invalid webhook_override for {destination}")

    if not webhook_url:
        raise HTTPException(status_code=400, detail=f"No webhook configured for {destination}")

    markdown = await _generate_postmortem_markdown(incident_id, session)
    payload = _slack_payload(markdown, incident) if destination == "slack" else _teams_payload(markdown, incident)

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(webhook_url, json=payload)

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"{destination} webhook rejected dispatch: {_truncate_text(response.text, 600)}",
        )

    return {
        "status": "delivered",
        "destination": destination,
        "incident_id": incident_id,
    }


async def verify_slack_signature(request: Request, body_bytes: bytes = b""):
    slack_secret = os.getenv("SLACK_SIGNING_SECRET")
    if not slack_secret:
        logger.warning("SLACK_SIGNING_SECRET not set - skipping signature verification")
        return True

    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    if not timestamp or not signature:
        logger.warning("Slack request missing signature headers - skipping verification")
        return True

    try:
        if abs(datetime.now(timezone.utc).timestamp() - int(timestamp)) > 60 * 5:
            raise HTTPException(status_code=400, detail="Request timestamp too old")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp formatting")

    sig_basestring = f"v0:{timestamp}:{body_bytes.decode('utf-8')}"
    my_signature = "v0=" + hmac.new(
        slack_secret.encode(),
        sig_basestring.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(my_signature, signature):
        raise HTTPException(status_code=400, detail="Invalid Slack signature")
    return True


def process_slack_action(payload: dict):
    from database import engine

    actions = payload.get("actions", [])
    if not actions:
        logger.warning("Slack payload has no actions")
        return

    action = actions[0]
    action_id = action.get("action_id")
    incident_id = action.get("value")
    user = payload.get("user", {}).get("username", "someone")
    response_url = payload.get("response_url")

    logger.info(f"Processing Slack action: {action_id} for incident {incident_id} by {user}")

    with Session(engine) as session:
        incident = session.get(Incident, incident_id)
        if not incident:
            logger.error(f"Incident {incident_id} not found for Slack action")
            return

        now = datetime.now(timezone.utc)
        message_update = ""

        if action_id == "acknowledge_incident":
            incident.acknowledged_by = user
            message_update = f"Acknowledged by @{user}"
            logger.info(f"Slack: Incident {incident_id} acknowledged by {user}")
        elif action_id == "mark_resolved":
            incident.resolved_time = now
            incident.acknowledged_by = incident.acknowledged_by or user
            message_update = f"Resolved by @{user}"
            logger.info(f"Slack: Incident {incident_id} resolved by {user}")
        elif action_id == "execute_runbook":
            fixes = list(incident.fixes_applied) if incident.fixes_applied else []
            fixes.append({
                "action": "Automated Runbook",
                "description": "Restarted target pods to mitigate issue",
                "timestamp": now.isoformat(),
                "source": f"Slack (@{user})",
                "status": "success"
            })
            incident.fixes_applied = fixes
            message_update = f"Runbook triggered by @{user}"
            logger.info(f"Slack: Runbook executed for {incident_id} by {user}")
        else:
            logger.warning(f"Unknown Slack action_id: {action_id}")
            return

        session.add(incident)
        session.commit()
        logger.info(f"DB committed for Slack action {action_id} on {incident_id}")

    if response_url:
        try:
            resp = httpx.post(response_url, json={"replace_original": False, "text": message_update})
            logger.info(f"Slack response_url reply: {resp.status_code}")
        except Exception as e:
            logger.error(f"Failed to send Slack response update: {e}")


@app.post("/api/v1/slack/interactive")
async def slack_interactive(
    request: Request,
    background_tasks: BackgroundTasks
):
    from urllib.parse import parse_qs

    try:
        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8")
        logger.info(f"Slack interactive request received ({len(body_bytes)} bytes)")

        await verify_slack_signature(request, body_bytes)

        parsed = parse_qs(body_str)
        payload_str = parsed.get("payload", [None])[0]

        if not payload_str:
            logger.error(f"Missing payload in Slack form data. Keys: {list(parsed.keys())}")
            return JSONResponse(status_code=200, content={"text": "Missing payload"})

        payload = json.loads(payload_str)
        logger.info(f"Slack payload parsed: type={payload.get('type')}, actions={[a.get('action_id') for a in payload.get('actions', [])]}")

        asyncio.create_task(asyncio.to_thread(process_slack_action, payload))

        return JSONResponse(status_code=200, content={"status": "accepted"})
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in Slack payload: {e}")
        return JSONResponse(status_code=200, content={"text": "Invalid payload"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in slack_interactive: {e}", exc_info=True)
        return JSONResponse(status_code=200, content={"text": "Internal error"})


class SimulateSlackAction(BaseModel):
    incident_id: str
    action: str
    username: str = "local-engineer"


@app.post("/api/v1/slack/simulate")
def simulate_slack_action(
    req: SimulateSlackAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = session.get(Incident, req.incident_id)
    if not incident or (incident.user_id and incident.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.now(timezone.utc)

    if req.action == "acknowledge":
        incident.acknowledged_by = req.username
        result = f"Acknowledged by @{req.username}"
    elif req.action == "execute_runbook":
        fixes = list(incident.fixes_applied) if incident.fixes_applied else []
        fixes.append({
            "action": "Automated Runbook",
            "description": "Restarted target pods to mitigate issue",
            "timestamp": now.isoformat(),
            "source": f"Dashboard (@{req.username})",
            "status": "success"
        })
        incident.fixes_applied = fixes
        result = f"Runbook triggered by @{req.username}"
    elif req.action == "resolve":
        incident.resolved_time = now
        incident.acknowledged_by = incident.acknowledged_by or req.username
        result = f"Resolved by @{req.username}"
    else:
        raise HTTPException(status_code=400, detail="action must be 'acknowledge', 'execute_runbook', or 'resolve'")

    session.add(incident)
    session.commit()
    logger.info(f"Simulated Slack action: {req.action} on {req.incident_id} by {req.username}")

    chatops_activity_log.append({
        "action": req.action,
        "incident_id": req.incident_id,
        "mode": "simulation",
        "timestamp": now.isoformat(),
        "user": req.username,
    })

    return {"status": "success", "action": req.action, "message": result}


chatops_activity_log: List[Dict[str, Any]] = []


class ChatOpsLogEntry(BaseModel):
    action: str
    incident_id: str
    mode: str
    timestamp: str
    user: str


@app.get("/api/v1/chatops/logs")
def get_chatops_logs(
    incident_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    owned_ids = {
        i.id for i in session.exec(
            select(Incident).where(Incident.user_id == current_user.id)
        ).all()
    }
    entries = [e for e in chatops_activity_log if e["incident_id"] in owned_ids]
    if incident_id:
        entries = [e for e in entries if e["incident_id"] == incident_id]
    return entries