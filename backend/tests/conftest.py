"""
Hermetic test setup for the Sentinel-SRE backend.

Everything here runs offline: a throwaway SQLite file per session, no LLM
calls, no ChromaDB writes, and rate limiting disabled. Import order matters —
env vars must be set before `main` is imported, because module import builds
the engine and reads the JWT secret.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Iterator

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# ─── Environment (must precede `import main`) ────────────────────────
_TMP_DB = Path(tempfile.mkdtemp(prefix="sentinel-test-")) / "test.db"

os.environ["JWT_SECRET"] = "test-secret-not-used-anywhere-else-0123456789"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["ADMIN_EMAIL"] = "admin@sentinel-sre.dev"
os.environ["ADMIN_PASSWORD"] = "AdminTest12345"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
# Vector store in a throwaway dir, and no startup re-index: the suite never
# exercises ChromaDB, and writing into the repo's chroma_db would pollute dev data.
os.environ["CHROMA_PATH"] = str(_TMP_DB.parent / "chroma")
os.environ["RAG_INDEX_BACKFILL"] = "0"
# No mail provider, no LLM keys, no outbound webhooks — keeps the suite offline.
# These are set to "" rather than deleted: `main` and `rag_engine` both call
# load_dotenv(), which would otherwise re-populate them from the developer's
# real backend/.env. python-dotenv leaves already-present keys alone.
for _key in (
    "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    "SLACK_WEBHOOK_URL", "TEAMS_WEBHOOK_URL",
    "ALLOW_UNVERIFIED_LOGIN", "RENDER", "VERCEL",
    "GROQ_API_KEY", "OPENAI_API_KEY",
):
    os.environ[_key] = ""


ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


@pytest.fixture(scope="session")
def app_module():
    """Import `main` once, with the heavy RAG/LLM layers stubbed out."""
    import main as main_module

    # Rate limits are stateful and in-memory; they would make the suite
    # order-dependent.
    main_module.limiter.enabled = False

    # Never touch ChromaDB or an embedding API during tests.
    main_module.add_incident_to_index = lambda *a, **k: None
    main_module.update_incident_in_index = lambda *a, **k: None

    return main_module


@pytest.fixture(scope="session")
def client(app_module) -> Iterator["object"]:
    """TestClient with the startup hook executed (seeds the admin user)."""
    from fastapi.testclient import TestClient

    with TestClient(app_module.app) as test_client:
        yield test_client


@pytest.fixture
def make_user(client):
    """Register a fresh tenant and return (auth_headers, user_dict).

    The address is randomised rather than counted: the DB lives for the whole
    session, so a per-test counter would collide and register would 409.
    """

    def _make(password: str = "Passw0rdTest"):
        tenant = uuid.uuid4().hex[:12]
        email = f"tenant-{tenant}@example.com"
        res = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "name": f"Tenant {tenant}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        headers = {"Authorization": f"Bearer {body['access_token']}"}
        return headers, body

    return _make
