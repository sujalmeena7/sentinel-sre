"""
Deterministic Rules Engine
--------------------------
Pattern-matches known failure modes against incident evidence.
Each rule checks symptoms + signals and returns a hypothesis with confidence.
Rules fire FAST and don't need an LLM — they catch the "obvious" stuff.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class RuleMatch:
    rule_id: str
    rule_name: str
    hypothesis: str
    confidence: int  # 0-100
    evidence: List[str] = field(default_factory=list)
    mitigation: str = ""
    long_term_fix: str = ""
    category: str = "unknown"


@dataclass
class RuleRejection:
    """A rule that was evaluated but did NOT fire, with counter-evidence."""
    rule_id: str
    rule_name: str
    hypothesis: str
    reason: str
    composite_score: float
    missing_evidence: List[str] = field(default_factory=list)


# ─── Rule Definitions ───────────────────────────────────────────────

RULES = [
    {
        "id": "RULE-001",
        "name": "DB Connection Pool Exhaustion",
        "category": "database",
        "symptom_keywords": ["db connection", "connection pool", "connection wait", "connection refused", "slow queries"],
        "signal_keywords": ["connection refused", "timeout", "pool"],
        "change_keywords": ["deploy"],
        "hypothesis": "Database connection pool exhausted — likely caused by a misconfigured connection limit or a sudden traffic spike after a deployment.",
        "confidence": 85,
        "mitigation": "Immediately increase the DB connection pool size (e.g., max_connections). Kill long-running idle connections. Consider enabling PgBouncer or a connection pooler.",
        "long_term_fix": "Tune connection pool settings (min/max/idle timeout). Add connection pool monitoring alerts. Implement query timeout limits.",
    },
    {
        "id": "RULE-002",
        "name": "Memory Leak / OOM Kill",
        "category": "resource",
        "symptom_keywords": ["oom", "out of memory", "pod restarted", "memory", "killed"],
        "signal_keywords": ["memory", "oom", "killed"],
        "change_keywords": ["deploy", "version"],
        "hypothesis": "Memory leak causing OOM kills — a recent deployment likely introduced unbounded memory growth (e.g., caching without eviction, goroutine/thread leak).",
        "confidence": 90,
        "mitigation": "Immediately rollback to the previous stable version. Set memory limits on the container/pod. Restart affected instances.",
        "long_term_fix": "Profile memory usage with heap dumps. Add memory leak detection in CI. Implement bounded caches with TTL eviction.",
    },
    {
        "id": "RULE-003",
        "name": "SSL Certificate Expiry",
        "category": "security",
        "symptom_keywords": ["ssl", "tls", "handshake", "certificate", "network timeout"],
        "signal_keywords": ["ssl", "handshake", "certificate", "connection refused"],
        "change_keywords": [],
        "hypothesis": "Expired or invalid SSL/TLS certificate preventing secure connections — services cannot establish TLS handshakes, causing cascading network timeouts.",
        "confidence": 92,
        "mitigation": "Check certificate expiration dates immediately. Renew and redeploy the affected certificates. As a temporary measure, consider if the internal service can briefly use HTTP (only in isolated networks).",
        "long_term_fix": "Implement automated certificate rotation (e.g., cert-manager, Let's Encrypt). Add certificate expiry monitoring with 30-day alerts.",
    },
    {
        "id": "RULE-004",
        "name": "Downstream Service Outage",
        "category": "dependency",
        "symptom_keywords": ["timeout", "latency", "5xx", "error spike", "gateway", "downstream"],
        "signal_keywords": ["timeout", "connection refused", "503", "502", "504"],
        "change_keywords": [],
        "hypothesis": "A downstream dependency (API, database, or third-party service) is experiencing an outage or severe degradation, causing cascading failures upstream.",
        "confidence": 75,
        "mitigation": "Enable circuit breakers for the affected downstream service. Activate fallback/degraded mode. Check the downstream service's status page.",
        "long_term_fix": "Implement circuit breaker pattern (e.g., resilience4j, Hystrix). Add retry with exponential backoff. Create fallback responses for critical paths.",
    },
    {
        "id": "RULE-005",
        "name": "CPU Saturation",
        "category": "resource",
        "symptom_keywords": ["high latency", "slow", "timeout", "cpu"],
        "signal_keywords": ["cpu", "99%", "100%", "high"],
        "change_keywords": ["deploy"],
        "hypothesis": "CPU saturation — the service is compute-bound, likely due to an inefficient code path introduced in a recent deployment or a sudden traffic spike.",
        "confidence": 70,
        "mitigation": "Scale horizontally (add more replicas). Check for CPU-intensive operations (tight loops, unoptimized queries). Rate-limit incoming requests if under attack.",
        "long_term_fix": "Profile CPU hotspots. Optimize algorithmic complexity. Implement auto-scaling policies based on CPU utilization thresholds.",
    },
    {
        "id": "RULE-006",
        "name": "Configuration Change Regression",
        "category": "change",
        "symptom_keywords": ["error", "failure", "crash", "exception"],
        "signal_keywords": ["exception", "error", "crash"],
        "change_keywords": ["config", "configuration", "feature flag", "env"],
        "hypothesis": "A recent configuration change (environment variable, feature flag, or config file update) introduced a regression causing service failures.",
        "confidence": 80,
        "mitigation": "Immediately revert the configuration change. Verify the service recovers. Check config diff for obvious issues.",
        "long_term_fix": "Implement config change auditing. Use gradual rollout for config changes. Add config validation checks before deployment.",
    },
]


def _normalize(text: str) -> str:
    return text.lower().strip()


def _keyword_match_score(text_pool: List[str], keywords: List[str]) -> float:
    """Returns 0.0–1.0 based on what fraction of keywords match any text in the pool."""
    if not keywords:
        return 0.0
    pool = " ".join(_normalize(t) for t in text_pool)
    hits = sum(1 for kw in keywords if _normalize(kw) in pool)
    return hits / len(keywords)


def evaluate_rules(
    symptoms: List[str],
    signals: List[Dict[str, Any]],
    changes: List[Dict[str, Any]] = None,
) -> List[RuleMatch]:
    """
    Run all deterministic rules against the incident evidence.
    Returns a list of RuleMatch objects sorted by confidence (highest first).
    Only rules with a match score above the threshold are returned.
    """
    changes = changes or []

    # Flatten signals and changes into searchable text lists
    signal_texts = []
    for sig in signals:
        signal_texts.extend(str(v) for v in sig.values())

    change_texts = []
    for chg in changes:
        change_texts.extend(str(v) for v in chg.values())

    matches: List[RuleMatch] = []
    rejections: List[RuleRejection] = []

    for rule in RULES:
        # Score each evidence dimension
        symptom_score = _keyword_match_score(symptoms, rule["symptom_keywords"])
        signal_score = _keyword_match_score(signal_texts, rule["signal_keywords"])
        change_score = _keyword_match_score(change_texts, rule["change_keywords"]) if rule["change_keywords"] else 0.5  # neutral if rule doesn't care about changes

        # Weighted composite: symptoms matter most, signals second, changes third
        composite = (symptom_score * 0.5) + (signal_score * 0.35) + (change_score * 0.15)

        # Only fire the rule if composite match is above 30%
        if composite >= 0.3:
            # Scale the rule's base confidence by how well the evidence matches
            adjusted_confidence = int(rule["confidence"] * composite)
            adjusted_confidence = min(adjusted_confidence, 99)  # cap at 99

            # Collect which evidence triggered the match
            evidence = []
            if symptom_score > 0:
                matched_syms = [s for s in symptoms if any(_normalize(kw) in _normalize(s) for kw in rule["symptom_keywords"])]
                evidence.extend(f"Symptom: {s}" for s in matched_syms)
            if signal_score > 0:
                evidence.append(f"Signal match score: {signal_score:.0%}")
            if change_score > 0 and rule["change_keywords"]:
                evidence.append(f"Recent change detected (deployment/config)")

            matches.append(
                RuleMatch(
                    rule_id=rule["id"],
                    rule_name=rule["name"],
                    hypothesis=rule["hypothesis"],
                    confidence=adjusted_confidence,
                    evidence=evidence,
                    mitigation=rule["mitigation"],
                    long_term_fix=rule["long_term_fix"],
                    category=rule["category"],
                )
            )
        else:
            # Build counter-evidence: what was missing?
            missing = []
            if symptom_score == 0:
                missing.append(f"No matching symptoms (expected: {', '.join(rule['symptom_keywords'][:3])})")
            elif symptom_score < 0.5:
                missing.append(f"Weak symptom match ({symptom_score:.0%})")
            if signal_score == 0:
                missing.append(f"No matching signals (expected: {', '.join(rule['signal_keywords'][:3])})")
            elif signal_score < 0.5:
                missing.append(f"Weak signal match ({signal_score:.0%})")
            if rule["change_keywords"] and change_score == 0:
                missing.append(f"No relevant changes detected")

            reason = f"Evidence score {composite:.0%} below 30% threshold. " + "; ".join(missing)

            rejections.append(
                RuleRejection(
                    rule_id=rule["id"],
                    rule_name=rule["name"],
                    hypothesis=rule["hypothesis"],
                    reason=reason,
                    composite_score=round(composite, 3),
                    missing_evidence=missing,
                )
            )

    # Sort by confidence descending
    matches.sort(key=lambda m: m.confidence, reverse=True)
    # Sort rejections by how close they were to firing (highest composite first)
    rejections.sort(key=lambda r: r.composite_score, reverse=True)
    return matches, rejections
