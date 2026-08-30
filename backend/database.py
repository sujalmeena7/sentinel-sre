import os
import logging
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text
from sqlalchemy.pool import QueuePool

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    """True on a hosted deploy. Render/Vercel set their own marker vars."""
    env = (os.getenv("APP_ENV") or os.getenv("ENV") or "").lower()
    return env in {"production", "prod"} or bool(os.getenv("RENDER") or os.getenv("VERCEL"))


def _normalise_database_url(raw: str) -> str:
    """Coerce a provider-supplied URL into one SQLAlchemy 2.x actually accepts.

    Render (and Heroku) hand out `postgres://...`, a scheme SQLAlchemy 2.x
    dropped: `create_engine` fails at import time with
    "Can't load plugin: sqlalchemy.dialects:postgres", the worker dies, and the
    platform reports an opaque 502 with no application log to explain it.
    Rewriting the scheme here is the difference between a working deploy and an
    unbootable one.
    """
    url = (raw or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


# Use DATABASE_URL from environment with SQLite as fallback
DATABASE_URL = _normalise_database_url(os.getenv("DATABASE_URL", "")) or "sqlite:///./incidents.db"

# SQLite requires check_same_thread=False for FastAPI concurrency.
# Other DBs (Postgres, MySQL) should not use this argument.
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

if is_sqlite and _is_production():
    # A container filesystem is ephemeral: every redeploy silently resets the
    # database. Loud at boot beats "why did my users disappear?" later.
    logger.error(
        "DATABASE_URL is unset or SQLite while APP_ENV=production. Data will be "
        "LOST on every redeploy — provision a managed Postgres and set DATABASE_URL."
    )

# Postgres needs a statement timeout so one pathological query cannot pin a
# connection forever on a single-worker deploy.
if not is_sqlite:
    connect_args = {
        "connect_timeout": 10,
        "options": "-c statement_timeout=30000",
        "application_name": "sentinel-sre",
    }

# Production Postgres connection pooling settings
pool_kwargs = {}
if not is_sqlite:
    pool_kwargs = {
        "poolclass": QueuePool,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800,  # Recycle connections every 30 minutes
        "pool_pre_ping": True,  # Verify connections are alive before use
    }

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args, **pool_kwargs)


def _safe_ddl(stmt: str) -> None:
    """Run a DDL statement in its OWN transaction.

    On Postgres, a failed statement aborts the entire surrounding transaction,
    poisoning every subsequent statement. By opening a fresh transaction per
    DDL we keep migrations idempotent and independent.
    """
    try:
        with engine.begin() as conn:
            conn.execute(text(stmt))
    except Exception as exc:  # broad by design — migrations are idempotent
        msg = str(exc).lower()
        if "exist" in msg or "duplicate" in msg:
            return
        logger.debug(f"DDL skipped: {stmt[:80]}... ({exc})")


def init_db():
    """Create tables, run idempotent column migrations, backfill user_id."""
    SQLModel.metadata.create_all(engine)

    # ── Legacy Incident column migrations (pre-auth) ──
    _safe_ddl("ALTER TABLE incident ADD COLUMN expected_cause VARCHAR")
    _safe_ddl("ALTER TABLE incident ADD COLUMN predicted_cause VARCHAR")
    _safe_ddl("ALTER TABLE incident ADD COLUMN is_correct BOOLEAN")
    _safe_ddl("ALTER TABLE incident ADD COLUMN human_feedback_score INTEGER DEFAULT 0")
    _safe_ddl("ALTER TABLE incident ADD COLUMN human_feedback_count INTEGER DEFAULT 0")
    _safe_ddl("ALTER TABLE incident ADD COLUMN human_feedback_comment VARCHAR")

    # ── Multi-tenancy: add user_id FK column to incident ──
    _safe_ddl("ALTER TABLE incident ADD COLUMN user_id VARCHAR")
    _safe_ddl("CREATE INDEX IF NOT EXISTS ix_incident_user_id ON incident (user_id)")

    # ── Async analysis tracking (non-blocking analyze pipeline) ──
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_status VARCHAR DEFAULT 'idle'")
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_result JSON")
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_error VARCHAR")
    _safe_ddl("CREATE INDEX IF NOT EXISTS ix_incident_analysis_status ON incident (analysis_status)")

    # ── Email verification flow ──
    # Add as nullable first so existing rows aren't rejected, then backfill
    # them as verified (so we don't lock pre-existing users out). New rows use
    # the application-level default (False) from the SQLModel definition.
    _safe_ddl("ALTER TABLE \"user\" ADD COLUMN email_verified BOOLEAN")
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE \"user\" SET email_verified = TRUE WHERE email_verified IS NULL"
            ))
    except Exception as exc:
        logger.debug(f"email_verified backfill skipped: {exc}")


def db_healthy() -> tuple[bool, str]:
    """Cheap liveness probe for /health. Returns (ok, detail).

    Exists so a broken database surfaces as a readable JSON payload instead of
    an opaque platform 502 — the failure mode that made the last outage
    undiagnosable from outside the host.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "sqlite" if is_sqlite else "postgres"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {str(exc)[:200]}"


def get_session():
    with Session(engine) as session:
        yield session