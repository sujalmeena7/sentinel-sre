"""Unit tests for the deterministic layers: rules engine + anomaly scorer.

These are pure functions — no DB, no network, no LLM.
"""

import pytest

from anomaly_scorer import (
    METRIC_BASELINES,
    _parse_numeric,
    _resolve_metric,
    score_anomalies,
)
from data_generator import generate_deterministic_incident
from hybrid_analyzer import Hypothesis, rank_hypotheses
from rules_engine import RuleMatch, RuleRejection, evaluate_rules

CHAOS_FAILURE_TYPES = [
    "Memory leak (OOM Kill)",
    "CPU spike",
    "DB connection failure",
    "Latency spike",
]


# ─── Numeric parsing ────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("99%", 99.0),
        ("120ms", 120.0),
        ("1500 req/s", 1500.0),
        ("-3.5", -3.5),
        (42, 42.0),
        (0.75, 0.75),
        ("no digits here", None),
        (None, None),
        (True, None),
    ],
)
def test_parse_numeric(raw, expected):
    assert _parse_numeric(raw) == expected


# ─── Metric name resolution ─────────────────────────────────────────

@pytest.mark.parametrize(
    "name,expected",
    [
        ("memory_usage", "memory_usage"),
        ("Memory Usage", "memory_usage"),
        ("mem", "memory_usage"),
        ("node_memory_usage_percent", "memory_usage"),
        ("cpu", "cpu_usage"),
        ("network_latency_ms", "latency_p99"),
        ("active_db_connections", "active_db_connections"),
        ("something_unmapped", None),
        ("", None),
    ],
)
def test_resolve_metric(name, expected):
    assert _resolve_metric(name) == expected


# ─── Anomaly scoring: both signal shapes ────────────────────────────

def test_scores_metric_value_shape():
    """The shape the chaos simulator and Prometheus ingest actually emit."""
    report = score_anomalies([{"metric": "memory_usage", "value": "99%"}], [])

    assert len(report.anomalies) == 1
    anomaly = report.anomalies[0]
    assert anomaly.metric_name == "memory_usage"
    assert anomaly.current_value == 99.0
    assert anomaly.is_anomalous is True
    assert anomaly.severity in {"high", "critical"}
    assert report.overall_anomaly_score > 0.5


def test_scores_flat_shape():
    """Legacy/manual shape where the key is the metric name."""
    report = score_anomalies([{"cpu_usage": "93%"}], [])

    assert [a.metric_name for a in report.anomalies] == ["cpu_usage"]
    assert report.anomalies[0].is_anomalous is True


def test_normal_values_are_not_flagged():
    baseline = METRIC_BASELINES["cpu_usage"]["mean"]
    report = score_anomalies([{"metric": "cpu_usage", "value": f"{baseline}%"}], [])

    assert report.anomalies[0].is_anomalous is False
    assert report.anomalies[0].severity == "normal"


def test_error_logs_become_temporal_signals():
    report = score_anomalies([{"log": "Exception: Connection Refused"}], [])

    assert report.anomalies == []
    assert len(report.temporal_signals) == 1
    assert "Connection Refused" in report.temporal_signals[0]


def test_unknown_metrics_and_junk_are_ignored_safely():
    report = score_anomalies(
        [
            {"metric": "totally_unknown_metric", "value": "5"},
            {"metric": "cpu_usage", "value": None},
            {},
            None,
            "not a dict",
        ],
        [],
    )

    assert report.anomalies == []
    assert report.overall_anomaly_score == 0.0


def test_prometheus_alert_shape_does_not_crash():
    """Prometheus signals carry no numeric value — only the log is scanned."""
    report = score_anomalies(
        [{
            "metric": "HighMemoryUsage",
            "log": "container killed: OOMKilled",
            "status": "firing",
            "signal_severity": "severe",
        }],
        [],
    )

    assert report.anomalies == []
    assert len(report.temporal_signals) == 1


# ─── Every chaos scenario must produce a scored anomaly ─────────────

@pytest.mark.parametrize("failure_type", CHAOS_FAILURE_TYPES)
def test_chaos_scenarios_produce_scored_metrics(failure_type):
    incident = generate_deterministic_incident("payment-api", failure_type, "severe")
    report = score_anomalies(incident["signals"], incident["symptoms"])

    assert report.anomalies, f"{failure_type} produced no scored metric"
    assert any(a.is_anomalous for a in report.anomalies), f"{failure_type} flagged nothing"
    assert report.overall_anomaly_score > 0.0
    assert report.summary


@pytest.mark.parametrize("failure_type", CHAOS_FAILURE_TYPES)
def test_chaos_metric_names_are_all_known(failure_type):
    """Guards against the generator drifting away from METRIC_BASELINES."""
    incident = generate_deterministic_incident("payment-api", failure_type, "moderate")
    metric_signals = [s for s in incident["signals"] if "metric" in s]

    assert metric_signals
    for signal in metric_signals:
        assert _resolve_metric(signal["metric"]) is not None, signal["metric"]


def test_severity_scaling_is_monotonic():
    scores = [
        score_anomalies(
            generate_deterministic_incident("payment-api", "Latency spike", sev)["signals"], []
        ).overall_anomaly_score
        for sev in ("mild", "moderate", "severe")
    ]
    assert scores == sorted(scores)


# ─── Rules engine ───────────────────────────────────────────────────

def test_evaluate_rules_returns_matches_and_rejections():
    incident = generate_deterministic_incident("checkout-ui", "Memory leak (OOM Kill)", "severe")
    matches, rejections = evaluate_rules(
        incident["symptoms"], incident["signals"], incident["changes"]
    )

    assert all(isinstance(m, RuleMatch) for m in matches)
    assert all(isinstance(r, RuleRejection) for r in rejections)
    assert len(matches) + len(rejections) == 6  # every rule is accounted for


def test_oom_incident_fires_the_memory_rule():
    incident = generate_deterministic_incident("checkout-ui", "Memory leak (OOM Kill)", "severe")
    matches, _ = evaluate_rules(incident["symptoms"], incident["signals"], incident["changes"])

    assert matches, "no rule fired for an OOM incident"
    assert matches[0].rule_id == "RULE-002"
    assert matches[0].confidence > 0


def test_matches_are_sorted_by_confidence():
    incident = generate_deterministic_incident("database-cluster", "DB connection failure", "severe")
    matches, rejections = evaluate_rules(
        incident["symptoms"], incident["signals"], incident["changes"]
    )

    assert [m.confidence for m in matches] == sorted(
        (m.confidence for m in matches), reverse=True
    )
    assert [r.composite_score for r in rejections] == sorted(
        (r.composite_score for r in rejections), reverse=True
    )


def test_empty_evidence_fires_nothing():
    matches, rejections = evaluate_rules([], [], [])

    assert matches == []
    assert len(rejections) == 6


# ─── Hypothesis ranking ─────────────────────────────────────────────

def _hyp(source, confidence, title):
    return Hypothesis(rank=0, source=source, title=title, description="", confidence=confidence)


def test_rule_match_outranks_a_slightly_stronger_anomaly():
    """Regression: a 3.6σ anomaly used to be presented as the root cause."""
    ranked = rank_hypotheses([
        _hyp("anomaly", 73, "Anomalous memory_usage"),
        _hyp("rules", 70, "[Rule RULE-002] Memory Leak / OOM Kill"),
    ])

    assert ranked[0].title.startswith("[Rule RULE-002]")
    assert [h.rank for h in ranked] == [1, 2]


def test_dominant_anomaly_still_beats_a_weak_rule():
    ranked = rank_hypotheses([
        _hyp("rules", 40, "[Rule RULE-006] Config Drift"),
        _hyp("anomaly", 85, "Anomalous cpu_usage"),
    ])

    assert ranked[0].source == "anomaly"


def test_ranking_is_stable_for_equal_sources():
    ranked = rank_hypotheses([
        _hyp("rules", 60, "second"),
        _hyp("rules", 90, "first"),
    ])

    assert [h.title for h in ranked] == ["first", "second"]
