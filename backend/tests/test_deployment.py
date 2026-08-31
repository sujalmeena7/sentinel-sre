"""Tests for the things that only break in a deployed environment.

Every case here corresponds to a real production failure: an OOM-killed worker,
a scheme SQLAlchemy refuses to load, a CORS allowlist that omitted the live
domain, and a boot sequence that turned one broken subsystem into a total
outage with no way to diagnose it from outside the host.
"""

import sys
from pathlib import Path

import httpx
import pytest

import database
import rag_engine
from database import _normalise_database_url
from rag_engine import ChatCompletionLLM


# ─── Memory footprint: the OOM regression guard ─────────────────────

FORBIDDEN_MODULES = ("torch", "transformers", "sklearn")


def test_importing_the_app_does_not_pull_in_the_ml_stack():
    """`llama_index.llms.groq` costs 282 MB of RSS via torch + transformers.

    That overshot the 512 MB instance and the worker was OOM-killed on boot, so
    the platform served a bare 502. Completion goes over plain httpx instead;
    this test fails loudly if anyone reintroduces the heavy import.
    """
    import main  # noqa: F401  (conftest already imported it; this is explicit)

    leaked = [name for name in FORBIDDEN_MODULES if name in sys.modules]
    assert not leaked, (
        f"{leaked} was imported — this adds ~282 MB RSS and will OOM a 512 MB host. "
        "Do not import llama_index.llms.*; use rag_engine.ChatCompletionLLM."
    )


def test_llama_index_llm_integrations_are_not_imported():
    """`llama_index.llms` itself is an empty namespace package and harmless; it
    is the concrete integrations under it that drag in the ML stack."""
    loaded = [m for m in sys.modules if m.startswith("llama_index.llms.")]
    assert not loaded, f"{loaded} pulls transformers/torch — use ChatCompletionLLM instead"


# ─── DATABASE_URL normalisation ─────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected",
    [
        # Render/Heroku hand out `postgres://`, which SQLAlchemy 2.x refuses to
        # load ("Can't load plugin: sqlalchemy.dialects:postgres") — the app dies
        # at import, before it can log anything useful.
        ("postgres://u:p@host:5432/db", "postgresql+psycopg2://u:p@host:5432/db"),
        ("postgresql://u:p@host:5432/db", "postgresql+psycopg2://u:p@host:5432/db"),
        # Already explicit, and non-Postgres URLs, must pass through untouched.
        ("postgresql+psycopg2://u:p@host/db", "postgresql+psycopg2://u:p@host/db"),
        ("sqlite:///./incidents.db", "sqlite:///./incidents.db"),
        ("  postgres://u:p@h/db  ", "postgresql+psycopg2://u:p@h/db"),
        ("", ""),
    ],
)
def test_normalise_database_url(raw, expected):
    assert _normalise_database_url(raw) == expected


def test_db_healthy_reports_ok_against_the_test_database():
    ok, detail = database.db_healthy()
    assert ok is True
    assert detail in {"sqlite", "postgres"}


# ─── CORS allowlist ────────────────────────────────────────────────

def test_the_live_production_origin_is_allowed():
    """Regression: `sentinelsre.vercel.app` (no hyphen) matched neither the
    explicit list nor the old `sentinel-sre[a-z0-9-]*` regex, so every browser
    call from the real site was CORS-blocked while localhost worked."""
    import re

    import main

    origin = "https://sentinelsre.vercel.app"
    assert origin in main._allowed_origins() or re.fullmatch(main._ORIGIN_REGEX, origin)


@pytest.mark.parametrize(
    "origin",
    [
        "https://sentinelsre.vercel.app",
        "https://sentinel-sre.vercel.app",
        "https://sentinel-sre-zeta.vercel.app",
        "https://sentinel-sre-git-main-someone.vercel.app",
        "http://localhost:3000",
    ],
)
def test_expected_origins_are_permitted(origin):
    import re

    import main

    assert origin in main._allowed_origins() or re.fullmatch(main._ORIGIN_REGEX, origin)


@pytest.mark.parametrize(
    "origin",
    ["https://evil.com", "https://sentinelsre.vercel.app.evil.com", "https://notsentinel.vercel.app"],
)
def test_unrelated_origins_are_still_rejected(origin):
    import re

    import main

    assert origin not in main._allowed_origins()
    assert not re.fullmatch(main._ORIGIN_REGEX, origin)


def test_configured_origins_are_added_to_the_defaults(monkeypatch):
    import main

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://custom.example.com, https://second.example.com/")
    origins = main._allowed_origins()

    assert "https://custom.example.com" in origins
    assert "https://second.example.com" in origins, "trailing slash should be stripped"
    assert "http://localhost:3000" in origins, "defaults must survive"


# ─── ChatCompletionLLM: the httpx replacement for llama-index LLMs ──

class _StubTransport:
    """Serves canned responses so nothing dials out."""

    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload
        self.requests = []


def _patch_post(monkeypatch, status_code, payload, capture=None):
    def fake_post(url, headers=None, json=None, timeout=None):
        if capture is not None:
            capture.update({"url": url, "headers": headers or {}, "json": json or {}, "timeout": timeout})
        return httpx.Response(status_code, json=payload) if isinstance(payload, (dict, list)) \
            else httpx.Response(status_code, text=payload)

    monkeypatch.setattr(rag_engine.httpx, "post", fake_post)


def test_completion_returns_the_message_content(monkeypatch):
    captured = {}
    _patch_post(
        monkeypatch,
        200,
        {"choices": [{"message": {"content": "the narrative"}}]},
        capture=captured,
    )

    llm = ChatCompletionLLM(model="openai/gpt-oss-120b", api_key="k", base_url="https://api.groq.com/openai/v1")
    assert llm.complete("why did it fail?").text == "the narrative"

    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer k"
    assert captured["json"]["model"] == "openai/gpt-oss-120b"
    assert captured["json"]["messages"] == [{"role": "user", "content": "why did it fail?"}]
    assert captured["timeout"] == rag_engine.LLM_TIMEOUT_SECONDS


def test_a_trailing_slash_in_the_base_url_does_not_double_up(monkeypatch):
    captured = {}
    _patch_post(monkeypatch, 200, {"choices": [{"message": {"content": "ok"}}]}, capture=captured)

    ChatCompletionLLM(model="m", api_key="k", base_url="https://api.groq.com/openai/v1/").complete("p")
    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"


def test_provider_error_text_is_preserved(monkeypatch):
    """The fallback chain and its logs key off phrases like `model_not_found`."""
    _patch_post(monkeypatch, 404, {"error": {"code": "model_not_found"}})

    llm = ChatCompletionLLM(model="retired", api_key="k", base_url="https://api.groq.com/openai/v1")
    with pytest.raises(RuntimeError, match="model_not_found"):
        llm.complete("p")


def test_quota_exhaustion_surfaces_as_an_error(monkeypatch):
    _patch_post(monkeypatch, 429, {"error": {"code": "insufficient_quota"}})

    llm = ChatCompletionLLM(model="gpt-4o-mini", api_key="k", base_url="https://api.openai.com/v1")
    with pytest.raises(RuntimeError, match="insufficient_quota"):
        llm.complete("p")


def test_malformed_payload_raises_instead_of_returning_none(monkeypatch):
    _patch_post(monkeypatch, 200, {"unexpected": "shape"})

    llm = ChatCompletionLLM(model="m", api_key="k", base_url="https://x/v1")
    with pytest.raises(RuntimeError, match="Malformed completion response"):
        llm.complete("p")


def test_null_content_becomes_an_empty_string(monkeypatch):
    _patch_post(monkeypatch, 200, {"choices": [{"message": {"content": None}}]})

    llm = ChatCompletionLLM(model="m", api_key="k", base_url="https://x/v1")
    assert llm.complete("p").text == ""


def test_candidate_llms_builds_the_groq_chain_then_openai(monkeypatch):
    monkeypatch.setattr(rag_engine, "groq_api_key", "gk")
    monkeypatch.setattr(rag_engine, "openai_api_key", "ok")
    # No gateway configured — this test is about the direct-key chain.
    monkeypatch.setattr(rag_engine, "gateway_api_key", "")

    candidates = rag_engine.candidate_llms()

    assert all(isinstance(c, ChatCompletionLLM) for c in candidates)
    # Configured Groq model first, its fallbacks next, OpenAI last.
    assert candidates[0].model == rag_engine.GROQ_MODEL
    assert candidates[-1].model == rag_engine.OPENAI_MODEL
    assert [c.model for c in candidates] == list(
        dict.fromkeys([rag_engine.GROQ_MODEL, *rag_engine.GROQ_FALLBACK_MODELS])
    ) + [rag_engine.OPENAI_MODEL]


def test_a_duplicate_groq_model_override_is_not_tried_twice(monkeypatch):
    """Setting GROQ_MODEL to one of the fallbacks must not double the attempt."""
    monkeypatch.setattr(rag_engine, "gateway_api_key", "")
    monkeypatch.setattr(rag_engine, "groq_api_key", "gk")
    monkeypatch.setattr(rag_engine, "openai_api_key", "")
    monkeypatch.setattr(rag_engine, "GROQ_MODEL", rag_engine.GROQ_FALLBACK_MODELS[0])

    models = [c.model for c in rag_engine.candidate_llms()]
    assert len(models) == len(set(models))


# ─── Gunicorn settings that are correctness, not tuning ─────────────

def _gunicorn_config() -> dict:
    """Evaluate gunicorn.conf.py without importing gunicorn.

    gunicorn itself is POSIX-only (`import fcntl`), so it cannot be imported on
    a Windows dev box. The config file only needs `os`, so exec'ing it directly
    keeps this test runnable everywhere the rest of the suite is.
    """
    path = Path(__file__).resolve().parent.parent / "gunicorn.conf.py"
    assert path.exists(), (
        "backend/gunicorn.conf.py is missing. Gunicorn auto-loads it from the "
        "working directory, which is how the timeout below survives a hand-typed "
        "start command that omits --timeout."
    )
    namespace: dict = {}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), namespace)
    return namespace


def test_worker_count_is_pinned_to_one():
    """Background analysis keeps its task registry in process memory.

    A second worker accepts the status poll for a task it never started and
    reports it missing, so the UI polls forever. Render also derives
    WEB_CONCURRENCY from the CPU count, which would scale this up silently —
    hence pinning it in the config rather than trusting the start command.
    """
    assert _gunicorn_config()["workers"] == 1


def test_the_request_timeout_outlives_a_postmortem_llm_call():
    """Postmortem generation is a synchronous LLM call that runs past a minute.

    Gunicorn's default 30s kills the worker mid-request and returns a WORKER
    TIMEOUT with no application error explaining it.
    """
    config = _gunicorn_config()
    assert config["timeout"] >= 120, "must exceed a slow postmortem generation"
    assert config["timeout"] > rag_engine.LLM_TIMEOUT_SECONDS, (
        "the worker must not be killed before the LLM call it is waiting on "
        "has had a chance to time out and be handled"
    )


def test_the_whole_fallback_chain_fits_inside_the_request_timeout():
    """The invariant that matters once a slow gateway leads the chain.

    Per-candidate timeouts alone do not bound the chain: five candidates at
    LLM_TIMEOUT_SECONDS each runs far past gunicorn's limit, and the worker is
    killed before `_generate_postmortem_markdown` can catch LLMUnavailableError
    and return its data-only document — the user gets a 502 instead of a
    postmortem the app already had the facts for.
    """
    config = _gunicorn_config()
    assert rag_engine.LLM_TOTAL_BUDGET_SECONDS < config["timeout"], (
        f"the chain budget ({rag_engine.LLM_TOTAL_BUDGET_SECONDS}s) must leave "
        f"gunicorn's {config['timeout']}s timeout room to return the fallback"
    )
    assert rag_engine.LLM_TIMEOUT_SECONDS <= rag_engine.LLM_TOTAL_BUDGET_SECONDS, (
        "a single attempt may not be allowed to outlast the budget for the whole chain"
    )


def test_two_chained_completions_also_fit_inside_the_request_timeout():
    """Postmortem generation runs the analysis chain and then narrates the
    document, both synchronously in one request. Two full budgets would be 300s
    against a 180s ceiling, so that path passes LLM_CHAINED_BUDGET_SECONDS."""
    config = _gunicorn_config()
    assert 2 * rag_engine.LLM_CHAINED_BUDGET_SECONDS < config["timeout"], (
        f"two legs at {rag_engine.LLM_CHAINED_BUDGET_SECONDS}s exceed gunicorn's "
        f"{config['timeout']}s timeout"
    )
    # A leg still has to be long enough to be useful: the measured median for a
    # real narrative on a pooled gateway is ~40s.
    assert rag_engine.LLM_CHAINED_BUDGET_SECONDS >= 60, (
        "a leg this short would time out on a gateway before the first token"
    )


def test_keepalive_exceeds_the_upstream_proxy_idle_timeout():
    """Below the proxy's idle timeout, the proxy reuses a socket gunicorn has
    already closed and the client sees an intermittent 502."""
    assert _gunicorn_config()["keepalive"] >= 60


# ─── Health & diagnostics ───────────────────────────────────────────

def test_health_stays_trivial(client):
    """The platform polls this to decide liveness — it must not touch the DB."""
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert "degraded" not in body


def test_versioned_health_reports_degradation(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["degraded"] is False
    assert body["degraded_subsystems"] == []


def test_versioned_health_flags_a_failed_startup_step(client, app_module, monkeypatch):
    monkeypatch.setitem(app_module.STARTUP_STATUS, "database", "failed: OperationalError: gone")

    body = client.get("/api/v1/health").json()
    assert body["degraded"] is True
    assert "database" in body["degraded_subsystems"]


def test_diagnostics_is_open_when_no_token_is_set_outside_production(client):
    body = client.get("/api/v1/diagnostics").json()

    assert body["database"]["ok"] is True
    assert body["providers"]["groq_key_present"] is False, "conftest blanks the keys"
    assert "https://sentinelsre.vercel.app" in body["cors_allowed_origins"]
    assert "startup" in body


def test_diagnostics_requires_the_token_once_one_is_configured(client, monkeypatch):
    monkeypatch.setenv("DIAGNOSTICS_TOKEN", "s3cret")

    assert client.get("/api/v1/diagnostics").status_code == 404
    assert client.get("/api/v1/diagnostics?token=wrong").status_code == 404
    assert client.get("/api/v1/diagnostics?token=s3cret").status_code == 200
    assert client.get(
        "/api/v1/diagnostics", headers={"X-Diagnostics-Token": "s3cret"}
    ).status_code == 200


def test_diagnostics_never_returns_secret_values(client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-super-secret-value")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-another-secret")
    monkeypatch.setenv("LLM_GATEWAY_API_KEY", "gw-third-secret")

    payload = client.get("/api/v1/diagnostics").text

    assert "gsk-super-secret-value" not in payload
    assert "sk-another-secret" not in payload
    assert "gw-third-secret" not in payload


def test_diagnostics_reports_the_model_chain_that_would_be_tried(client, monkeypatch):
    """"Why is there no narrative?" starts with "is the gateway even in the
    chain?". Model ids are configuration, not secrets, so the order is reported
    while the keys behind it are not."""
    monkeypatch.setattr(rag_engine, "gateway_api_key", "gw-key")
    monkeypatch.setattr(rag_engine, "GATEWAY_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(rag_engine, "GATEWAY_MODEL", "gateway-primary")
    monkeypatch.setattr(rag_engine, "GATEWAY_FALLBACK_MODELS", ("gateway-backup",))
    monkeypatch.setattr(rag_engine, "groq_api_key", "gk")

    providers = client.get("/api/v1/diagnostics").json()["providers"]

    assert providers["gateway_configured"] is True
    assert providers["llm_chain"][:2] == ["gateway-primary", "gateway-backup"]
    assert rag_engine.GROQ_MODEL in providers["llm_chain"], "the free tier stays as a fallback"


def test_diagnostics_is_hidden_in_production_without_a_token(client, monkeypatch):
    """Better to 404 than to expose provider configuration to the internet."""
    monkeypatch.delenv("DIAGNOSTICS_TOKEN", raising=False)
    monkeypatch.setattr("main._is_production_env", lambda: True)

    assert client.get("/api/v1/diagnostics").status_code == 404
