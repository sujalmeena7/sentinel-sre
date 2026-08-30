"""Unit tests for the LLM fallback chain and the local embedding fallback.

Both exist because external providers fail in ways that used to take features
down silently: Groq retires model ids (404 model_not_found) and OpenAI returns
429 once the quota is spent.
"""

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
    """Minimal stand-in for a llama-index LLM."""

    def __init__(self, model, answer=None, error=None):
        self.model = model
        self.answer = answer
        self.error = error
        self.calls = 0

    def complete(self, prompt):
        self.calls += 1
        if self.error:
            raise self.error
        return _FakeResponse(self.answer)


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
    """conftest blanks both API keys, so nothing can dial out during tests."""
    assert candidate_llms() == []


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
