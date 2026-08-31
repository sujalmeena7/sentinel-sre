"""
RAG Engine — Production-Grade Feedback-Aware Retrieval
------------------------------------------------------
Handles ChromaDB vector indexing, metadata-filtered retrieval,
and structured LLM prompting with explicit positive/negative
feedback routing.

Hardening features:
  - Minimum vote threshold before labeling (anti-noise)
  - Logarithmic positive weighting with dampened negatives
  - Hard weight cap (anti-poisoning)
  - Service + failure_type metadata filtering
  - Unrated fallback logic when positives are sparse
  - Structured split-prompt architecture for LLM
"""

import os
import math
import hashlib
import inspect
import logging
import re
import threading
import time
from typing import List, NamedTuple, Optional
import chromadb
import httpx
from dotenv import load_dotenv

# Provide a global lock for ChromaDB to prevent SQLite SIGABRT crashes under concurrency
chroma_lock = threading.Lock()
from llama_index.core import VectorStoreIndex, Document, StorageContext, Settings
from llama_index.core.embeddings import BaseEmbedding
from llama_index.core.vector_stores.types import MetadataFilters, ExactMatchFilter
from llama_index.vector_stores.chroma import ChromaVectorStore

# NOTE: `llama_index.llms.groq` / `llama_index.llms.openai` are deliberately NOT
# imported — they drag in torch + transformers (282 MB RSS, measured) to make an
# HTTP call. Completion goes through ChatCompletionLLM below instead. Retrieval
# here is embedding-only and never needs a llama-index LLM object.
from llama_index.embeddings.openai import OpenAIEmbedding

load_dotenv()
logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────
MIN_VOTES_FOR_LABEL = 3       # Minimum votes before we trust the label
POSITIVE_RATIO_THRESHOLD = 0.3
NEGATIVE_RATIO_THRESHOLD = -0.3
MAX_WEIGHT = 10.0             # Hard cap to prevent feedback poisoning
RETRIEVAL_BATCH_SIZE = 8      # How many candidates to pull from ChromaDB
MAX_POSITIVES = 3             # Max positive examples sent to LLM
MAX_NEGATIVES = 2             # Max negative examples sent to LLM
MAX_UNRATED = 2               # Max unrated fallback examples

_chroma_client = None
_chroma_collection = None
_vector_store = None
_storage_context = None

# Overridable so a deployment can point the vector store at a mounted disk and
# the test suite can use a throwaway directory.
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

def get_chroma_components():
    global _chroma_client, _chroma_collection, _vector_store, _storage_context
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
        _chroma_collection = _chroma_client.get_or_create_collection(_collection_name())
        _vector_store = ChromaVectorStore(chroma_collection=_chroma_collection)
        _storage_context = StorageContext.from_defaults(vector_store=_vector_store)
    return _chroma_client, _chroma_collection, _vector_store, _storage_context


def vector_count() -> int:
    """Number of vectors in the active collection."""
    _, chroma_collection, _, _ = get_chroma_components()
    with chroma_lock:
        return chroma_collection.count()

# ─── LLM Setup (ordered chain: gateway, then Groq models, then OpenAI) ─
# Every provider here speaks the same OpenAI `/chat/completions` protocol, so a
# provider is only ever three values: a key, a base URL and a model id. That is
# what makes an arbitrary OpenAI-compatible gateway a config change rather than
# a code change.
gateway_api_key = os.getenv("LLM_GATEWAY_API_KEY", "")
groq_api_key = os.getenv("GROQ_API_KEY", "")
openai_api_key = os.getenv("OPENAI_API_KEY", "")

# The gateway is tried first when configured: it is the provider with credit on
# it, and the direct Groq/OpenAI keys behind it are the free-tier remnants.
# There is no default model id — a gateway's catalogue is its own, and guessing
# one would produce a 404 that looks like an outage. Configure all three or the
# gateway is skipped entirely.
GATEWAY_BASE_URL = os.getenv("LLM_GATEWAY_BASE_URL", "").strip()
GATEWAY_MODEL = os.getenv("LLM_GATEWAY_MODEL", "").strip()
# Comma-separated. A quota-sharing gateway pools many upstream keys, so a model
# can be "supply exhausted" for a while without the gateway itself being down —
# naming a second and third choice is what keeps the narrative alive.
GATEWAY_FALLBACK_MODELS = tuple(
    m.strip() for m in os.getenv("LLM_GATEWAY_FALLBACK_MODELS", "").split(",") if m.strip()
)

# Groq retires models regularly — a hardcoded id eventually starts returning
# 404 model_not_found and silently kills every narrative. The id is therefore
# configurable, and unreachable models are skipped at call time.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FALLBACK_MODELS = ("openai/gpt-oss-20b", "groq/compound-mini")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

# 90s, not the old 20s. A pooled gateway is far slower than a direct Groq call:
# the observed profile for a flash-class model is first-content P50 ~11s / P95
# ~28s and a successful-call P95 of ~56s, because the gateway retries and
# switches among upstream keys behind the scenes. A 20s ceiling cut off the
# majority of P95 calls and surfaced as "every model failed".
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "90"))

# Wall-clock ceiling for a whole fallback chain, per call site. Postmortem
# generation is synchronous inside a request that gunicorn severs at 180s
# (see gunicorn.conf.py), while the chain can be five candidates long — at 90s
# each that is 450s of trying, so the proxy would kill the request and the user
# would get a 502 instead of the data-only postmortem the code already has
# ready. The budget makes the chain give up while there is still time to
# degrade gracefully.
LLM_TOTAL_BUDGET_SECONDS = float(os.getenv("LLM_TOTAL_BUDGET_SECONDS", "150"))

# Budget for one leg of a request that makes two chained LLM calls. Postmortem
# generation runs the analysis pipeline (one chain) and then narrates the
# document (a second chain) inside a single synchronous request, so two full
# budgets would be 300s against gunicorn's 180s ceiling — the worker dies before
# the handler can catch LLMUnavailableError and return its data-only document.
# Measured median for a real narrative on this gateway is ~40s, so half the
# budget still covers one attempt plus a retry.
LLM_CHAINED_BUDGET_SECONDS = LLM_TOTAL_BUDGET_SECONDS / 2

# Shorter than LLM_TIMEOUT_SECONDS: below this there is no point starting
# another provider, since a flash-class model rarely returns first content in
# under ~10s.
_MIN_ATTEMPT_SECONDS = 12.0


class LLMUnavailableError(RuntimeError):
    """Raised when every configured model failed or none is configured."""


class ChatCompletionLLM:
    """Minimal OpenAI-protocol chat client over httpx.

    This replaces `llama_index.llms.groq.Groq` / `llama_index.llms.openai.OpenAI`
    for text completion, and the reason is memory, not style: importing
    `llama_index.llms.groq` transitively pulls torch, transformers, sklearn and
    scipy, which costs **282 MB of RSS** — measured — purely to make an HTTPS
    request. On a 512 MB host that is the difference between booting and being
    OOM-killed, which is what took the last deploy down. Importing `main` drops
    from 397 MB to 128 MB with this class in place.

    Groq and OpenAI both speak `/chat/completions`, so one client covers both —
    and so does any OpenAI-compatible gateway, which is why pointing this at a
    third-party gateway needs no new code, only a base URL and a model id.
    The `.model` attribute and `.complete(prompt).text` shape are kept so
    `complete_with_fallback` and its tests are unaffected.
    """

    class _Response:
        __slots__ = ("text",)

        def __init__(self, text: str):
            self.text = text

    def __init__(self, model: str, api_key: str, base_url: str, timeout: float = LLM_TIMEOUT_SECONDS):
        self.model = model
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def complete(self, prompt: str, timeout: Optional[float] = None) -> "ChatCompletionLLM._Response":
        response = httpx.post(
            f"{self._base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
            },
            timeout=timeout or self._timeout,
        )
        if response.status_code != 200:
            # Surface the provider's own message: "model_not_found" and
            # "insufficient_quota" are exactly what the fallback chain logs and
            # what makes an outage diagnosable.
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
        payload = response.json()
        try:
            return self._Response(payload["choices"][0]["message"]["content"] or "")
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f"Malformed completion response: {str(payload)[:200]}") from exc


def _has(key: str) -> bool:
    return bool(key) and key != "dummy"


def gateway_configured() -> bool:
    """A gateway needs all three of key, base URL and model id to be usable."""
    return bool(_has(gateway_api_key) and GATEWAY_BASE_URL and GATEWAY_MODEL)


def candidate_llms() -> list:
    """Every model we are willing to try, in preference order.

    Gateway first (it is the provider with paid credit), then the Groq free
    tier, then OpenAI. Each entry is the same client class against a different
    base URL.
    """
    candidates = []
    if gateway_configured():
        models = list(dict.fromkeys([GATEWAY_MODEL, *GATEWAY_FALLBACK_MODELS]))
        candidates += [
            ChatCompletionLLM(model=m, api_key=gateway_api_key, base_url=GATEWAY_BASE_URL)
            for m in models
        ]
    if _has(groq_api_key):
        models = list(dict.fromkeys([GROQ_MODEL, *GROQ_FALLBACK_MODELS]))
        candidates += [
            ChatCompletionLLM(model=m, api_key=groq_api_key, base_url=GROQ_BASE_URL)
            for m in models
        ]
    if _has(openai_api_key):
        candidates.append(
            ChatCompletionLLM(model=OPENAI_MODEL, api_key=openai_api_key, base_url=OPENAI_BASE_URL)
        )
    return candidates


def get_llm():
    """Return the preferred LLM, or None when no key is configured."""
    candidates = candidate_llms()
    return candidates[0] if candidates else None


def _complete_within(llm, prompt: str, seconds: float) -> str:
    """Call `llm.complete`, passing a per-attempt timeout only if it takes one.

    The kwarg is probed with `inspect` rather than by catching TypeError: a
    TypeError raised *inside* a real `complete()` would otherwise be
    misdiagnosed as "this client has no timeout parameter" and silently retried
    without a deadline.
    """
    try:
        accepts_timeout = "timeout" in inspect.signature(llm.complete).parameters
    except (TypeError, ValueError):  # builtins / C callables have no signature
        accepts_timeout = False
    if accepts_timeout:
        return llm.complete(prompt, timeout=seconds).text
    return llm.complete(prompt).text


class Completion(NamedTuple):
    """A completion plus which model actually produced it.

    The model matters as much as the text: with a chain this long, "there is no
    narrative" and "the narrative came from the last-resort model" look
    identical in the UI, and diagnosing either meant reading server logs or
    inferring the provider from latency.
    """

    text: str
    model: str


def complete_with_model(prompt: str, budget_seconds: Optional[float] = None) -> Completion:
    """Complete `prompt` with the first model that answers, naming that model.

    Walks the candidate chain so a retired model, an exhausted quota, an
    unauthorised model on a restricted key or a gateway whose upstream supply is
    drained degrades to the next option instead of failing the whole request.

    The chain is bounded by `budget_seconds` (default LLM_TOTAL_BUDGET_SECONDS)
    rather than run to exhaustion: with a slow pooled gateway and eight
    candidates, a per-candidate timeout alone lets one request outlive the proxy
    waiting on it, and the caller loses the graceful degradation it already had
    ready. Call sites that make two chained completions must pass a smaller
    budget — see LLM_CHAINED_BUDGET_SECONDS.
    """
    budget = LLM_TOTAL_BUDGET_SECONDS if budget_seconds is None else budget_seconds
    failures = []
    deadline = time.monotonic() + budget
    for llm in candidate_llms():
        name = getattr(llm, "model", type(llm).__name__)
        remaining = deadline - time.monotonic()
        # `and failures` so the first candidate always gets one attempt, even
        # with an absurdly small budget configured.
        if remaining < _MIN_ATTEMPT_SECONDS and failures:
            failures.append(
                f"{name}: skipped, the {budget:.0f}s budget for the "
                "whole chain was spent on earlier candidates"
            )
            logger.warning(f"LLM budget exhausted; skipping {name} and every candidate after it.")
            break
        try:
            # min, not the raw remaining budget: handing a candidate the whole
            # remaining budget makes LLM_TIMEOUT_SECONDS dead config, and one
            # hung gateway connection then eats the entire chain. Observed
            # exactly that — a single ReadTimeout consumed all 150s and every
            # fallback was skipped, so the fallback chain never ran at all.
            attempt = max(min(LLM_TIMEOUT_SECONDS, remaining), _MIN_ATTEMPT_SECONDS)
            text = _complete_within(llm, prompt, attempt)
            if failures:
                logger.info(f"LLM {name} answered after {len(failures)} earlier candidate(s) failed.")
            return Completion(text=text, model=name)
        except Exception as exc:
            failures.append(f"{name}: {exc}")
            logger.warning(f"LLM {name} failed ({type(exc).__name__}); trying next candidate.")
    raise LLMUnavailableError(
        "; ".join(failures)
        or "No LLM configured. Set LLM_GATEWAY_API_KEY (+ base URL and model), GROQ_API_KEY or OPENAI_API_KEY."
    )


def complete_with_fallback(prompt: str, budget_seconds: Optional[float] = None) -> str:
    """`complete_with_model`, for callers that only want the text."""
    return complete_with_model(prompt, budget_seconds=budget_seconds).text


def _degraded_notice(reason: str) -> str:
    """A short, human explanation for the narrative panel.

    Provider errors are not user-facing copy: the raw chain error is a kilobyte
    of concatenated JSON — repeated per candidate, sometimes in another language
    — and putting it in `llm_narrative` renders it verbatim in the dashboard as
    though it were the analysis. The detail belongs in the log and in
    /api/v1/diagnostics; the panel gets one sentence and a pointer.
    """
    return (
        "⚠️ **AI narrative unavailable.** Every configured model declined this "
        "request, so the analysis below comes from the deterministic layers only "
        "— the ranked hypotheses, anomaly scores and retrieved incidents are all "
        "still valid.\n\n"
        f"First provider error: `{reason.split(';')[0].strip()[:200]}`\n\n"
        "Check `providers.llm_chain` in `/api/v1/diagnostics` for the models that "
        "were tried, in order."
    )


# ─── Embeddings (API first, deterministic local fallback) ────────────
_WORD_RE = re.compile(r"[a-z0-9_]+")
LOCAL_EMBED_DIM = 512


class HashingEmbedding(BaseEmbedding):
    """Dependency-free embedding used when no embedding API is reachable.

    Hashes unigrams and bigrams into a fixed-width L2-normalised vector. This
    is lexical, not semantic, so retrieval quality is lower than a real
    embedding model — but it needs no API key, no quota and no torch, which
    keeps similar-incident retrieval alive offline and on a free dyno.
    """

    dim: int = LOCAL_EMBED_DIM

    @classmethod
    def class_name(cls) -> str:
        return "hashing_embedding"

    def _vector(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = _WORD_RE.findall((text or "").lower())
        grams = tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
        for gram in grams:
            digest = hashlib.blake2b(gram.encode(), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "big") % self.dim
            sign = 1.0 if digest[4] % 2 else -1.0
            vec[index] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0.0:
            return vec
        return [v / norm for v in vec]

    def _get_query_embedding(self, query: str) -> List[float]:
        return self._vector(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._vector(text)

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._vector(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._vector(text)


class HTTPEmbedding(BaseEmbedding):
    """OpenAI-protocol `/embeddings` client over httpx, for arbitrary providers.

    `OpenAIEmbedding` cannot serve a gateway: it validates `model` against a
    hardcoded enum of OpenAI's own model names (`OpenAIEmbeddingModelType`) and
    raises ValueError before issuing any request, so a gateway-specific id is
    rejected outright — which showed up as "gateway embeddings unavailable" for
    a perfectly working endpoint. The endpoint is a trivial POST, so this
    mirrors what ChatCompletionLLM already does for completion.

    `dim` is discovered from the first response rather than configured: the
    width is a property of the provider's model, and a wrong guess would only
    surface later as a Chroma dimension mismatch.
    """

    model: str
    api_key: str
    base_url: str
    timeout: float = 30.0
    dim: Optional[int] = None

    @classmethod
    def class_name(cls) -> str:
        return "http_embedding"

    def _embed(self, texts: List[str]) -> List[List[float]]:
        response = httpx.post(
            f"{self.base_url.rstrip('/')}/embeddings",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={"model": self.model, "input": texts},
            timeout=self.timeout,
        )
        if response.status_code != 200:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
        payload = response.json()
        try:
            # Sort by index: the protocol does not promise response order, and
            # a mismatched pairing would attach each incident's vector to the
            # wrong text — corrupting retrieval silently rather than failing.
            rows = sorted(payload["data"], key=lambda row: row.get("index", 0))
            vectors = [row["embedding"] for row in rows]
        except (KeyError, TypeError) as exc:
            raise RuntimeError(f"Malformed embedding response: {str(payload)[:200]}") from exc
        if len(vectors) != len(texts):
            raise RuntimeError(
                f"Embedding count mismatch: asked for {len(texts)}, got {len(vectors)}"
            )
        if self.dim is None and vectors:
            self.dim = len(vectors[0])
        return vectors

    def _get_query_embedding(self, query: str) -> List[float]:
        return self._embed([query])[0]

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._embed([text])[0]

    def _get_text_embeddings(self, texts: List[str]) -> List[List[float]]:
        return self._embed(texts)

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._get_text_embedding(text)


_embed_backend: Optional[str] = None

# Embeddings are a separate decision from completion. Many OpenAI-compatible
# gateways proxy chat only, and an unsupported /embeddings endpoint 404s on
# every single indexed incident rather than failing once — so the gateway is
# used for embeddings only when a model id is explicitly configured for it.
GATEWAY_EMBED_MODEL = os.getenv("LLM_GATEWAY_EMBED_MODEL", "").strip()


def _probe_embedding(model) -> None:
    """Force one real call, so an unsupported endpoint fails here and not
    later on every insert."""
    model.get_text_embedding("healthcheck")


def embedding_backend() -> str:
    """Resolve the embedding backend once, lazily.

    Lazy on purpose: probing the API at import time would make every process
    that merely imports this module (including the test suite) hit the network.

    Order: gateway (only when an embedding model is named for it), then OpenAI,
    then the local hashing fallback that always works.
    """
    global _embed_backend
    if _embed_backend is not None:
        return _embed_backend

    if gateway_configured() and GATEWAY_EMBED_MODEL:
        try:
            model = HTTPEmbedding(
                model=GATEWAY_EMBED_MODEL,
                api_key=gateway_api_key,
                base_url=GATEWAY_BASE_URL,
            )
            _probe_embedding(model)
            Settings.embed_model = model
            _embed_backend = "gateway"
            logger.info(f"Embeddings: gateway ({GATEWAY_EMBED_MODEL}, dim={model.dim})")
            return _embed_backend
        except Exception as exc:
            logger.warning(
                f"Gateway embeddings unavailable ({type(exc).__name__}: {exc}). "
                "Many gateways proxy chat only — falling back."
            )

    if _has(openai_api_key):
        try:
            model = OpenAIEmbedding(api_key=openai_api_key, max_retries=0, timeout=10.0)
            _probe_embedding(model)
            Settings.embed_model = model
            _embed_backend = "openai"
            logger.info("Embeddings: OpenAI API")
            return _embed_backend
        except Exception as exc:
            logger.warning(
                f"OpenAI embeddings unavailable ({type(exc).__name__}: {exc}). "
                "Falling back to local hashing embeddings — retrieval is lexical, not semantic."
            )

    Settings.embed_model = HashingEmbedding()
    _embed_backend = "local"
    logger.info("Embeddings: local hashing (no API key or quota)")
    return _embed_backend


def _collection_name() -> str:
    """Vectors of different widths cannot share a Chroma collection, so each
    embedding backend gets its own. `incidents` is kept for the OpenAI backend
    so existing deployments do not orphan the vectors they already have."""
    backend = embedding_backend()
    if backend == "openai":
        return "incidents"
    if backend == "gateway":
        # The gateway's embedding model is configurable, and two models of
        # different width would collide in one collection.
        suffix = re.sub(r"[^a-z0-9]+", "_", GATEWAY_EMBED_MODEL.lower()).strip("_")
        return f"incidents_gw_{suffix}"[:60]
    return "incidents_local_v1"


# `Settings.llm` is intentionally left unset. Retrieval in this module is
# embedding-only — documents are added and queried through a retriever, never a
# query engine — so llama-index never needs an LLM object. Assigning one would
# only force the heavy `llama_index.llms.*` import back in. Completion goes
# through ChatCompletionLLM / complete_with_fallback instead.


# ═══════════════════════════════════════════════════════════════════════
# PHASE 1 & 2 & 3: Label, Weight, and Poisoning Protection
# ═══════════════════════════════════════════════════════════════════════

def _compute_label(score: int, count: int) -> str:
    """
    Compute a stable feedback label using ratio-based thresholds.
    Requires a minimum vote count to avoid noisy early signals.
    """
    if count < MIN_VOTES_FOR_LABEL:
        return "none"
    ratio = score / count
    if ratio > POSITIVE_RATIO_THRESHOLD:
        return "positive"
    elif ratio < NEGATIVE_RATIO_THRESHOLD:
        return "negative"
    return "none"


def _compute_weight(label: str, score: int, count: int) -> float:
    """
    Compute a confidence weight for retrieval ranking.
    - Positives: logarithmic scaling rewards consistent upvotes
    - Negatives: dampened at 50% to prevent them from dominating
    - Unrated: baseline weight of 1.0
    Hard-capped at MAX_WEIGHT to prevent feedback poisoning.
    """
    if label == "positive":
        raw = score * math.log(count + 1)
    elif label == "negative":
        raw = abs(score) * 0.5
    else:
        raw = 1.0
    return min(raw, MAX_WEIGHT)


# ═══════════════════════════════════════════════════════════════════════
# Core Functions
# ═══════════════════════════════════════════════════════════════════════

def get_or_create_index():
    _, chroma_collection, vector_store, storage_context = get_chroma_components()
    if chroma_collection.count() > 0:
        return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
    else:
        return VectorStoreIndex([], storage_context=storage_context)


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: Metadata-Rich Indexing
# ═══════════════════════════════════════════════════════════════════════

def add_incident_to_index(incident):
    """Convert an incident to a LlamaIndex Document with production-grade metadata."""
    _, chroma_collection, _, _ = get_chroma_components()
    score = incident.get("human_feedback_score", 0) if isinstance(incident, dict) else (incident.human_feedback_score or 0)
    count = incident.get("human_feedback_count", 0) if isinstance(incident, dict) else (incident.human_feedback_count or 0)

    label = _compute_label(score, count)
    weight = _compute_weight(label, score, count)

    if isinstance(incident, dict):
        failure_type = (
            incident.get("expected_cause")
            or incident.get("root_cause")
            or incident.get("predicted_cause")
            or "unknown"
        )
    else:
        failure_type = (
            getattr(incident, "expected_cause", None)
            or getattr(incident, "root_cause", None)
            or getattr(incident, "predicted_cause", None)
            or "unknown"
        )

    if isinstance(incident, dict):
        incident_id = incident.get("id")
        service = incident.get("service")
        environment = incident.get("environment")
        symptoms = ", ".join(incident.get("symptoms", []))
        signals = incident.get("signals")
        changes = incident.get("changes")
        fixes_applied = incident.get("fixes_applied")
        runbook_refs = incident.get("runbook_refs")
        user_id_val = str(incident.get("user_id")) if incident.get("user_id") else "unknown"
    else:
        incident_id = str(incident.id)
        service = incident.service
        environment = incident.environment
        symptoms = ", ".join(incident.symptoms) if incident.symptoms else ""
        signals = incident.signals
        changes = incident.changes
        fixes_applied = incident.fixes_applied
        runbook_refs = incident.runbook_refs
        user_id_val = str(incident.user_id) if getattr(incident, "user_id", None) else "unknown"

    narrative = (
        f"Incident ID: {incident_id}\n"
        f"Service: {service} in {environment}\n"
        f"Symptoms: {symptoms}\n"
        f"Signals: {signals}\n"
        f"Changes: {changes}\n"
        f"Root Cause: {failure_type}\n"
        f"Fixes Applied: {fixes_applied}\n"
        f"Runbook: {runbook_refs}\n"
    )
    doc = Document(
        text=narrative,
        metadata={
            "incident_id": incident_id,
            "service": service,
            "label": label,
            "weight": weight,
            "failure_type": failure_type,
            "user_id": user_id_val,
        },
    )
    with chroma_lock:
        index = get_or_create_index()
        index.insert(doc)
    logger.info(f"📦 Indexed incident {incident_id}: label={label}, weight={weight:.2f}, failure_type={failure_type}, user_id={doc.metadata['user_id']}")

def update_incident_in_index(incident):
    """Delete old embedding and replace with newly updated one (containing feedback)."""
    _, chroma_collection, _, _ = get_chroma_components()
    incident_id = incident.get("id") if isinstance(incident, dict) else str(incident.id)
    with chroma_lock:
        try:
            chroma_collection.delete(where={"incident_id": incident_id})
        except Exception:
            pass
        try:
            add_incident_to_index(incident)
        except Exception as e:
            logger.error(f"Failed to add incident to index during update: {e}")
    return True


# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: Query-Time Retrieval with Filtering, Partitioning, Fallback
# ═══════════════════════════════════════════════════════════════════════

def query_similar_incidents(service_name: str, symptoms: list, signals: list, user_id: Optional[str] = None):
    """
    Query ChromaDB with MANDATORY user_id filtering for tenant isolation,
    plus service-level metadata filtering when possible.

    Returns three sorted lists: (positives, negatives, unrated).
    Positives are ranked by weight descending and capped.
    Negatives are dampened and limited.
    If positives are sparse, unrated examples backfill the gap.

    SECURITY: If user_id is not provided, an empty result is returned.
    This prevents accidental cross-tenant leakage if a caller forgets
    to pass user_id (fail-closed behavior).
    """
    if not user_id:
        logger.warning("query_similar_incidents called without user_id — returning empty results (fail-closed isolation).")
        return [], [], []

    _, chroma_collection, _, _ = get_chroma_components()
    query_str = f"Symptoms: {', '.join(symptoms)}. Signals: {signals}."

    with chroma_lock:
        if chroma_collection.count() == 0:
            return [], [], []

    index = get_or_create_index()

    # Strict tenant isolation: always filter by user_id. Service filter
    # is layered on top to improve relevance, with a fallback that still
    # keeps the user_id filter intact.
    nodes = []
    with chroma_lock:
        try:
            filters = MetadataFilters(filters=[
                ExactMatchFilter(key="user_id", value=str(user_id)),
                ExactMatchFilter(key="service", value=service_name),
            ])
            retriever = index.as_retriever(similarity_top_k=RETRIEVAL_BATCH_SIZE, filters=filters)
            nodes = retriever.retrieve(query_str)
        except Exception:
            pass

        # Fallback: drop the service filter but KEEP user_id isolation.
        if not nodes:
            try:
                filters = MetadataFilters(filters=[
                    ExactMatchFilter(key="user_id", value=str(user_id)),
                ])
                retriever = index.as_retriever(similarity_top_k=RETRIEVAL_BATCH_SIZE, filters=filters)
                nodes = retriever.retrieve(query_str)
            except Exception:
                return [], [], []

    # Defense-in-depth: post-filter any node whose metadata doesn't match
    # the calling tenant, in case the vector store filter ever slips.
    nodes = [n for n in nodes if str(n.metadata.get("user_id", "")) == str(user_id)]

    # ── Partition by label ──
    positives = []
    negatives = []
    unrated = []

    for node in nodes:
        label = node.metadata.get("label", "none")
        weight = node.metadata.get("weight", 1.0)

        if label == "positive":
            positives.append((weight, node.text))
        elif label == "negative":
            negatives.append((weight, node.text))
        else:
            unrated.append((weight, node.text))

    # ── Sort by weight descending ──
    positives.sort(key=lambda x: x[0], reverse=True)
    negatives.sort(key=lambda x: x[0], reverse=True)
    unrated.sort(key=lambda x: x[0], reverse=True)

    # ── Extract texts with caps ──
    pos_texts = [p[1] for p in positives[:MAX_POSITIVES]]
    neg_texts = [n[1] for n in negatives[:MAX_NEGATIVES]]
    unr_texts = [u[1] for u in unrated[:MAX_UNRATED]]

    # ── Fallback: backfill positives from unrated if sparse ──
    if len(pos_texts) < 2 and unr_texts:
        backfill_count = min(2 - len(pos_texts), len(unr_texts))
        pos_texts.extend(unr_texts[:backfill_count])
        unr_texts = unr_texts[backfill_count:]

    logger.info(
        f"🔍 RAG retrieval for [{service_name}]: "
        f"{len(pos_texts)} positives, {len(neg_texts)} negatives, {len(unr_texts)} unrated"
    )
    return pos_texts, neg_texts, unr_texts


# ═══════════════════════════════════════════════════════════════════════
# PHASE 6: Structured LLM Prompt with Explicit Feedback Routing
# ═══════════════════════════════════════════════════════════════════════

class Narrative(NamedTuple):
    """The synthesis result, with enough context to report it honestly.

    `ok` exists because the previous version returned the failure as an ordinary
    string, so the pipeline could not tell success from failure and recorded
    "LLM narrative generated" either way — which is exactly the log line you
    read when trying to work out why there is no narrative.
    """

    text: str
    model: str
    ok: bool


def generate_hypothesis(
    symptoms: list,
    signals: list,
    positives: list,
    negatives: list,
    unrated: list,
    extra_context: str = "",
    budget_seconds: Optional[float] = None,
) -> Narrative:
    """
    Generate a root cause hypothesis using the LLM with structured
    positive/negative feedback blocks injected into the prompt.

    Never raises: a provider outage degrades to `ok=False` with a short,
    user-facing notice, because every other layer of the analysis is still valid.
    """
    if get_llm() is None:
        return Narrative(
            text=(
                "⚠️ **No LLM provider configured.** Set `LLM_GATEWAY_API_KEY` with "
                "`LLM_GATEWAY_BASE_URL` and `LLM_GATEWAY_MODEL` (all three are "
                "required), or `GROQ_API_KEY` / `OPENAI_API_KEY`. The deterministic "
                "analysis below is unaffected."
            ),
            model="none",
            ok=False,
        )

    pos_block = chr(10).join(positives) if positives else "No verified examples available yet."
    neg_block = chr(10).join(negatives) if negatives else "No flagged mistakes on record."
    unr_block = chr(10).join(unrated) if unrated else "No additional references."

    prompt = f"""You are an AI incident analysis system trained on real production infrastructure failures.

--- HISTORIC MEMORY ---

Here are HIGH-QUALITY past incidents verified by human engineers. Follow these patterns ✅:
{pos_block}

Here are INCORRECT past hypotheses flagged by human engineers. Avoid repeating these mistakes ❌:
{neg_block}

Here are unrated similar incidents for additional reference only:
{unr_block}

--- CURRENT INCIDENT SIGNALS ---
Symptoms: {symptoms}
Signals: {signals}
{extra_context}

--- INSTRUCTIONS ---
1. Prioritize patterns similar to the verified positives above
2. Explicitly avoid known incorrect patterns listed above
3. Synthesize ALL evidence (rules, anomalies, signals, historic memory) into your analysis
4. Weight your confidence based on how many sources agree

Provide a comprehensive analysis:
1. **Top Probable Root Cause** — the single most likely explanation
2. **Confidence** (0-100%) — based on evidence convergence
3. **Evidence Summary** — which signals, rules, and past incidents support this
4. **Immediate Mitigation Steps** — safe actions to take now
5. **Suggested Long-Term Fix** — prevent recurrence
6. **What Changed** — highlight any deployments or config changes that triggered this

Be specific, technical, and actionable. Reference actual metric values.
"""
    try:
        completion = complete_with_model(prompt, budget_seconds=budget_seconds)
        return Narrative(text=completion.text, model=completion.model, ok=True)
    except LLMUnavailableError as e:
        # The full chain error goes to the log, not to the dashboard.
        logger.error(f"LLM synthesis failed across every candidate: {e}")
        return Narrative(text=_degraded_notice(str(e)), model="none", ok=False)
