"""
Anomaly Scoring Engine
----------------------
Performs statistical analysis on metric signals to detect anomalies.
Computes z-scores, spike detection, and temporal correlation scoring.
Works entirely without ML models — pure statistics.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import math


@dataclass
class AnomalyScore:
    metric_name: str
    current_value: float
    baseline_mean: float
    baseline_std: float
    z_score: float
    severity: str  # "normal", "elevated", "high", "critical"
    is_anomalous: bool
    description: str


@dataclass
class AnomalyReport:
    overall_anomaly_score: float  # 0.0–1.0
    anomalies: List[AnomalyScore] = field(default_factory=list)
    temporal_signals: List[str] = field(default_factory=list)
    summary: str = ""


# ─── Baseline Expectations ──────────────────────────────────────────
# In a production system, these would come from a metrics store (Prometheus/Timescale).
# For the MVP, we define reasonable baselines for common infrastructure metrics.

METRIC_BASELINES = {
    "cpu_usage": {"mean": 45.0, "std": 15.0, "unit": "%"},
    "memory_usage": {"mean": 55.0, "std": 12.0, "unit": "%"},
    "latency_p99": {"mean": 120.0, "std": 40.0, "unit": "ms"},
    "error_rate": {"mean": 0.5, "std": 0.3, "unit": "%"},
    "request_rate": {"mean": 1000.0, "std": 200.0, "unit": "req/s"},
    "connection_pool_usage": {"mean": 40.0, "std": 15.0, "unit": "%"},
    "disk_io": {"mean": 30.0, "std": 10.0, "unit": "MB/s"},
    "network_bytes_in": {"mean": 50.0, "std": 20.0, "unit": "MB/s"},
}


def _parse_numeric(value: str) -> Optional[float]:
    """Extract a numeric value from strings like '99%', '120ms', '1500 req/s'."""
    cleaned = ""
    for char in str(value):
        if char.isdigit() or char == '.':
            cleaned += char
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _compute_z_score(value: float, mean: float, std: float) -> float:
    """Standard z-score computation."""
    if std == 0:
        return 0.0
    return (value - mean) / std


def _severity_from_z(z: float) -> str:
    """Map z-score to a human-readable severity level."""
    abs_z = abs(z)
    if abs_z < 1.5:
        return "normal"
    elif abs_z < 2.5:
        return "elevated"
    elif abs_z < 3.5:
        return "high"
    else:
        return "critical"


def score_anomalies(
    signals: List[Dict[str, Any]],
    symptoms: List[str] = None,
) -> AnomalyReport:
    """
    Analyze all metric signals for anomalies using z-score analysis.
    Returns a comprehensive anomaly report with individual metric scores.
    """
    symptoms = symptoms or []
    anomalies: List[AnomalyScore] = []
    temporal_signals: List[str] = []

    for signal in signals:
        for key, value in signal.items():
            # Try to match the key to a known baseline metric
            metric_key = None
            for baseline_name in METRIC_BASELINES:
                if baseline_name in key.lower().replace(" ", "_"):
                    metric_key = baseline_name
                    break

            # If we can parse a numeric value, compute the anomaly score
            numeric_val = _parse_numeric(str(value))

            if metric_key and numeric_val is not None:
                baseline = METRIC_BASELINES[metric_key]
                z = _compute_z_score(numeric_val, baseline["mean"], baseline["std"])
                sev = _severity_from_z(z)

                anomaly = AnomalyScore(
                    metric_name=metric_key,
                    current_value=numeric_val,
                    baseline_mean=baseline["mean"],
                    baseline_std=baseline["std"],
                    z_score=round(z, 2),
                    severity=sev,
                    is_anomalous=abs(z) >= 2.0,
                    description=f"{metric_key} at {numeric_val}{baseline['unit']} is {abs(z):.1f}σ {'above' if z > 0 else 'below'} baseline ({baseline['mean']}{baseline['unit']} ± {baseline['std']})",
                )
                anomalies.append(anomaly)

            elif key.lower() in ("log", "event", "error", "message", "trace"):
                # Non-numeric signals: check for error patterns
                val_lower = str(value).lower()
                error_keywords = ["exception", "error", "timeout", "refused", "killed", "crash", "panic", "fatal"]
                if any(kw in val_lower for kw in error_keywords):
                    temporal_signals.append(f"⚠ Error signal: {value}")

    # Compute overall anomaly score (0–1)
    if anomalies:
        max_z = max(abs(a.z_score) for a in anomalies)
        # Normalize: z=2 → score 0.5, z=4 → score 1.0
        overall = min(max_z / 4.0, 1.0)
    else:
        overall = 0.0

    # Boost the score if error log signals are present
    if temporal_signals:
        overall = min(overall + 0.15, 1.0)

    # Boost the score based on symptom severity keywords
    severe_keywords = ["oom", "ssl", "5xx", "crash", "fatal", "panic"]
    if any(kw in " ".join(symptoms).lower() for kw in severe_keywords):
        overall = min(overall + 0.1, 1.0)

    # Generate summary
    anomalous_count = sum(1 for a in anomalies if a.is_anomalous)
    if overall >= 0.7:
        summary = f"🔴 CRITICAL anomaly detected: {anomalous_count} metric(s) significantly deviate from baseline."
    elif overall >= 0.4:
        summary = f"🟡 ELEVATED anomaly detected: {anomalous_count} metric(s) show unusual patterns."
    elif overall > 0:
        summary = f"🟢 MILD anomaly: metrics show minor deviations from baseline."
    else:
        summary = "✅ No significant anomalies detected in the provided signals."

    return AnomalyReport(
        overall_anomaly_score=round(overall, 2),
        anomalies=anomalies,
        temporal_signals=temporal_signals,
        summary=summary,
    )
