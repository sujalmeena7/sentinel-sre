import json
import requests
import time

BASE_URL = "http://127.0.0.1:8000/api/v1/incidents"

def test_hybrid_analysis():
    print("=" * 70)
    print("  🧠 AI Root Cause Analyzer — Hybrid Reasoning Engine Test")
    print("=" * 70)

    # Step 1: Load and ingest seed data
    print("\n🚀 1. Loading seed data...")
    with open("seed_data.json", "r") as f:
        incidents = json.load(f)

    print(f"\n🚀 2. Ingesting {len(incidents)} historical incidents...")
    for inc in incidents:
        res = requests.post(f"{BASE_URL}/ingest", json=inc)
        status = "✅" if res.status_code == 200 else "❌"
        print(f"  {status} {inc['service']} ({inc['id'][:8]}...)")

    print("\n⏳ Waiting 3 seconds for ChromaDB embedding...")
    time.sleep(3)

    # Step 2: Run hybrid analysis with a realistic incident
    print("\n" + "=" * 70)
    print("  🔬 Running Hybrid Analysis on NEW Incident")
    print("=" * 70)

    payload = {
        "symptoms": ["SSL Handshake Failed", "Network Timeout"],
        "signals": [
            {"metric": "cpu_usage", "value": "99%"},
            {"log": "Exception: Connection Refused"},
            {"metric": "error_rate", "value": "12%"},
        ],
        "changes": [
            {"event": "deploy", "version": "v2.3.1"}
        ]
    }

    print(f"\n  🚨 Symptoms: {payload['symptoms']}")
    print(f"  📊 Signals:  {payload['signals']}")
    print(f"  🔄 Changes:  {payload['changes']}")

    res = requests.post(f"{BASE_URL}/analyze", json=payload)

    if res.status_code != 200:
        print(f"\n❌ Analysis failed: {res.text}")
        return

    data = res.json()

    # Display reasoning chain
    print(f"\n{'─' * 50}")
    print("  ⚙️  REASONING CHAIN")
    print(f"{'─' * 50}")
    for step in data.get("reasoning_chain", []):
        print(f"  {step}")

    # Display anomaly report
    print(f"\n{'─' * 50}")
    print("  📊 ANOMALY REPORT")
    print(f"{'─' * 50}")
    anomaly = data.get("anomaly_report", {})
    print(f"  Overall Score: {anomaly.get('overall_score', 'N/A')}")
    print(f"  Summary: {anomaly.get('summary', 'N/A')}")
    for a in anomaly.get("anomalies", []):
        flag = "🔴" if a["is_anomalous"] else "🟢"
        print(f"  {flag} {a['metric']}: z={a['z_score']} ({a['severity']}) — {a['description']}")
    for sig in anomaly.get("error_signals", []):
        print(f"  {sig}")

    # Display ranked hypotheses
    print(f"\n{'─' * 50}")
    print("  🏆 RANKED HYPOTHESES")
    print(f"{'─' * 50}")
    for hyp in data.get("hypotheses", []):
        src_icon = {"rules": "⚡", "anomaly": "📊", "llm": "🧠", "rag": "🔍"}.get(hyp["source"], "❓")
        print(f"\n  #{hyp['rank']} {src_icon} [{hyp['source'].upper()}] {hyp['title']}")
        print(f"     Confidence: {hyp['confidence']}%")
        print(f"     {hyp['description'][:120]}...")
        if hyp.get("evidence"):
            for ev in hyp["evidence"][:3]:
                print(f"     📌 {ev}")
        if hyp.get("mitigation"):
            print(f"     🛡️  Mitigation: {hyp['mitigation'][:100]}...")

    # Display similar incidents
    print(f"\n{'─' * 50}")
    print("  🔍 RAG: SIMILAR PAST INCIDENTS")
    print(f"{'─' * 50}")
    for i, text in enumerate(data.get("similar_historic_incidents", []), 1):
        print(f"  [{i}] {text[:150].strip()}...")

    # Display LLM narrative
    print(f"\n{'─' * 50}")
    print("  🧠 LLM SYNTHESIS (Groq)")
    print(f"{'─' * 50}")
    print(data.get("llm_narrative", "No narrative generated."))
    print(f"\n{'=' * 70}")


if __name__ == "__main__":
    test_hybrid_analysis()
