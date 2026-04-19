import os
import asyncio
import logging
import re
import httpx
from urllib.parse import urlparse
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import uuid4
from dotenv import load_dotenv
from models import Incident
from database import init_db, get_session
from rag_engine import add_incident_to_index, query_similar_incidents, generate_hypothesis, update_incident_in_index
from hybrid_analyzer import run_hybrid_analysis
from data_generator import generate_deterministic_incident

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
app = FastAPI(title="AI Root Cause Analyzer", version="0.2.0")

# Allow frontend connections
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic model for the ingest request (handles string-to-datetime conversion)
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


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Root Cause Analyzer API v0.2.0 — Hybrid Reasoning Engine"}


def process_incident_background(incident: Incident):
    """Background task: embed the incident into ChromaDB."""
    try:
        add_incident_to_index(incident)
        logger.info(f"✅ Incident {incident.id} indexed into ChromaDB.")
    except Exception as e:
        logger.error(f"❌ Failed to index incident {incident.id}: {e}")


@app.post("/api/v1/incidents/ingest", response_model=Dict[str, Any])
def ingest_incident(
    payload: IncidentIngest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Ingest an incident payload. Triggers vector embedding in the background."""
    incident = Incident(
        id=payload.id or str(uuid4()),
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

    background_tasks.add_task(process_incident_background, incident)

    return {"status": "accepted", "incident_id": str(incident.id)}


class AnalyzeRequest(BaseModel):
    incident_id: str
    symptoms: List[str]
    signals: List[Union[str, Dict[str, Any]]]
    changes: List[Union[str, Dict[str, Any]]] = []


@app.post("/api/v1/incidents/analyze")
async def analyze_anomaly(req: AnalyzeRequest, session: Session = Depends(get_session)):
    import traceback
    from fastapi.responses import JSONResponse
    try:
        """
        HYBRID analysis pipeline:
        """
        incident = session.get(Incident, req.incident_id)
        service_name = incident.service if incident else "unknown"
        
        # Run the heavy blocking hybrid analysis in a threadpool to prevent UI lockup
        result = await asyncio.to_thread(run_hybrid_analysis, service_name, req.symptoms, req.signals, req.changes)

        # Evaluation Tracker
        incident = session.get(Incident, req.incident_id)
        if incident and incident.expected_cause:
            predicted = result.hypotheses[0].title if result.hypotheses else "Unknown"
            incident.predicted_cause = predicted
            incident.is_correct = incident.expected_cause.lower() in predicted.lower()
            session.add(incident)
            session.commit()


        return {
            "hypotheses": [__import__('dataclasses').asdict(h) for h in result.hypotheses],
            "anomaly_report": result.anomaly_report,
            "similar_historic_incidents": result.similar_incidents,
            "llm_narrative": result.llm_narrative,
            "reasoning_chain": result.reasoning_chain,
            "analysis_breakdown": result.analysis_breakdown,
            "rejected_hypotheses": result.rejected_hypotheses,
        }
    except Exception as e:
        logger.error(f"Analysis failed: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": traceback.format_exc()})


class FeedbackRequest(BaseModel):
    incident_id: str
    score: int  # 1 for upvote, -1 for downvote
    comment: Optional[str] = None

@app.post("/api/v1/incidents/feedback")
def submit_feedback(req: FeedbackRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    from fastapi import HTTPException
    incident = session.get(Incident, req.incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    if incident.human_feedback_score is None:
        incident.human_feedback_score = 0
    if incident.human_feedback_count is None:
        incident.human_feedback_count = 0
        
    incident.human_feedback_score += req.score
    incident.human_feedback_count += 1
    # Maintain the latest comment
    if req.comment:
        incident.human_feedback_comment = req.comment
        
    session.add(incident)
    session.commit()
    session.refresh(incident)
    
    # Re-index with feedback context!
    background_tasks.add_task(update_incident_in_index, incident)
    
    logger.info(f"👍👎 Feedback received for {req.incident_id}. Score: {req.score}")
    return {"status": "success", "message": "Feedback recorded and RAG trained"}


class SimulationRequest(BaseModel):
    service: str
    failure_type: str
    severity: str


class DispatchRequest(BaseModel):
    destination: str
    webhook_override: Optional[str] = None

@app.post("/api/v1/simulation/trigger")
def trigger_simulation(req: SimulationRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    """
    Create and persist a deterministic simulation incident for the given service/failure inputs and schedule it for background processing.
    
    Parameters:
        req (SimulationRequest): Simulation inputs including `service`, `failure_type`, and `severity`.
        background_tasks (BackgroundTasks): FastAPI background task manager used to schedule incident processing.
    
    Returns:
        dict: {"status": "triggered", "incident_id": "<uuid>"} where `incident_id` is the created incident's UUID string.
    """
    logger.info(f"⚡ Chaos trigger received: service={req.service}, failure={req.failure_type}, severity={req.severity}")
    try:
        inc_data = generate_deterministic_incident(req.service, req.failure_type, req.severity)
        
        EXPECTED_MAP = {
            "Memory leak (OOM Kill)": "Memory Leak",
            "CPU spike": "CPU Saturation",
            "DB connection failure": "DB Connection Pool Exhaustion",
            "Latency spike": "Downstream Dependency Overload"
        }
        inc_data["expected_cause"] = EXPECTED_MAP.get(req.failure_type, "Unknown Pattern")
        
        incident = Incident(**inc_data)
        session.add(incident)
        session.commit()
        session.refresh(incident)

        background_tasks.add_task(process_incident_background, incident)
        logger.info(f"✅ Chaos incident {incident.id} created for {req.service}")
        return {"status": "triggered", "incident_id": str(incident.id)}
    except Exception as e:
        logger.error(f"❌ Chaos trigger failed: {e}")
        raise


@app.get("/api/v1/incidents", response_model=List[Incident])
def get_incidents(session: Session = Depends(get_session)):
    incidents = session.exec(select(Incident).order_by(Incident.start_time.desc())).all()
    return incidents


@app.get("/api/v1/evaluation")
def get_evaluation(session: Session = Depends(get_session)):
    """
    Compute evaluation metrics for incidents that have both expected and predicted causes.
    
    Returns:
        A dictionary with:
        - total_tests: the number of incidents evaluated.
        - correct_predictions: the count of incidents marked as correct.
        - accuracy: percentage of correct predictions rounded to one decimal (0.0 if no tests).
        - results: a list of evaluation records (most-recent first), each containing:
            - service: service name,
            - expected: the expected cause,
            - predicted: the predicted cause,
            - is_correct: truthy value indicating whether the prediction matched.
    """
    incidents = session.exec(select(Incident).where(Incident.expected_cause != None).where(Incident.predicted_cause != None)).all()
    
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
    """
    Truncates a string to a maximum length and appends an ellipsis when truncation occurs, preferring to break on the last space within the limit.
    
    Parameters:
        text (str): The input string to truncate.
        limit (int): The maximum number of characters before truncation is applied.
    
    Returns:
        str: The original string if its length is less than or equal to `limit`; otherwise a truncated string ending with the ellipsis character `…`.
    """
    if len(text) <= limit:
        return text
    clipped = text[:limit]
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "…"


def _markdown_sections(markdown: str) -> Dict[str, str]:
    """
    Split Markdown into sections keyed by the most recent level-2 heading ("## Heading").
    
    Parameters:
        markdown (str): Markdown text to parse.
    
    Returns:
        Dict[str, str]: Mapping of section title to its trimmed content. The initial section is keyed as "Executive Summary" until the first "##" heading. Lines that are top-level headings starting with a single "# " are ignored. Empty sections are omitted.
    """
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
    """
    Selects the first section value whose heading contains any of the given candidate tokens, using case-insensitive matching.
    
    Parameters:
        sections (Dict[str, str]): Mapping of section headings to their text.
        candidates (List[str]): Tokens to search for within each heading (case-insensitive).
        fallback (str): Value to return if no heading contains any candidate token.
    
    Returns:
        str: The matched section text if found, otherwise `fallback`.
    """
    for key, value in sections.items():
        low = key.lower()
        if any(token in low for token in candidates):
            return value
    return fallback


def _incident_severity(incident: Incident) -> str:
    # 1) Human feedback is the strongest severity signal.
    """
    Determine the incident severity label used for presentation and dispatch.
    
    Severity is chosen by priority: human feedback score (high scores indicate greater severity), explicit signal severity values embedded in incident signals, the number of reported symptoms, and finally whether an expected cause exists as a fallback.
    
    Parameters:
        incident (Incident): The incident record to evaluate.
    
    Returns:
        str: One of "low", "moderate", or "severe" representing the incident's severity.
    """
    feedback_score = incident.human_feedback_score or 0
    if feedback_score >= 8:
        return "severe"
    if feedback_score >= 3:
        return "moderate"

    # 2) Signal severity (if present in dynamic signal payloads).
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

    # 3) Symptom volume heuristic.
    symptom_count = len(incident.symptoms) if isinstance(incident.symptoms, list) else 0
    if symptom_count >= 6:
        return "severe"
    if symptom_count >= 3:
        return "moderate"

    # 4) Last-resort fallback only.
    if incident.expected_cause:
        return "moderate"
    return "low"


def _allowed_webhook_hosts(destination: str) -> List[str]:
    """
    Load and normalize the allowlist of webhook hostnames for a given destination.
    
    Reads the environment variable "SLACK_ALLOWED_HOSTS" when destination == "slack", otherwise "TEAMS_ALLOWED_HOSTS".
    Parses the comma-separated value, trims whitespace, lowercases each entry, and omits empty tokens.
    
    Parameters:
        destination (str): Destination identifier (e.g., "slack" or "teams") used to select the corresponding environment variable.
    
    Returns:
        List[str]: A list of normalized host patterns (lowercase, trimmed). Returns an empty list if the environment variable is not set or contains no valid entries.
    """
    env_key = "SLACK_ALLOWED_HOSTS" if destination == "slack" else "TEAMS_ALLOWED_HOSTS"
    raw = os.getenv(env_key, "")
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def _is_override_webhook_allowed(webhook_override: str, destination: str) -> bool:
    """
    Determine whether a provided webhook override URL is allowed for the given destination.
    
    Parameters:
        webhook_override (str): The candidate webhook URL to validate.
        destination (str): Destination identifier (e.g., "slack" or "teams") used to look up the allowlist.
    
    Returns:
        bool: `True` if the URL is permitted, `False` otherwise. A URL is permitted only if:
            - its scheme is `https`,
            - it contains a hostname,
            - any explicit port is greater than 0,
            - the destination has a non-empty allowlist, and
            - the hostname matches an allowlist entry either exactly or via a wildcard prefix of the form `*.example.com`.
    """
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
        # Supports exact host and simple wildcard prefix patterns like *.slack.com
        if allowed.startswith("*."):
            suffix = allowed[1:]  # keep leading dot for strict suffix matching
            if host.endswith(suffix):
                return True
        elif host == allowed:
            return True
    return False


def _slack_payload(markdown: str, incident: Incident) -> Dict[str, Any]:
    """
    Builds a Slack Block Kit payload for delivering a postmortem generated as Markdown.
    
    This function parses the provided Markdown into Impact, Root Cause, and Actions sections, derives a severity from the incident, and assembles a Slack-compatible payload containing a header, context (incident id, environment, severity, start time), a divider, and three content sections. Text fields are length-limited where appropriate and the returned payload includes an attachment color chosen for the incident severity.
    
    Parameters:
        markdown (str): Postmortem content in Markdown produced by the postmortem generator.
        incident (Incident): Incident ORM object used to populate metadata (id, service, environment, start_time, etc.).
    
    Returns:
        dict: A Slack message payload with keys:
            - "text": short fallback/plain text summary.
            - "attachments": list containing a single attachment dict with:
                - "color": hex color code chosen by severity.
                - "blocks": list of Slack Block Kit blocks (header, context, divider, and sections).
    """
    sections = _markdown_sections(markdown)
    severity = _incident_severity(incident)
    accent = "#E01E5A" if severity == "severe" else "#FF8C00"
    timestamp = incident.start_time.isoformat() if incident.start_time else "Unknown"
    title = f"Postmortem • {incident.service}"

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
                        f"*Incident:* `{incident.id[:8]}`  •  *Env:* `{incident.environment}`  •  "
                        f"*Severity:* `{severity}`  •  *Start:* `{timestamp}`"
                    )
                }
            ],
        },
        {"type": "divider"},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*🚨 Impact*\n{_truncate_text(impact, 2900)}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*🔍 Root Cause*\n{_truncate_text(root_cause, 2900)}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*✅ Actions*\n{_truncate_text(actions, 2900)}"}},
    ]

    return {
        "text": _truncate_text(f"Incident postmortem for {incident.service}", 300),
        "attachments": [{"color": accent, "blocks": blocks[:50]}],
    }


def _teams_payload(markdown: str, incident: Incident) -> Dict[str, Any]:
    """
    Builds a Microsoft Teams MessageCard payload representing a postmortem using provided Markdown and incident metadata.
    
    Parameters:
        markdown (str): Postmortem content in Markdown from which Impact, Root Cause, and Actions sections are extracted.
        incident (Incident): Incident model used to populate metadata (id, service, environment, start_time, and severity-derived styling).
    
    Returns:
        dict: A MessageCard-compatible dictionary containing summary, title, themeColor, main text with incident metadata, and `sections` for Impact, Root Cause, and Actions.
    """
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
        "title": f"Postmortem • {incident.service}",
        "text": (
            f"**Incident:** `{incident.id[:8]}`\n\n"
            f"**Environment:** `{incident.environment}`\n\n"
            f"**Severity:** `{severity}`\n\n"
            f"**Start:** `{timestamp}`"
        ),
        "sections": [
            {"activityTitle": "🚨 Impact", "text": _truncate_text(impact, 7000), "markdown": True},
            {"activityTitle": "🔍 Root Cause", "text": _truncate_text(root_cause, 7000), "markdown": True},
            {"activityTitle": "✅ Actions", "text": _truncate_text(actions, 7000), "markdown": True},
        ],
    }


async def _generate_postmortem_markdown(incident_id: str, session: Session) -> str:
    """
    Generate a concise, structured incident postmortem in Markdown using stored incident data and AI analysis.
    
    Gathers incident fields, recent signals/changes, a computed timeline and blast radius, and runs the hybrid analysis to produce hypotheses, suggested fixes, and a reasoning chain. The collected information is assembled into a constrained prompt presented to the configured LLM, and the LLM's output is returned verbatim as the postmortem Markdown.
    
    Returns:
        str: The generated postmortem as clean Markdown.
    
    Raises:
        HTTPException: 404 if the incident_id is not found.
        HTTPException: 503 if no LLM is configured.
    """
    import traceback
    from rag_engine import get_llm

    incident = session.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # ── Gather real data ──────────────────────────────────────────
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
    fixes = ", ".join(incident.fixes_applied) if incident.fixes_applied else "None applied yet"

    # ── Service dependency map for blast radius ───────────────────
    SERVICE_DEPS = {
        "user-gateway": ["checkout-ui", "payment-api", "inventory-service"],
        "checkout-ui": ["payment-api", "inventory-service"],
        "payment-api": ["database-cluster"],
        "inventory-service": ["database-cluster"],
        "database-cluster": ["payment-api", "inventory-service", "checkout-ui", "user-gateway"],
    }
    downstream = SERVICE_DEPS.get(service, [])
    blast_radius = ", ".join(f"`{s}`" for s in downstream) if downstream else "No known downstream dependencies."

    # ── Build real timeline from incident data ────────────────────
    timeline_events = []
    if incident.start_time:
        timeline_events.append(f"- **{incident.start_time.strftime('%H:%M:%S UTC')}** — Incident detected on `{service}` in `{environment}`")
    if incident.symptoms:
        timeline_events.append(f"- **{incident.start_time.strftime('%H:%M:%S UTC')} +30s** — Symptoms observed: {symptoms}")
    if incident.peak_time:
        timeline_events.append(f"- **{incident.peak_time.strftime('%H:%M:%S UTC')}** — Peak impact reached")
    if incident.resolved_time:
        timeline_events.append(f"- **{incident.resolved_time.strftime('%H:%M:%S UTC')}** — Incident resolved")
    else:
        timeline_events.append("- **Ongoing** — Incident not yet resolved")

    timeline_str = "\n".join(timeline_events) if timeline_events else "No timeline events available."

    # ── Run hybrid analysis to get fresh hypotheses ───────────────
    detection_source = "monitoring alerts"
    reasoning_summary = ""
    try:
        result = await asyncio.to_thread(
            run_hybrid_analysis, service, incident.symptoms, incident.signals, incident.changes
        )
        hypotheses_text = "\n".join(
            [f"  {i+1}. {h.title} (Confidence: {h.confidence}%) — {h.description}"
             for i, h in enumerate(result.hypotheses[:5])]
        ) or "  No hypotheses generated."
        suggested_fixes_short = "\n".join(
            [f"  - {h.mitigation}" for h in result.hypotheses[:3] if h.mitigation]
        ) or "  - No specific fixes suggested."
        suggested_fixes_long = "\n".join(
            [f"  - {h.long_term_fix}" for h in result.hypotheses[:3] if h.long_term_fix]
        ) or "  - Conduct full architectural review."
        anomaly_summary = result.anomaly_report.get("summary", "No anomaly data.")

        # Extract detection source from reasoning chain
        chain = result.reasoning_chain or []
        for step in chain:
            if "rule(s) matched" in step and "0 rule" not in step:
                detection_source = "deterministic rules engine (pattern matching on known failure signatures)"
                break
            elif "anomalous metric" in step and "0 anomalous" not in step:
                detection_source = "statistical anomaly detection system (z-score deviation from baseline)"
                break

        # Build reasoning summary for the LLM
        reasoning_summary = "\n".join([f"  {s}" for s in chain]) if chain else "  No reasoning chain available."

    except Exception:
        hypotheses_text = "  Analysis unavailable."
        suggested_fixes_short = "  - Review logs manually."
        suggested_fixes_long = "  - Conduct full architectural review."
        anomaly_summary = "Anomaly scoring unavailable."
        reasoning_summary = "  Analysis pipeline did not complete."

    # ── Build the structured LLM prompt ───────────────────────────
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
- Derive MEASURABLE impact from the signals above (e.g., "memory usage reached 96%", "OOM kills caused pod restarts")
- State which user-facing capabilities were degraded
- Mention downstream services affected: {blast_radius}

## Timeline
- Use ONLY the provided timeline events. Do NOT add fictional timestamps.

## Root Cause
- Clear technical explanation based on the AI analysis

## Causal Chain (Why Analysis)
- Trace the chain: What changed → What mechanism broke → What failed → What users experienced
- Example format: "Deployment of v2.1 introduced a new caching layer → Cache lacked eviction policy → Unbounded memory growth → OOM kills → Pod restarts → User-facing 5xx errors"
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
- Be concise and professional — this will be read by engineering leadership
- No hallucinated data — every metric and timestamp must come from the data above
- Use bullet points for readability
- The Causal Chain section is CRITICAL — show senior-level root cause reasoning
- Output clean Markdown only
"""

    # ── Call LLM ──────────────────────────────────────────────────
    llm = get_llm()
    if llm is None:
        raise HTTPException(status_code=503, detail="No LLM configured. Set GROQ_API_KEY or OPENAI_API_KEY.")

    response = await asyncio.to_thread(llm.complete, prompt)
    logger.info(f"📝 Postmortem generated for incident {incident_id}")
    return response.text


@app.post("/api/v1/incidents/{incident_id}/postmortem")
async def generate_postmortem(incident_id: str, session: Session = Depends(get_session)):
    """
    Generate a postmortem Markdown for the given incident and return it wrapped in a JSON object.
    
    Parameters:
        incident_id (str): The unique identifier of the incident to generate the postmortem for.
    
    Returns:
        dict: A JSON-serializable dictionary with a single key `"postmortem"` containing the generated Markdown string.
        JSONResponse (on error): If postmortem generation raises an unexpected exception, returns a `JSONResponse` with status code 500 and `{"detail": <error string>}`.
    
    Raises:
        HTTPException: Re-raises HTTPException propagated from the postmortem generation helper.
    """
    import traceback
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
):
    """
    Dispatches a generated postmortem for the given incident to the specified destination webhook (Slack or Teams).
    
    Parameters:
        incident_id (str): The ID of the incident to generate and dispatch a postmortem for.
        req (DispatchRequest): Dispatch parameters; must specify `destination` ('slack' or 'teams') and may include `webhook_override` to override the default webhook URL when allowed.
    Returns:
        dict: Delivery metadata with keys `status` ('delivered'), `destination`, and `incident_id`.
    Raises:
        HTTPException: 
            - 404 if the incident is not found.
            - 400 for invalid `destination`, when no webhook is configured for the destination, or when a provided `webhook_override` is not allowed and no default webhook exists.
            - 502 if the remote webhook returns a >=400 response (response text is truncated in the detail).
            - May propagate HTTPException from postmortem generation (for example, 503 when no LLM is configured).
    """
    incident = session.get(Incident, incident_id)
    if not incident:
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
