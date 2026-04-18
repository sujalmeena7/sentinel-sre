from datetime import datetime, timedelta, timezone
from uuid import uuid4


def generate_deterministic_incident(service: str, failure_type: str, severity: str) -> dict:
    """
    Generate a single, highly deterministic incident payload based on specific chaos parameters.
    Returns datetime objects (not ISO strings) so it can be passed directly to the Incident model.
    """

    # Establish dynamic baseline scaling
    severity_scaler = {"mild": 1, "moderate": 2, "severe": 3}.get(severity, 2)
    start_time = datetime.now(timezone.utc)

    incident = {
        "id": str(uuid4()),
        "service": service,
        "environment": "production",
        "start_time": start_time,
        "peak_time": start_time + timedelta(minutes=5 * severity_scaler),
        "resolved_time": None,
        "symptoms": [],
        "signals": [],
        "changes": [],
        "root_cause": None,
        "fixes_applied": [],
        "runbook_refs": [f"https://wiki.company.com/runbook/{service}"]
    }

    # Deterministic Architecture Mapping & Upstream impacts
    if failure_type == "Memory leak (OOM Kill)":
        incident["symptoms"] = ["Pod Restarted", "OOM Killed", f"{service.replace('-', ' ').title()} unstable"]
        incident["signals"] = [
            {"metric": "memory_usage", "value": f"{90 + (severity_scaler * 3)}%"},
            {"log": f"Terminating pod {service}-xyz due to OOMKilled"},
        ]
        incident["changes"] = [{"event": "deploy", "version": "v2.1", "description": "New caching layer introduced"}]
        incident["root_cause"] = f"Memory leak in the new caching layer introduced in version 2.1 on {service}."

    elif failure_type == "CPU spike":
        incident["symptoms"] = ["High Latency", "Timeout Errors", "Slow Requests"]
        incident["signals"] = [
            {"metric": "cpu_usage", "value": f"{85 + (severity_scaler * 4)}%"},
            {"log": "Worker thread blocked for > 5000ms"}
        ]
        incident["changes"] = [{"event": "deploy", "version": "v2.2", "description": "Regex algorithm optimization"}]
        incident["root_cause"] = f"Inefficient code path causing CPU saturation and thread blocking on {service}."

    elif failure_type == "DB connection failure":
        incident["symptoms"] = ["DB Connection Wait Error", "Slow Queries", "5xx Error Spikes"]
        incident["signals"] = [
            {"log": "Exception: Connection Refused"},
            {"metric": "active_db_connections", "value": f"{500 * severity_scaler}"},
            {"log": "Timeout waiting for connection from pool"}
        ]
        incident["changes"] = [{"event": "config_change", "key": "DB_IDLE_TIMEOUT", "old": "300s", "new": "10s"}]
        incident["root_cause"] = f"Database connection pool exhausted due to misconfigured idle timeout impacting {service}."

    elif failure_type == "Latency spike":
        incident["symptoms"] = ["Network Timeout", "High Latency", "Upstream Unavailable Response"]
        incident["signals"] = [
            {"metric": "network_latency_ms", "value": f"{200 * severity_scaler}ms"},
            {"log": "P99 latency exceeded 2000ms limits"}
        ]
        incident["root_cause"] = f"Downstream dependency overloaded causing cascading latency spikes at {service}."

    # Failsafe Default
    else:
        incident["symptoms"] = ["General Degradation"]
        incident["signals"] = [{"log": "Unknown error pattern detected"}]

    return incident
