import os
import asyncio
import logging
from fastapi import FastAPI, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import uuid4
from models import Incident
from database import init_db, get_session
from rag_engine import add_incident_to_index, query_similar_incidents, generate_hypothesis, update_incident_in_index
from hybrid_analyzer import run_hybrid_analysis
from data_generator import generate_deterministic_incident

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

@app.post("/api/v1/simulation/trigger")
def trigger_simulation(req: SimulationRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
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


@app.post("/api/v1/incidents/{incident_id}/postmortem")
async def generate_postmortem(incident_id: str, session: Session = Depends(get_session)):
    """
    Generate a structured incident postmortem using real incident data + AI analysis.
    Returns clean Markdown text generated by the LLM.
    """
    import traceback
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse
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
        return JSONResponse(
            status_code=503,
            content={"detail": "No LLM configured. Set GROQ_API_KEY or OPENAI_API_KEY."}
        )

    try:
        response = await asyncio.to_thread(llm.complete, prompt)
        logger.info(f"📝 Postmortem generated for incident {incident_id}")
        return {"postmortem": response.text}
    except Exception as e:
        logger.error(f"Postmortem generation failed: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})
