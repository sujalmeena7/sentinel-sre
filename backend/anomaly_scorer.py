"""
Anomaly Scoring Engine
----------------------
Performs statistical analysis on metric signals to detect anomalies.
Computes z-scores, spike detection, and temporal correlation scoring.
Works entirely without ML models — pure statistics.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Iterable, Tuple
import math
import re


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
    "latency_p99": {"mean": 180.0, "std": 90.0, "unit": "ms"},
    "error_rate": {"mean": 0.5, "std": 0.3, "unit": "%"},
    "request_rate": {"mean": 1000.0, "std": 200.0, "unit": "req/s"},
    "connection_pool_usage": {"mean": 40.0, "std": 15.0, "unit": "%"},
    "active_db_connections": {"mean": 150.0, "std": 60.0, "unit": " conns"},
    "disk_io": {"mean": 30.0, "std": 10.0, "unit": "MB/s"},
    "network_bytes_in": {"mean": 50.0, "std": 20.0, "unit": "MB/s"},
}

# Alternate names emitted by chaos simulation, Prometheus alert labels and
# hand-written ingests. Each maps onto one of the baselines above so the
# scorer never silently drops a metric it could have scored.
METRIC_ALIASES = {
    "cpu": "cpu_usage",
    "cpu_utilization": "cpu_usage",
    "cpu_percent": "cpu_usage",
    "container_cpu": "cpu_usage",
    "memory": "memory_usage",
    "mem": "memory_usage",
    "memory_percent": "memory_usage",
    "container_memory": "memory_usage",
    "heap_usage": "memory_usage",
    "latency": "latency_p99",
    "network_latency_ms": "latency_p99",
    "response_time": "latency_p99",
    "p99": "latency_p99",
    "p95": "latency_p99",
    "duration_ms": "latency_p99",
    "errors": "error_rate",
    "error_percent": "error_rate",
    "5xx_rate": "error_rate",
    "rps": "request_rate",
    "qps": "request_rate",
    "throughput": "request_rate",
    "db_connections": "active_db_connections",
    "open_connections": "active_db_connections",
    "pool_usage": "connection_pool_usage",
    "disk": "disk_io",
    "iops": "disk_io",
    "network_in": "network_bytes_in",
}

# Keys whose *value* is free text worth scanning for error patterns rather
# than a number to score.
_TEXT_SIGNAL_KEYS = ("log", "logs", "event", "error", "message", "msg", "trace", "description")

# Keys that name the metric in a {"metric": ..., "value": ...} style signal.
_METRIC_NAME_KEYS = ("metric", "metric_name", "name", "key", "metric_key")
_METRIC_VALUE_KEYS = ("value", "val", "current_value", "reading", "amount")

_NUMBER_RE = re.compile(r"-?\d+(?:[.,]\d+)?")


def _normalize_key(name: Any) -> str:
    """Lowercase and collapse separators so 'Memory Usage' == 'memory_usage'."""
    return re.sub(r"[\s\-./]+", "_", str(name).strip().lower())


def _resolve_metric(name: Any) -> Optional[str]:
    """
    Map an arbitrary metric name onto a known baseline key.
    Tries exact match, then alias match, then substring match in both
    directions (so 'node_memory_usage_percent' still resolves).
    """
    key = _normalize_key(name)
    if not key:
        return None
    if key in METRIC_BASELINES:
        return key
    if key in METRIC_ALIASES:
        return METRIC_ALIASES[key]
    for baseline_name in METRIC_BASELINES:
        if baseline_name in key:
            return baseline_name
    for alias, baseline_name in METRIC_ALIASES.items():
        if alias in key:
            return baseline_name
    return None


def _parse_numeric(value: Any) -> Optional[float]:
    """Extract a numeric value from strings like '99%', '120ms', '-3.5', '1,500 req/s'."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _NUMBER_RE.search(str(value))
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", "."))
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


def _iter_signal_pairs(signal: Dict[str, Any]) -> Iterable[Tuple[str, Any]]:
    """
    Yield (metric_name, value) pairs from a single signal dict, supporting both
    shapes we ingest:

      A) {"metric": "memory_usage", "value": "99%"}   ← chaos sim / Prometheus
      B) {"memory_usage": "99%"}                       ← flat manual ingest

    Free-text keys ("log", "event", ...) are yielded untouched so the caller
    can scan them for error patterns.
    """
    name_key = next((k for k in signal if _normalize_key(k) in _METRIC_NAME_KEYS), None)
    value_key = next((k for k in signal if _normalize_key(k) in _METRIC_VALUE_KEYS), None)

    if name_key is not None and value_key is not None:
        # Shape A — the dict *describes* one metric.
        yield str(signal[name_key]), signal[value_key]
        # Still surface any accompanying free-text field on the same dict.
        for key, value in signal.items():
            if key in (name_key, value_key):
                continue
            yield key, value
        return

    # Shape B — every key is itself a metric name (or a text signal).
    for key, value in signal.items():
        yield key, value


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

    for signal in signals or []:
        if not isinstance(signal, dict):
            continue
        for key, value in _iter_signal_pairs(signal):
            metric_key = _resolve_metric(key)
            numeric_val = _parse_numeric(value)

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

            elif _normalize_key(key) in _TEXT_SIGNAL_KEYS:
                # Non-numeric signals: check for error patterns
                if value is None:
                    continue
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
