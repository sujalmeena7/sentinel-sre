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
import logging
import chromadb
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Document, StorageContext, Settings
from llama_index.core.vector_stores.types import MetadataFilters, ExactMatchFilter
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.groq import Groq
from llama_index.llms.openai import OpenAI
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

# ─── ChromaDB Setup ──────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path="./chroma_db")
chroma_collection = chroma_client.get_or_create_collection("incidents")
vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
storage_context = StorageContext.from_defaults(vector_store=vector_store)

# ─── LLM Setup (manual fallback: Groq first, then OpenAI) ────────────
groq_api_key = os.getenv("GROQ_API_KEY", "")
openai_api_key = os.getenv("OPENAI_API_KEY", "")

def get_llm():
    """Return the best available LLM. Groq is primary, OpenAI is fallback."""
    if groq_api_key and groq_api_key != "dummy":
        return Groq(model="llama-3.3-70b-versatile", api_key=groq_api_key, max_retries=0, request_timeout=15.0)
    elif openai_api_key and openai_api_key != "dummy":
        return OpenAI(model="gpt-3.5-turbo", api_key=openai_api_key, max_retries=0, timeout=15.0)
    else:
        return None

# ─── Embedding Model (API-based, lightweight for production) ────────
# Note: max_retries=0 and timeout=10.0 prevents silent hanging and Gateway Timeouts
# if the OpenAI API is rate-limiting us (429) or taking too long.
embedding_model = OpenAIEmbedding(api_key=openai_api_key, max_retries=0, timeout=10.0)
Settings.embed_model = embedding_model

# Set the LLM globally if available
_llm = get_llm()
if _llm:
    Settings.llm = _llm


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
    if chroma_collection.count() > 0:
        return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
    else:
        return VectorStoreIndex([], storage_context=storage_context)


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4: Metadata-Rich Indexing
# ═══════════════════════════════════════════════════════════════════════

def add_incident_to_index(incident):
    """Convert an incident to a LlamaIndex Document with production-grade metadata."""
    score = incident.human_feedback_score or 0
    count = incident.human_feedback_count or 0

    label = _compute_label(score, count)
    weight = _compute_weight(label, score, count)

    # Prefer ground truth (expected_cause) over AI prediction
    failure_type = (
        incident.expected_cause
        or incident.root_cause
        or incident.predicted_cause
        or "unknown"
    )

    narrative = (
        f"Incident ID: {incident.id}\n"
        f"Service: {incident.service} in {incident.environment}\n"
        f"Symptoms: {', '.join(incident.symptoms)}\n"
        f"Signals: {incident.signals}\n"
        f"Changes: {incident.changes}\n"
        f"Root Cause: {failure_type}\n"
        f"Fixes Applied: {incident.fixes_applied}\n"
        f"Runbook: {incident.runbook_refs}\n"
    )
    doc = Document(
        text=narrative,
        metadata={
            "incident_id": str(incident.id),
            "service": incident.service,
            "label": label,
            "weight": weight,
            "failure_type": failure_type,
        },
    )
    index = get_or_create_index()
    index.insert(doc)
    logger.info(f"📦 Indexed incident {incident.id}: label={label}, weight={weight:.2f}, failure_type={failure_type}")


def update_incident_in_index(incident):
    """Delete old embedding and replace with newly updated one (containing feedback)."""
    try:
        chroma_collection.delete(where={"incident_id": str(incident.id)})
    except Exception:
        pass
    add_incident_to_index(incident)
    return True


# ═══════════════════════════════════════════════════════════════════════
# PHASE 5: Query-Time Retrieval with Filtering, Partitioning, Fallback
# ═══════════════════════════════════════════════════════════════════════

def query_similar_incidents(service_name: str, symptoms: list, signals: list):
    """
    Query ChromaDB with service-level metadata filtering.
    Returns three sorted lists: (positives, negatives, unrated).
    Positives are ranked by weight descending and capped.
    Negatives are dampened and limited.
    If positives are sparse, unrated examples backfill the gap.
    """
    query_str = f"Symptoms: {', '.join(symptoms)}. Signals: {signals}."

    if chroma_collection.count() == 0:
        return [], [], []

    index = get_or_create_index()

    # Attempt service-filtered retrieval first
    nodes = []
    try:
        filters = MetadataFilters(filters=[
            ExactMatchFilter(key="service", value=service_name),
        ])
        retriever = index.as_retriever(similarity_top_k=RETRIEVAL_BATCH_SIZE, filters=filters)
        nodes = retriever.retrieve(query_str)
    except Exception:
        pass

    # Fallback: unfiltered retrieval if service filter returned nothing
    if not nodes:
        try:
            retriever = index.as_retriever(similarity_top_k=RETRIEVAL_BATCH_SIZE)
            nodes = retriever.retrieve(query_str)
        except Exception:
            return [], [], []

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

def generate_hypothesis(
    symptoms: list,
    signals: list,
    positives: list,
    negatives: list,
    unrated: list,
    extra_context: str = "",
):
    """
    Generate a root cause hypothesis using the LLM with structured
    positive/negative feedback blocks injected into the prompt.
    """
    llm = get_llm()
    if llm is None:
        return (
            "⚠️ No LLM API key configured. "
            "Please set GROQ_API_KEY or OPENAI_API_KEY in your .env file to enable hypothesis generation."
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
        response = llm.complete(prompt)
        return response.text
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return f"LLM call failed: {str(e)}"
