# Sentinel-SRE: AI-Powered Root Cause Analysis with Chaos Simulation and Feedback-Aware Learning

> **AI-powered Root Cause Analysis and Automated Postmortems for Modern Systems**

Sentinel-SRE is a next-generation incident management platform that transforms how engineers handle system failures. By combining deterministic rules, statistical anomaly detection, and a feedback-aware RAG (Retrieval-Augmented Generation) pipeline, Sentinel-SRE doesn't just tell you *what* failed—it tells you *why* and how to fix it permanently.

## 🚀 Key Features

- **Hybrid Analysis Engine:** Layers deterministic SRE rules with real-time statistical anomaly scoring.
- **Feedback-Aware RAG:** Learns from human engineer feedback (Thumbs Up/Down) to refine future hypotheses and filter out "noisy" historic data.
- **Service Dependency Graph:** Interactive SVG visualization showing real-time blast radius and downstream impact propagation.
- **Automated Postmortems:** Generates senior-level SRE postmortems in Markdown, ready for copy/download.
- **Channel Dispatch:** Send generated postmortems directly to Slack or Microsoft Teams via Incoming Webhooks.
- **"Why Not X?" Explainability:** Transparently shows why certain theories were rejected, reducing "AI black box" frustration.
- **Chaos Simulation:** Built-in "Chaos Lab" to simulate memory leaks, DB spikes, and network outages for testing response resilience.

## 🛠️ Tech Stack

- **Backend:** FastAPI, Python, SQLite
- **AI/ML:** LlamaIndex, ChromaDB, Groq (LLM Inference)
- **Frontend:** Next.js 14, React, Framer Motion, TailwindCSS
- **Visualization:** Custom SVG Component Architecture

## 📦 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Groq API Key

 # Backend Setup
1. `cd backend`
2. `pip install -r requirements.txt`
3. Create a `.env` file with your `GROQ_API_KEY` and optional dispatch webhooks:
   - `SLACK_WEBHOOK_URL=...`
   - `TEAMS_WEBHOOK_URL=...`
4. Run: `uvicorn main:app --reload`

# Frontend Setup
1. `cd frontend`
2. `npm install`
3. Run: `npm run dev`

---

Built with ⚡ by Sentinel-SRE Team.
