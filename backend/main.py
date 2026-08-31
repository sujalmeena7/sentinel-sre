
import os
import sys
import asyncio
import threading
import logging
import re
import httpx
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, EmailStr, field_validator
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
from database import init_db, get_session, engine, db_healthy, _is_production as _is_production_env
from rag_engine import add_incident_to_index, query_similar_incidents, generate_hypothesis, update_incident_in_index
from hybrid_analyzer import run_hybrid_analysis
from data_generator import generate_deterministic_incident
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_verification_token,
    create_password_reset_token,
    decode_purpose_token,
    generate_webhook_token,
    hash_webhook_token,
    get_current_user,
    get_user_by_webhook_token,
)
from email_service import send_verification_email, send_password_reset_email, email_delivery_configured

load_dotenv()

# Windows consoles default to a legacy codepage (cp1252). Log records and
# generated narratives contain non-ASCII characters (em dashes, sigma, status
# emoji), which would raise UnicodeEncodeError mid-request. Force UTF-8 on the
# std streams before logging is configured.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


STARTUP_STATUS: Dict[str, str] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Boot the app without ever letting one broken subsystem take it down.

    Every step is isolated. An unguarded failure here (an expired Postgres, a
    bad DATABASE_URL) killed the worker before it bound a port, which the host
    surfaced as a bare 502 with no application log — impossible to diagnose from
    outside the box. Now each step records its outcome in STARTUP_STATUS, /health
    reports it, and the process still serves traffic.

    The vector backfill is deliberately NOT awaited: it embeds up to 60
    incidents, and anything slow on this path delays port binding past the
    platform's deploy timeout and fails the release.
    """
    for step, fn in (
        ("database", init_db),
        ("admin_seed", _seed_admin_and_backfill),
        ("stale_tasks", _reap_stale_tasks),
    ):
        try:
            fn()
            STARTUP_STATUS[step] = "ok"
        except Exception as exc:
            STARTUP_STATUS[step] = f"failed: {type(exc).__name__}: {str(exc)[:200]}"
            logger.exception(f"Startup step '{step}' failed — continuing so /health stays reachable")

    def _deferred_backfill() -> None:
        try:
            _backfill_vector_index()
            STARTUP_STATUS["vector_backfill"] = "ok"
        except Exception as exc:
            STARTUP_STATUS["vector_backfill"] = f"failed: {type(exc).__name__}"
            logger.warning(f"Vector backfill failed: {exc}")

    STARTUP_STATUS["vector_backfill"] = "running"
    threading.Thread(target=_deferred_backfill, name="vector-backfill", daemon=True).start()

    logger.info(f"Startup complete: {STARTUP_STATUS}")
    yield


app = FastAPI(title="AI Root Cause Analyzer", version="0.3.0", lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


# ─── Security Headers Middleware ─────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Only add HSTS in production (when not localhost)
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Allowed browser origins. Defaults cover local dev + the deployed Vercel apps;
# ALLOWED_ORIGINS (comma-separated) adds to them at deploy time.
#
# `sentinelsre.vercel.app` (no hyphens) is the canonical production domain — the
# other two redirect to it. It was missing here AND unmatched by the regex
# below, so every browser call from the live site was CORS-blocked while
# localhost worked fine: the classic "works on my machine" deploy failure.
_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "https://sentinelsre.vercel.app",
    "https://sentinel-sre.vercel.app",
    "https://sentinel-sre-zeta.vercel.app",
]

# Vercel preview deploys get generated subdomains, so they need a pattern rather
# than a list. Both spellings of the project name are allowed; the trailing
# group covers preview suffixes like `-git-main-user.vercel.app`.
_ORIGIN_REGEX = r"https://sentinel-?sre[a-z0-9-]*\.vercel\.app"


def _allowed_origins() -> List[str]:
    configured = [
        o.strip().rstrip("/")
        for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if o.strip()
    ]
    # Dedupe while preserving order.
    return list(dict.fromkeys(_DEFAULT_ORIGINS + configured))


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check (lightweight, no DB/LLM) ───────────────────────────
@app.get("/health")
def health_check():
    """Lightweight health check for uptime monitoring. No DB or LLM calls.

    Deliberately does not touch the database: this is what the platform polls to
    decide whether the instance is live, so it must stay fast and must never fail
    for a reason that a restart cannot fix.
    """
    return {"status": "ok", "version": "0.3.0"}


@app.get("/api/v1/health")
def health_check_v1():
    """Versioned health check. Reports degradation without leaking details."""
    degraded = [k for k, v in STARTUP_STATUS.items() if v.startswith("failed")]
    return {
        "status": "ok",
        "version": "0.3.0",
        "degraded": bool(degraded),
        "degraded_subsystems": degraded,
    }


@app.get("/api/v1/diagnostics")
def diagnostics(request: Request):
    """Explain *why* a deploy is unhealthy, without exposing secrets.

    Guarded by DIAGNOSTICS_TOKEN rather than a JWT on purpose: the situation this
    endpoint exists for is "the database is down so nobody can log in", where
    requiring a login would make it useless. Values are never returned — only
    whether a key is present, backend names, and truncated error types.
    """
    expected = os.getenv("DIAGNOSTICS_TOKEN", "")
    if expected:
        supplied = request.query_params.get("token") or request.headers.get("X-Diagnostics-Token", "")
        if not hmac.compare_digest(supplied, expected):
            raise HTTPException(status_code=404, detail="Not found")
    elif _is_production_env():
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )

    db_ok, db_detail = db_healthy()
    try:
        from rag_engine import embedding_backend, vector_count
        embed_backend = embedding_backend()
        vectors = vector_count()
    except Exception as exc:
        embed_backend = f"unavailable ({type(exc).__name__})"
        vectors = -1

    # Which models would actually be tried, in order. When the narrative is
    # missing, "is the gateway even in the chain?" is the first question, and
    # the model ids are configuration, not secrets — the keys never appear.
    try:
        from rag_engine import candidate_llms, gateway_configured
        llm_chain = [c.model for c in candidate_llms()]
        gateway_ok = gateway_configured()
    except Exception as exc:
        llm_chain = [f"unavailable ({type(exc).__name__})"]
        gateway_ok = False

    return {
        "version": "0.3.0",
        "startup": STARTUP_STATUS,
        "database": {"ok": db_ok, "backend": db_detail if db_ok else "error", "error": None if db_ok else db_detail},
        "vector_store": {"embedding_backend": embed_backend, "vectors": vectors},
        "providers": {
            "gateway_configured": gateway_ok,
            "gateway_base_url": os.getenv("LLM_GATEWAY_BASE_URL", "").strip(),
            "gateway_key_present": bool(os.getenv("LLM_GATEWAY_API_KEY", "").strip()),
            "groq_key_present": bool(os.getenv("GROQ_API_KEY", "").strip()),
            "openai_key_present": bool(os.getenv("OPENAI_API_KEY", "").strip()),
            "groq_model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            "llm_chain": llm_chain,
            "mail_configured": email_delivery_configured(),
        },
        "cors_allowed_origins": _allowed_origins(),
        "cors_origin_regex": _ORIGIN_REGEX,
    }


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

    @field_validator("service", "environment")
    @classmethod
    def sanitize_string_fields(cls, v: str) -> str:
        """Strip HTML/script tags and limit length to prevent stored XSS."""
        import re as _re
        v = _re.sub(r"<[^>]*>", "", v)  # Strip HTML tags
        return v[:200].strip()

    @field_validator("symptoms")
    @classmethod
    def sanitize_symptoms(cls, v: List[str]) -> List[str]:
        import re as _re
        return [_re.sub(r"<[^>]*>", "", s)[:500].strip() for s in v[:50]]


def parse_dt(val: Optional[str]) -> Optional[datetime]:
    if val:
        return datetime.fromisoformat(val)
    return None


def _require_owned_incident(session: Session, incident_id: str, current_user: User) -> Incident:
    """Fetch an incident and enforce that the current user owns it.

    Returns 404 (not 403) so we don't leak existence of other tenants' incidents.
    Rejects orphan rows (user_id is None) defensively, in case any path ever
    forgot to set the owner.
    """
    incident = session.get(Incident, incident_id)
    if not incident or incident.user_id is None or incident.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


# Bounded thread pool to prevent resource exhaustion under load.
# Max 10 concurrent background tasks; additional submissions queue up.
_background_pool = ThreadPoolExecutor(max_workers=10, thread_name_prefix="bg-task")


def launch_background(func, *args, **kwargs) -> None:
    """Submit work to a bounded thread pool (max 10 concurrent tasks)."""
    _background_pool.submit(func, *args, **kwargs)


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


def _reap_stale_tasks() -> None:
    """Reset any incidents stuck in 'processing' for >5 minutes back to 'failed'.
    This handles cases where the worker restarted mid-analysis."""
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    with Session(engine) as session:
        stale = session.exec(
            select(Incident).where(
                Incident.analysis_status == "processing",
                Incident.start_time < stale_cutoff,
            )
        ).all()
        for incident in stale:
            incident.analysis_status = "failed"
            incident.analysis_error = "Analysis timed out (worker restart). Please retry."
            session.add(incident)
        if stale:
            session.commit()
            logger.info(f"Reaped {len(stale)} stale processing tasks")


# The login/register schemas validate email with Pydantic's EmailStr, which
# rejects reserved TLDs like `.local`. Older builds seeded `admin@sentinel.local`,
# producing an admin account that could never sign in (HTTP 422 at /auth/login).
DEFAULT_ADMIN_EMAIL = "admin@sentinel-sre.dev"
LEGACY_ADMIN_EMAILS = ("admin@sentinel.local",)
_RESERVED_EMAIL_SUFFIXES = (".local", ".localhost", ".invalid", ".test", ".example")


def _migrate_legacy_admin_email(session: Session, admin_email: str) -> None:
    """Rename a legacy un-loggable admin row to the current admin email so the
    account (and every incident it owns) stays usable."""
    if admin_email in LEGACY_ADMIN_EMAILS:
        return
    if session.exec(select(User).where(User.email == admin_email)).first():
        return  # Target already exists; leave the legacy row alone.
    for legacy_email in LEGACY_ADMIN_EMAILS:
        legacy = session.exec(select(User).where(User.email == legacy_email)).first()
        if legacy is not None:
            legacy.email = admin_email
            legacy.email_verified = True
            session.add(legacy)
            session.commit()
            logger.info(f"Migrated legacy admin {legacy_email} -> {admin_email}")
            return


def _seed_admin_and_backfill() -> None:
    admin_email = os.getenv("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    if admin_email.endswith(_RESERVED_EMAIL_SUFFIXES):
        logger.error(
            f"ADMIN_EMAIL '{admin_email}' uses a reserved TLD and will be rejected "
            f"by /auth/login validation. Falling back to {DEFAULT_ADMIN_EMAIL}."
        )
        admin_email = DEFAULT_ADMIN_EMAIL

    # Refuse to seed with a weak/default password in production
    if not admin_password or admin_password in ("admin123", "password", "changeme"):
        if _is_production_env():
            logger.error(
                "ADMIN_PASSWORD is not set or is a known weak default. "
                "Refusing to seed admin in production. Set a strong ADMIN_PASSWORD."
            )
            return
        # In dev, fall back to a random password and log it
        if not admin_password:
            import secrets
            admin_password = secrets.token_urlsafe(16)
            logger.warning(f"ADMIN_PASSWORD not set - using random dev password: {admin_password}")

    with Session(engine) as session:
        _migrate_legacy_admin_email(session, admin_email)
        admin = session.exec(select(User).where(User.email == admin_email)).first()
        if admin is None:
            raw_webhook = generate_webhook_token()
            admin = User(
                email=admin_email,
                password_hash=hash_password(admin_password),
                webhook_token_hash=hash_webhook_token(raw_webhook),
                role="admin",
                name="Admin",
                email_verified=True,
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


def _backfill_vector_index(limit: int = 60) -> None:
    """Populate the vector store when it is empty but the DB already has data.

    Needed after a fresh clone (chroma_db is not committed) and after an
    embedding-backend switch, which starts a new collection. Without this the
    "similar incidents" panel stays empty until new incidents arrive.
    """
    if os.getenv("RAG_INDEX_BACKFILL", "1") == "0":
        return
    try:
        from rag_engine import vector_count

        if vector_count() > 0:
            return
        with Session(engine) as session:
            incidents = session.exec(
                select(Incident).order_by(Incident.start_time.desc()).limit(limit)
            ).all()
            for incident in incidents:
                add_incident_to_index(incident)
        if incidents:
            logger.info(f"Backfilled {len(incidents)} incidents into the vector index.")
    except Exception as exc:
        # Retrieval is an enhancement, never a startup blocker.
        logger.warning(f"Vector index backfill skipped: {type(exc).__name__}: {exc}")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Root Cause Analyzer API v0.3.0 - Multi-Tenant SaaS"}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]
    webhook_token: Optional[str] = None


def _public_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "email_verified": bool(user.email_verified),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _verification_required() -> bool:
    """
    Email verification is only enforced when a mail provider is actually
    configured. Without SMTP/SES the verification link is written to the server
    log only, so enforcing it would lock every new signup out of their own
    account. ALLOW_UNVERIFIED_LOGIN=true disables the gate outright.
    """
    if os.getenv("ALLOW_UNVERIFIED_LOGIN", "").lower() == "true":
        return False
    return email_delivery_configured()


@app.post("/api/v1/auth/register", response_model=AuthResponse)
@limiter.limit("10/minute")
def register(
    request: Request,
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    email = body.email.strip().lower()
    # Password validation is handled by the Pydantic model validator

    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    raw_webhook = generate_webhook_token()
    verification_required = _verification_required()
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        webhook_token_hash=hash_webhook_token(raw_webhook),
        name=body.name,
        role="user",
        # Without a mail provider there is no way for the user to ever confirm,
        # so treat the address as verified instead of creating a dead account.
        email_verified=not verification_required,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    if verification_required:
        # Send verification email out-of-band so registration stays snappy.
        verify_token = create_verification_token(user.id, user.email)
        background_tasks.add_task(send_verification_email, user.email, verify_token, user.name)
        logger.info(f"User registered (unverified): {email}")
    else:
        logger.info(f"User registered (auto-verified, no mail provider configured): {email}")

    # We DO return an access token so the user can land on a "check your email"
    # screen, but every protected endpoint will still work because the access
    # JWT itself isn't gated by email_verified — only login is. The webhook
    # token is also returned now (shown once) so the user doesn't lose it if
    # they never click the verification link.
    token = create_access_token(user.id, user.email)
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

    if not user.email_verified:
        if _verification_required():
            raise HTTPException(
                status_code=403,
                detail="Email not verified. Please check your inbox or request a new verification link.",
            )
        # No mail provider configured — the account can never be confirmed by
        # the user, so settle the flag now to keep client state consistent.
        user.email_verified = True
        session.add(user)
        session.commit()
        session.refresh(user)

    token = create_access_token(user.id, user.email)
    logger.info(f"Login: {email}")
    return AuthResponse(access_token=token, user=_public_user(user))


# ─── Email verification ────────────────────────────────────────────

class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


@app.post("/api/v1/auth/verify-email/confirm")
@limiter.limit("20/minute")
def confirm_email(
    request: Request,
    body: VerifyEmailRequest,
    session: Session = Depends(get_session),
):
    payload = decode_purpose_token(body.token, expected_type="verify_email")
    user_id = payload.get("sub")
    user = session.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=400, detail="Invalid link — user no longer exists")

    if not user.email_verified:
        user.email_verified = True
        session.add(user)
        session.commit()
        session.refresh(user)
        logger.info(f"Email verified: {user.email}")

    return {"status": "verified", "email": user.email}


@app.post("/api/v1/auth/verify-email/resend")
@limiter.limit("3/minute")
def resend_verification(
    request: Request,
    body: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Always returns 200 with a generic message, regardless of whether the
    email exists or is already verified. This avoids leaking which emails
    are registered.
    """
    email = body.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user and not user.email_verified:
        token = create_verification_token(user.id, user.email)
        background_tasks.add_task(send_verification_email, user.email, token, user.name)
        logger.info(f"Verification email re-sent to {email}")

    return {"status": "ok", "message": "If that account exists, a verification email is on its way."}


# ─── Password reset ────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


@app.post("/api/v1/auth/forgot-password")
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Always returns 200 to prevent email enumeration. If the address is on
    file, a reset email is dispatched in the background.
    """
    email = body.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        token = create_password_reset_token(user.id, user.email)
        background_tasks.add_task(send_password_reset_email, user.email, token, user.name)
        logger.info(f"Password reset email queued for {email}")

    return {"status": "ok", "message": "If that account exists, a reset email is on its way."}


@app.post("/api/v1/auth/reset-password")
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    session: Session = Depends(get_session),
):
    # Password validation is handled by the Pydantic model validator

    payload = decode_purpose_token(body.token, expected_type="password_reset")
    user_id = payload.get("sub")
    user = session.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=400, detail="Invalid link — user no longer exists")

    user.password_hash = hash_password(body.new_password)
    # Clicking the reset link is also implicit proof of email ownership — a
    # convenient time to mark them verified if they weren't already.
    if not user.email_verified:
        user.email_verified = True
    session.add(user)
    session.commit()
    logger.info(f"Password reset for {user.email}")

    return {"status": "ok", "message": "Password updated. You can now sign in."}


@app.get("/api/v1/auth/me")
def read_me(current_user: User = Depends(get_current_user)):
    return _public_user(current_user)


@app.post("/api/v1/auth/refresh")
@limiter.limit("30/minute")
def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Issue a fresh access token if the current one is valid.
    Frontend should call this when the token is within 2 hours of expiry."""
    new_token = create_access_token(current_user.id, current_user.email)
    return {"access_token": new_token, "token_type": "bearer"}


@app.post("/api/v1/auth/rotate-webhook-token", response_model=AuthResponse)
@limiter.limit("5/minute")
def rotate_webhook_token(
    request: Request,
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


def process_incident_background(incident: dict):
    try:
        add_incident_to_index(incident)
        logger.info(f"Incident {incident.get('id')} indexed into ChromaDB.")
    except Exception as e:
        logger.error(f"Failed to index incident {incident.get('id')}: {e}")


@app.post("/api/v1/incidents/ingest", response_model=Dict[str, Any])
@limiter.limit("60/minute")
def ingest_incident(
    request: Request,
    payload: IncidentIngest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
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
        # Detach ORM object to dict before passing to background thread
        incident_dict = incident.__dict__.copy()
        if "_sa_instance_state" in incident_dict:
            del incident_dict["_sa_instance_state"]
    except Exception as e:
        logger.error(f"Failed to ingest incident payload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to persist incident")

    try:
        launch_background(process_incident_background, incident_dict)
    except Exception as e:
        # Indexing is best-effort and should not fail ingestion.
        logger.error(f"Failed to start indexing thread for incident {incident.id}: {e}", exc_info=True)

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
            
            # Detach ORM object to dict before passing to background thread
            incident_dict = incident.__dict__.copy()
            if "_sa_instance_state" in incident_dict:
                del incident_dict["_sa_instance_state"]
            
            launch_background(process_incident_background, incident_dict)
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
@limiter.limit("20/minute")
def analyze_anomaly(
    request: Request,
    req: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """NON-BLOCKING analyze endpoint - returns instantly. Heavy pipeline runs in background."""
    incident = _require_owned_incident(session, req.incident_id, current_user)

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
    launch_background(
        run_analysis_task,
        req.incident_id,
        req.symptoms,
        req.signals,
        req.changes,
        current_user.id,
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
    if not incident or incident.user_id is None or incident.user_id != current_user.id:
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
    return _require_owned_incident(session, incident_id, current_user)


class FeedbackRequest(BaseModel):
    incident_id: str
    score: int
    comment: Optional[str] = None


class DispatchRequest(BaseModel):
    destination: str
    webhook_override: Optional[str] = None


@app.post("/api/v1/incidents/feedback")
@limiter.limit("30/minute")
def submit_feedback(
    request: Request,
    req: FeedbackRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = _require_owned_incident(session, req.incident_id, current_user)

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

    launch_background(update_incident_in_index, incident)

    logger.info(f"Feedback received for {req.incident_id}. Score: {req.score}")
    return {"status": "success", "message": "Feedback recorded and RAG trained"}


class SimulationRequest(BaseModel):
    service: str
    failure_type: str
    severity: str


@app.post("/api/v1/simulation/trigger")
@limiter.limit("30/minute")
def trigger_simulation(
    request: Request,
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
        
        # Detach ORM object to dict before passing to background thread
        incident_dict = incident.__dict__.copy()
        if "_sa_instance_state" in incident_dict:
            del incident_dict["_sa_instance_state"]

        launch_background(process_incident_background, incident_dict)
        logger.info(f"Chaos incident {incident.id} created for {req.service}")
        return {"status": "triggered", "incident_id": str(incident.id)}
    except Exception as e:
        logger.error(f"Chaos trigger failed: {e}")
        raise


@app.get("/api/v1/incidents", response_model=List[Incident])
@limiter.limit("60/minute")
def get_incidents(
    request: Request,
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
    from rag_engine import (
        LLM_CHAINED_BUDGET_SECONDS,
        complete_with_fallback,
        LLMUnavailableError,
    )

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
            run_hybrid_analysis, service, incident.symptoms, incident.signals, incident.changes,
            incident.user_id, LLM_CHAINED_BUDGET_SECONDS,
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

    try:
        markdown = await asyncio.to_thread(
            complete_with_fallback, prompt, LLM_CHAINED_BUDGET_SECONDS
        )
        logger.info(f"Postmortem generated for incident {incident_id}")
        return markdown
    except LLMUnavailableError as exc:
        # A 500 here used to lose the whole document. Every fact in the
        # postmortem except the prose already exists locally, so fall back to a
        # data-only version and say so at the top.
        logger.warning(f"Postmortem LLM unavailable for {incident_id}: {exc}")
        return f"""# Incident Postmortem — {service}

> **Note:** generated without AI narration ({str(exc)[:200]}). Every section below
> comes from the recorded incident data and the deterministic analysis layers.

## Summary
- **Service:** `{service}` ({environment})
- **Severity:** {severity}
- **Detected via:** {detection_source}
- **Root cause:** {root_cause}

## Timeline
{timeline_str}

## Impact
- **Symptoms:** {symptoms}
- **Blast radius:** {blast_radius}

## Evidence
### Signals
{signals_text}
### Recent changes
{changes_text}
### Anomaly scoring
{anomaly_summary}

## Ranked Hypotheses
{hypotheses_text}

## Reasoning Chain
{reasoning_summary}

## Remediation
### Applied
- {fixes}
### Short-term
{suggested_fixes_short}
### Long-term
{suggested_fixes_long}
"""


@app.post("/api/v1/incidents/{incident_id}/postmortem")
@limiter.limit("10/minute")
async def generate_postmortem(
    request: Request,
    incident_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    import traceback
    _require_owned_incident(session, incident_id, current_user)
    try:
        markdown = await _generate_postmortem_markdown(incident_id, session)
        return {"postmortem": markdown}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Postmortem generation failed: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.post("/api/v1/incidents/{incident_id}/dispatch")
@limiter.limit("10/minute")
async def dispatch_postmortem(
    request: Request,
    incident_id: str,
    req: DispatchRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = _require_owned_incident(session, incident_id, current_user)

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
        raise HTTPException(status_code=400, detail="Missing Slack signature headers")

    try:
        if abs(datetime.now(timezone.utc).timestamp() - int(timestamp)) > 60 * 5:
            raise HTTPException(status_code=400, detail="Request timestamp too old")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp formatting")

    sig_basestring = f"v0:{timestamp}:{body_bytes.decode('utf-8')}"
    my_signature = "v0=" + hmac.HMAC(
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
@limiter.limit("60/minute")
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

        launch_background(process_slack_action, payload)

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
@limiter.limit("30/minute")
def simulate_slack_action(
    request: Request,
    req: SimulateSlackAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    incident = _require_owned_incident(session, req.incident_id, current_user)

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


# Bounded in-memory log — keeps only the last 1000 entries to prevent memory leaks.
# In production, consider persisting to the database instead.
chatops_activity_log: deque = deque(maxlen=1000)


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