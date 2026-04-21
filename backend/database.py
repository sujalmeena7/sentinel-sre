import os
import logging
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Use DATABASE_URL from environment with SQLite as fallback
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./incidents.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite requires check_same_thread=False for FastAPI concurrency.
# Other DBs (Postgres, MySQL) should not use this argument.
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def _safe_ddl(stmt: str) -> None:
    """Run a DDL statement in its own transaction, ignore 'already exists' errors."""
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
    # Index on user_id for tenant-scoped queries (both dialects).
    _safe_ddl("CREATE INDEX IF NOT EXISTS ix_incident_user_id ON incident (user_id)")

    # ── Async analysis tracking (non-blocking analyze pipeline) ──
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_status VARCHAR DEFAULT 'idle'")
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_result JSON")
    _safe_ddl("ALTER TABLE incident ADD COLUMN analysis_error VARCHAR")
    _safe_ddl("CREATE INDEX IF NOT EXISTS ix_incident_analysis_status ON incident (analysis_status)")


def get_session():
    with Session(engine) as session:
        yield session