"""
Hybrid Analyzer
---------------
Orchestrates the full analysis pipeline:
  1. Deterministic Rules Engine  → instant pattern matching
  2. Anomaly Scoring Engine      → statistical z-score analysis
  3. RAG Retrieval               → similar past incidents from ChromaDB
  4. LLM Synthesis               → Groq generates the final narrative

The final output is a ranked list of hypotheses with evidence,
confidence scores, and recommended actions.
"""

import logging
import concurrent.futures
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any
from rules_engine import evaluate_rules, RuleMatch, RuleRejection
from anomaly_scorer import score_anomalies, AnomalyReport
from rag_engine import query_similar_incidents, generate_hypothesis

logger = logging.getLogger(__name__)


@dataclass
class Hypothesis:
    rank: int
    source: str  # "rules", "anomaly", "llm", "rag"
    title: str
    description: str
    confidence: int  # 0-100
    evidence: List[str] = field(default_factory=list)
    mitigation: str = ""
    long_term_fix: str = ""
    category: str = "unknown"


@dataclass
class HybridAnalysisResult:
    hypotheses: List[Hypothesis] = field(default_factory=list)
    anomaly_report: Dict[str, Any] = field(default_factory=dict)
    similar_incidents: List[str] = field(default_factory=list)
    llm_narrative: str = ""
    reasoning_chain: List[str] = field(default_factory=list)
    analysis_breakdown: Dict[str, str] = field(default_factory=dict)
    rejected_hypotheses: List[Dict[str, Any]] = field(default_factory=list)


def _parse_powershell_dict(item: Any) -> Dict[str, Any]:
    if item is None:
        return {}
    if isinstance(item, dict):
        return item
    if isinstance(item, str) and item.startswith("@{") and item.endswith("}"):
        content = item[2:-1]
        pairs = content.split(";")
        res = {}
        for p in pairs:
            if "=" in p:
                k, v = p.split("=", 1)
                res[k.strip()] = v.strip()
            elif p.strip():
                # If there's no '=', we just store the raw segment under a generic key
                res[f"key_{len(res)}"] = p.strip()
        return res
    return {"raw": str(item)}



def _run_with_timeout(func, timeout: int, stage_name: str, *args, **kwargs):
    logger.info(f"[{stage_name}] Entry - starting execution with {timeout}s timeout")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func, *args, **kwargs)
        try:
            result = future.result(timeout=timeout)
            logger.info(f"[{stage_name}] Exit - completed successfully")
            return result
        except concurrent.futures.TimeoutError:
            logger.error(f"[{stage_name}] Error - exceeded {timeout}s timeout")
            raise TimeoutError(f"Stage '{stage_name}' timed out after {timeout} seconds")
        except Exception as e:
            logger.error(f"[{stage_name}] Error - {type(e).__name__}: {str(e)}")
            raise

def run_hybrid_analysis(
    service_name: str,
    symptoms: List[str],
    signals: List[Any],
    changes: List[Any] = None,
    user_id: str = None,
) -> HybridAnalysisResult:
    """
    Execute the full hybrid reasoning pipeline for a specific tenant.
    user_id is MANDATORY at the RAG layer for isolation; callers in
    multi-tenant mode must always pass it.
    Returns a comprehensive analysis result with ranked hypotheses.
    """
    changes = changes or []
    # Safely unpack stringified items into dicts
    signals = [_parse_powershell_dict(s) for s in signals]
    changes = [_parse_powershell_dict(c) for c in changes]

    reasoning_chain: List[str] = []
    all_hypotheses: List[Hypothesis] = []

    # ─── STEP 1: Deterministic Rules ──────────────────────────────
    reasoning_chain.append("⚡ Step 1: Running deterministic rules engine...")
    rule_matches, rule_rejections = [], []
    try:
        rule_matches, rule_rejections = _run_with_timeout(
            evaluate_rules, 30, "Rules Engine", symptoms, signals, changes
        )
        for match in rule_matches:
            all_hypotheses.append(
                Hypothesis(
                    rank=0,  # will be set later
                    source="rules",
                    title=f"[Rule {match.rule_id}] {match.rule_name}",
                    description=match.hypothesis,
                    confidence=match.confidence,
                    evidence=match.evidence,
                    mitigation=match.mitigation,
                    long_term_fix=match.long_term_fix,
                    category=match.category,
                )
            )
        reasoning_chain.append(f"  → {len(rule_matches)} rule(s) matched, {len(rule_rejections)} rule(s) rejected")
    except Exception as e:
        reasoning_chain.append(f"❌ Step 1 Failed: {str(e)}")
        logger.exception("Rules Engine step failed")

    # ─── STEP 2: Anomaly Scoring ─────────────────────────────────
    reasoning_chain.append("📊 Step 2: Running statistical anomaly scorer...")
    anomaly_report = AnomalyReport(anomalies={}, summary="", overall_anomaly_score=0.0)
    try:
        anomaly_report = _run_with_timeout(
            score_anomalies, 30, "Anomaly Scoring", signals, symptoms
        )

        # If we detect critical anomalies that weren't already caught by rules,
        # generate an anomaly-based hypothesis
        for anomaly in getattr(anomaly_report, "anomalies", []):
            if anomaly.is_anomalous:
                # Check if this is already covered by a rule match
                already_covered = any(
                    anomaly.metric_name.replace("_", " ") in h.title.lower()
                    for h in all_hypotheses
                )
                if not already_covered:
                    confidence = min(int(abs(anomaly.z_score) * 20), 85)
                    all_hypotheses.append(
                        Hypothesis(
                            rank=0,
                            source="anomaly",
                            title=f"Anomalous {anomaly.metric_name}",
                            description=anomaly.description,
                            confidence=confidence,
                            evidence=[f"z-score: {anomaly.z_score}", f"severity: {anomaly.severity}"],
                            mitigation=f"Investigate {anomaly.metric_name} — currently at {anomaly.current_value} vs baseline {anomaly.baseline_mean}",
                            category="statistical",
                        )
                    )

        reasoning_chain.append(f"  → Overall anomaly score: {anomaly_report.overall_anomaly_score}")
        reasoning_chain.append(f"  → {sum(1 for a in getattr(anomaly_report, 'anomalies', []) if a.is_anomalous)} anomalous metric(s)")
    except Exception as e:
        reasoning_chain.append(f"❌ Step 2 Failed: {str(e)}")
        logger.exception("Anomaly Scoring step failed")

    # ─── STEP 3: RAG Retrieval ───────────────────────────────────
    reasoning_chain.append("🔍 Step 3: Querying ChromaDB for similar past incidents via Metadata Routing...")
    positives, negatives, unrated, similar_incidents = [], [], [], []
    try:
        positives, negatives, unrated = _run_with_timeout(
            query_similar_incidents, 30, "RAG Retrieval", service_name, symptoms, signals, user_id=user_id
        )
        similar_incidents = positives + unrated + negatives  # Flattened for simple keyword matching backwards compatibility
        reasoning_chain.append(f"  → RAG retrieved {len(positives)} positive, {len(negatives)} negative, and {len(unrated)} unrated historic examples.")

        # Boost confidence of rule matches if RAG confirms similar past patterns
        if similar_incidents:
            for hyp in all_hypotheses:
                if hyp.source == "rules":
                    # Check if the similar incident text mentions the same category
                    for sim_text in similar_incidents:
                        sim_lower = sim_text.lower()
                        if any(kw in sim_lower for kw in hyp.title.lower().split()):
                            hyp.confidence = min(hyp.confidence + 5, 99)
                            hyp.evidence.append("✅ Confirmed by similar past incident in RAG")
                            break
    except Exception as e:
        reasoning_chain.append(f"❌ Step 3 Failed: {str(e)}")
        logger.exception("RAG Retrieval step failed")

    # ─── STEP 4: LLM Synthesis ───────────────────────────────────
    reasoning_chain.append("🧠 Step 4: Generating LLM narrative via Groq...")
    llm_narrative = "LLM Synthesis failed or was skipped."
    try:
        # Build an enhanced prompt that includes the rules + anomaly context
        rules_context = ""
        if all_hypotheses:
            rules_context = "\n\nThe deterministic rules engine identified these patterns:\n"
            for h in all_hypotheses[:3]:
                rules_context += f"- [{h.source.upper()}] {h.title} (confidence: {h.confidence}%): {h.description}\n"

        anomaly_context = f"\n\nAnomaly Report: {getattr(anomaly_report, 'summary', '')}"
        for a in getattr(anomaly_report, "anomalies", []):
            if getattr(a, "is_anomalous", False):
                anomaly_context += f"\n- {getattr(a, 'description', '')}"

        # Generate enriched LLM narrative
        llm_narrative = _run_with_timeout(
            generate_hypothesis,
            60,  # Give LLM 60s
            "LLM Synthesis",
            symptoms,
            signals,
            positives,
            negatives,
            unrated,
            extra_context=rules_context + anomaly_context,
        )
        reasoning_chain.append("  → LLM narrative generated")
    except Exception as e:
        reasoning_chain.append(f"❌ Step 4 Failed: {str(e)}")
        logger.exception("LLM Synthesis step failed")

    # ─── STEP 5: Rank & Finalize ─────────────────────────────────
    reasoning_chain.append("🏆 Step 5: Ranking hypotheses by confidence...")

    # Sort all hypotheses by confidence
    all_hypotheses.sort(key=lambda h: h.confidence, reverse=True)

    # Assign ranks
    for i, hyp in enumerate(all_hypotheses):
        hyp.rank = i + 1

    # Take top 5
    top_hypotheses = all_hypotheses[:5]
    reasoning_chain.append(f"  → Top {len(top_hypotheses)} hypotheses selected")

    analysis_breakdown = {
        "Rules Engine": f"{len(rule_matches)} deterministic pattern(s) matched.",
        "Anomaly Scorer": f"{sum(1 for a in anomaly_report.anomalies if a.is_anomalous)} anomaly(s) flagged from telemetry.",
        "RAG Retrieval": f"{len(similar_incidents)} historical incident(s) retrieved as reference.",
        "LLM Synthesis": "Narrative generated synthesizing all layer context."
    }

    return HybridAnalysisResult(
        hypotheses=top_hypotheses,
        anomaly_report={
            "overall_score": anomaly_report.overall_anomaly_score,
            "summary": anomaly_report.summary,
            "anomalies": [
                {
                    "metric": a.metric_name,
                    "value": a.current_value,
                    "z_score": a.z_score,
                    "severity": a.severity,
                    "is_anomalous": a.is_anomalous,
                    "description": a.description,
                }
                for a in anomaly_report.anomalies
            ],
            "error_signals": anomaly_report.temporal_signals,
        },
        similar_incidents=similar_incidents,
        llm_narrative=llm_narrative,
        reasoning_chain=reasoning_chain,
        analysis_breakdown=analysis_breakdown,
        rejected_hypotheses=[
            {
                "rule_id": r.rule_id,
                "rule_name": r.rule_name,
                "hypothesis": r.hypothesis,
                "reason": r.reason,
                "score": r.composite_score,
                "missing_evidence": r.missing_evidence,
            }
            for r in rule_rejections
        ],
    )
