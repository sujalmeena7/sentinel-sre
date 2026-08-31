"""Unit tests for the LLM fallback chain and the local embedding fallback.

Both exist because external providers fail in ways that used to take features
down silently: Groq retires model ids (404 model_not_found), OpenAI returns 429
once the quota is spent, and a quota-sharing gateway can have a model whose
upstream supply is drained while the gateway itself is up.
"""

import httpx
import pytest

import rag_engine
from rag_engine import (
    HashingEmbedding,
    LLMUnavailableError,
    candidate_llms,
    complete_with_fallback,
)


class _FakeResponse:
    def __init__(self, text):
        self.text = text


class _FakeLLM:
    """Minimal stand-in for a chat client.

    Accepts `timeout` because the real client does: the chain passes its
    remaining budget down, and a double that rejected the kwarg would hide a
    regression in that path.
    """

    def __init__(self, model, answer=None, error=None):
        self.model = model
        self.answer = answer
        self.error = error
        self.calls = 0
        self.timeouts = []

    def complete(self, prompt, timeout=None):
        self.calls += 1
        self.timeouts.append(timeout)
        if self.error:
            raise self.error
        return _FakeResponse(self.answer)


class _LegacyLLM(_FakeLLM):
    """A client whose `complete` takes no timeout — must still be callable."""

    def complete(self, prompt):  # noqa: D102
        return super().complete(prompt)


# ─── Fallback chain ─────────────────────────────────────────────────

def test_first_working_model_wins(monkeypatch):
    first = _FakeLLM("primary", answer="from primary")
    second = _FakeLLM("secondary", answer="from secondary")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [first, second])

    assert complete_with_fallback("prompt") == "from primary"
    assert second.calls == 0


def test_retired_model_falls_through_to_the_next(monkeypatch):
    """The real failure mode: `llama-3.3-70b-versatile` started 404-ing."""
    retired = _FakeLLM("retired", error=RuntimeError("model_not_found"))
    working = _FakeLLM("working", answer="narrative")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [retired, working])

    assert complete_with_fallback("prompt") == "narrative"
    assert retired.calls == 1


def test_all_models_failing_raises_with_every_reason(monkeypatch):
    monkeypatch.setattr(
        rag_engine,
        "candidate_llms",
        lambda: [
            _FakeLLM("a", error=RuntimeError("404 model_not_found")),
            _FakeLLM("b", error=RuntimeError("429 insufficient_quota")),
        ],
    )

    with pytest.raises(LLMUnavailableError) as excinfo:
        complete_with_fallback("prompt")

    message = str(excinfo.value)
    assert "model_not_found" in message
    assert "insufficient_quota" in message


def test_no_configured_model_raises(monkeypatch):
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [])
    with pytest.raises(LLMUnavailableError, match="No LLM configured"):
        complete_with_fallback("prompt")


def test_candidate_llms_is_empty_without_keys():
    """conftest blanks every provider key, so nothing can dial out during tests."""
    assert candidate_llms() == []


# ─── Per-attempt timeout and the whole-chain budget ─────────────────

def test_the_remaining_budget_is_passed_as_the_attempt_timeout(monkeypatch):
    """A pooled gateway needs a real deadline, and it must shrink as the chain
    burns through its budget rather than resetting per candidate."""
    llm = _FakeLLM("gateway-model", answer="ok")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [llm])
    monkeypatch.setattr(rag_engine, "LLM_TOTAL_BUDGET_SECONDS", 150.0)

    assert complete_with_fallback("prompt") == "ok"
    assert llm.timeouts[0] == pytest.approx(150.0, abs=2.0)


def test_a_caller_supplied_budget_overrides_the_default(monkeypatch):
    """Postmortem generation makes two chained completions in one request, so it
    passes half the budget; the attempt timeout must reflect that, not the
    module default."""
    llm = _FakeLLM("gateway-model", answer="ok")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [llm])
    monkeypatch.setattr(rag_engine, "LLM_TOTAL_BUDGET_SECONDS", 150.0)

    assert complete_with_fallback("prompt", budget_seconds=75.0) == "ok"
    assert llm.timeouts[0] == pytest.approx(75.0, abs=2.0)


def test_a_client_without_a_timeout_parameter_still_works(monkeypatch):
    legacy = _LegacyLLM("legacy", answer="narrative")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [legacy])

    assert complete_with_fallback("prompt") == "narrative"


def test_a_typeerror_from_inside_complete_is_not_retried_without_a_deadline(monkeypatch):
    """Probing for the kwarg by catching TypeError would swallow this and retry
    the call with no timeout at all."""
    exploding = _FakeLLM("boom", error=TypeError("unhashable type inside the client"))
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [exploding])

    with pytest.raises(LLMUnavailableError, match="unhashable type"):
        complete_with_fallback("prompt")

    assert exploding.calls == 1, "the failed attempt must not be repeated"


def test_the_chain_stops_once_the_total_budget_is_spent(monkeypatch):
    """Five candidates at 90s each would outlive gunicorn's 180s timeout and
    return a 502 instead of the caller's data-only fallback."""
    slow = _FakeLLM("slow", error=RuntimeError("timed out"))
    never_tried = _FakeLLM("never-tried", answer="unreachable")
    monkeypatch.setattr(rag_engine, "candidate_llms", lambda: [slow, never_tried])
    monkeypatch.setattr(rag_engine, "LLM_TOTAL_BUDGET_SECONDS", 0.0)

    with pytest.raises(LLMUnavailableError) as excinfo:
        complete_with_fallback("prompt")

    assert slow.calls == 1, "the first candidate always gets one attempt"
    assert never_tried.calls == 0
    message = str(excinfo.value)
    assert "timed out" in message
    assert "budget" in message, "the skip must be explained, not silent"


# ─── Gateway configuration ──────────────────────────────────────────

GATEWAY = {
    "gateway_api_key": "gw-key",
    "GATEWAY_BASE_URL": "https://gw.example.com/v1",
    "GATEWAY_MODEL": "deepseek-v4-flash",
}


def _configure_gateway(monkeypatch, **overrides):
    for attr, value in {**GATEWAY, **overrides}.items():
        monkeypatch.setattr(rag_engine, attr, value)


def test_the_gateway_leads_the_chain_ahead_of_the_direct_keys(monkeypatch):
    """The gateway holds the paid credit; the direct keys are what ran out."""
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(rag_engine, "groq_api_key", "gk")
    monkeypatch.setattr(rag_engine, "openai_api_key", "ok")
    monkeypatch.setattr(rag_engine, "GATEWAY_FALLBACK_MODELS", ("gw-second",))

    candidates = candidate_llms()
    models = [c.model for c in candidates]

    assert models[:2] == ["deepseek-v4-flash", "gw-second"]
    assert models[-1] == rag_engine.OPENAI_MODEL
    assert rag_engine.GROQ_MODEL in models
    assert candidates[0]._base_url == "https://gw.example.com/v1"


@pytest.mark.parametrize(
    "missing",
    ["gateway_api_key", "GATEWAY_BASE_URL", "GATEWAY_MODEL"],
)
def test_a_partially_configured_gateway_is_skipped_entirely(monkeypatch, missing):
    """A gateway with no model id would 404 on every call. Half-configured is
    not a usable provider, so it must not enter the chain at all."""
    _configure_gateway(monkeypatch, **{missing: ""})

    assert rag_engine.gateway_configured() is False
    assert candidate_llms() == []


def test_a_duplicate_gateway_fallback_is_not_tried_twice(monkeypatch):
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(
        rag_engine, "GATEWAY_FALLBACK_MODELS", ("deepseek-v4-flash", "other")
    )

    models = [c.model for c in candidate_llms()]
    assert models == ["deepseek-v4-flash", "other"]


def test_the_gateway_key_is_used_for_the_gateway_not_the_groq_url(monkeypatch):
    """Sending the gateway's key to api.groq.com would leak a credential to a
    provider it does not belong to."""
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(rag_engine, "groq_api_key", "gk")

    by_url = {c._base_url: c._api_key for c in candidate_llms()}
    assert by_url["https://gw.example.com/v1"] == "gw-key"
    assert by_url[rag_engine.GROQ_BASE_URL] == "gk"


# ─── Local embedding fallback ───────────────────────────────────────

def test_hashing_embedding_is_deterministic_and_normalised():
    embed = HashingEmbedding()
    first = embed._get_text_embedding("payment-api memory_usage 99% OOMKilled")
    second = embed._get_text_embedding("payment-api memory_usage 99% OOMKilled")

    assert first == second
    assert len(first) == embed.dim
    assert sum(v * v for v in first) == pytest.approx(1.0, abs=1e-6)


def test_hashing_embedding_ranks_related_text_higher():
    embed = HashingEmbedding()

    def dot(a, b):
        return sum(x * y for x, y in zip(a, b))

    query = embed._get_query_embedding("memory leak OOM killed container")
    related = embed._get_text_embedding("container OOMKilled after a memory leak")
    unrelated = embed._get_text_embedding("TLS certificate expired on the load balancer")

    assert dot(query, related) > dot(query, unrelated)


def test_empty_text_does_not_blow_up():
    embed = HashingEmbedding()
    assert embed._get_text_embedding("") == [0.0] * embed.dim


# ─── HTTPEmbedding: /embeddings for arbitrary providers ─────────────
#
# This class exists because `OpenAIEmbedding` validates `model` against a
# hardcoded enum of OpenAI's own model names and raises before sending a
# request, so it rejects every gateway-specific embedding id.

def _patch_embed_post(monkeypatch, payload, status_code=200, capture=None):
    def fake_post(url, headers=None, json=None, timeout=None):
        if capture is not None:
            capture.update({"url": url, "headers": headers or {}, "json": json or {}})
        return httpx.Response(status_code, json=payload)

    monkeypatch.setattr(rag_engine.httpx, "post", fake_post)


def _embedding_payload(vectors, indices=None):
    indices = indices if indices is not None else range(len(vectors))
    return {
        "object": "list",
        "data": [
            {"object": "embedding", "index": i, "embedding": v}
            for i, v in zip(indices, vectors)
        ],
    }


def _client(**kwargs):
    return rag_engine.HTTPEmbedding(
        model="gateway-embed-v9",
        api_key="gw-key",
        base_url="https://gw.example.com/v1",
        **kwargs,
    )


def test_a_gateway_specific_model_id_is_accepted(monkeypatch):
    """`OpenAIEmbedding` raises ValueError on this id before sending anything."""
    captured = {}
    _patch_embed_post(monkeypatch, _embedding_payload([[0.5, 0.5]]), capture=captured)

    vector = _client()._get_text_embedding("payment-api OOMKilled")

    assert vector == [0.5, 0.5]
    assert captured["url"] == "https://gw.example.com/v1/embeddings"
    assert captured["headers"]["Authorization"] == "Bearer gw-key"
    assert captured["json"]["model"] == "gateway-embed-v9"


def test_the_vector_width_is_discovered_from_the_response(monkeypatch):
    """Chroma needs a consistent width; guessing it would fail later as a
    dimension mismatch instead of here."""
    _patch_embed_post(monkeypatch, _embedding_payload([[0.1] * 1024]))

    client = _client()
    assert client.dim is None
    client._get_text_embedding("text")
    assert client.dim == 1024


def test_out_of_order_rows_are_realigned_with_their_inputs(monkeypatch):
    """The protocol does not promise response order. Trusting it would attach
    each incident's vector to another incident's text — corrupting retrieval
    silently rather than failing."""
    _patch_embed_post(
        monkeypatch,
        _embedding_payload([[3.0], [1.0], [2.0]], indices=[2, 0, 1]),
    )

    assert _client()._get_text_embeddings(["first", "second", "third"]) == [
        [1.0],
        [2.0],
        [3.0],
    ]


def test_a_truncated_batch_raises_instead_of_misaligning(monkeypatch):
    _patch_embed_post(monkeypatch, _embedding_payload([[1.0], [2.0]]))

    with pytest.raises(RuntimeError, match="count mismatch"):
        _client()._get_text_embeddings(["a", "b", "c"])


def test_an_unsupported_endpoint_surfaces_the_provider_error(monkeypatch):
    """Most gateways proxy chat only; `embedding_backend` catches this and falls
    back, but the reason has to reach the log."""
    _patch_embed_post(monkeypatch, {"error": {"message": "no such endpoint"}}, status_code=404)

    with pytest.raises(RuntimeError, match="no such endpoint"):
        _client()._get_text_embedding("text")


def test_a_malformed_payload_raises_rather_than_returning_junk(monkeypatch):
    _patch_embed_post(monkeypatch, {"unexpected": "shape"})

    with pytest.raises(RuntimeError, match="Malformed embedding response"):
        _client()._get_text_embedding("text")


# ─── Which embedding backend is chosen ──────────────────────────────

@pytest.fixture(autouse=True)
def _reset_embedding_backend():
    """`embedding_backend` memoises its answer; without this the first test to
    resolve it would fix the result for every test after it."""
    yield
    rag_engine._embed_backend = None


def test_the_gateway_is_not_used_for_embeddings_unless_a_model_is_named(monkeypatch):
    """Most gateways proxy chat only. Assuming otherwise fails on every indexed
    incident, not once, so this opt-in is deliberate."""
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(rag_engine, "GATEWAY_EMBED_MODEL", "")
    monkeypatch.setattr(
        rag_engine.httpx, "post", lambda *a, **k: pytest.fail("no embedding call expected")
    )

    assert rag_engine.embedding_backend() == "local"


def test_an_unreachable_gateway_embedding_endpoint_falls_back_to_local(monkeypatch):
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(rag_engine, "GATEWAY_EMBED_MODEL", "gateway-embed-v9")
    _patch_embed_post(monkeypatch, {"error": {"message": "not supported"}}, status_code=404)

    assert rag_engine.embedding_backend() == "local"
    assert rag_engine._collection_name() == "incidents_local_v1"


def test_a_working_gateway_embedding_model_gets_its_own_collection(monkeypatch):
    """Two embedding models of different width cannot share one Chroma
    collection, and `incidents` stays reserved for the OpenAI backend so an
    existing deployment does not orphan the vectors it already has."""
    _configure_gateway(monkeypatch)
    monkeypatch.setattr(rag_engine, "GATEWAY_EMBED_MODEL", "gateway-embed-v9")
    _patch_embed_post(monkeypatch, _embedding_payload([[0.1] * 768]))

    assert rag_engine.embedding_backend() == "gateway"
    assert rag_engine._collection_name() == "incidents_gw_gateway_embed_v9"
