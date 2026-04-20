# Sentinel-SRE — PRD & Work Log

## Original Problem Statement
User (repo: https://github.com/sujalmeena7/sentinel-sre) reported that the
deployed app (Vercel frontend + Render backend) returns `Analysis failed: 502 -`
when clicking **Run Analysis** on an incident. Works locally.

## Architecture
- Frontend: Next.js 14 on Vercel — `sentinel-sre-zeta.vercel.app`
- Backend: FastAPI on Render — `sentinel-backend-box9.onrender.com`
- Storage: PostgreSQL + ChromaDB (vector store)
- LLMs: Groq (`llama-3.3-70b-versatile`) primary, OpenAI fallback
- Both Vercel and Render on **free tier**

## Root Cause (diagnosed 2026-04-20)
1. **PRIMARY** — `backend/Procfile` used `gunicorn -w 4 -k uvicorn.workers.UvicornWorker`
   with **no `--timeout` flag** → default is **30s**. The hybrid analysis
   (Rules + Anomaly + OpenAI embeddings + ChromaDB + Groq LLM) regularly
   exceeds 30s, so gunicorn killed the worker mid-request → Render returned
   `502` with empty body. Reproduced via direct `curl POST` to the backend:
   502 in ~28s, `x-render-origin-server: Render` (not uvicorn).
2. **SECONDARY** — `ALLOWED_ORIGINS` env var on Render did not include the
   Vercel domain; preflight returned `Disallowed CORS origin`. This would
   have blocked direct browser → Render calls once we bypass the Vercel proxy.
3. **TERTIARY** — `-w 4` workers on Render free tier (512MB RAM) with
   ChromaDB + LlamaIndex per worker risked OOM.
4. **TERTIARY** — Vercel Edge rewrite proxy (`next.config.mjs`) has its own
   ~30s timeout, which would hit anyway if backend slowed down.

## Fixes Applied (2026-04-20)

### Backend
- `backend/Procfile`: reduced to 1 worker, set `--timeout 180 --graceful-timeout 30 --keep-alive 75`.
- `backend/main.py`: hardened CORS parsing — empty/missing `ALLOWED_ORIGINS`
  now cleanly falls back to `["*"]` instead of `[""]`, plus logs the
  resolved origin list at startup.

### Frontend
- `frontend/lib/api.ts`: added `NEXT_PUBLIC_BACKEND_URL` support — when set,
  all API calls go **directly** to the Render backend, bypassing the Vercel
  Edge proxy timeout. Falls back to the old relative `/api/v1` path for
  local dev.
- `frontend/lib/api.ts`: added `warmBackend()` — a fire-and-forget GET to
  `/` that wakes the Render free-tier dyno on page load, so the first
  "Run Analysis" click doesn't eat a cold start.
- `frontend/lib/api.ts`: clearer error message on `502 + empty body`
  (the mysterious `Analysis failed: 502 -`) so users know to retry.
- `frontend/components/IncidentDetail.tsx`: calls `warmBackend()` on mount.
- `frontend/.env.local.example`: documented the new env var.

## Required User Actions on Deployed Infra
1. **On Render** (backend service):
   - Set env var `ALLOWED_ORIGINS=*` (or specifically include the Vercel
     URL: `https://sentinel-sre-zeta.vercel.app`).
   - Commit the updated `Procfile` and redeploy.
2. **On Vercel** (frontend project):
   - Add env var `NEXT_PUBLIC_BACKEND_URL=https://sentinel-backend-box9.onrender.com`.
   - Trigger a redeploy.

## Status
- ✅ Primary 502 root cause identified (gunicorn 30s worker timeout).
- ✅ Backend Procfile fixed (180s timeout, 1 worker).
- ✅ CORS hardened in `main.py`.
- ✅ Frontend now bypasses Vercel Edge proxy in production.
- ✅ Render cold-start warm-up added.
- ⏳ End-to-end verification requires user to redeploy both services and
  set the env vars listed above.

## Next Action Items
- User pushes these changes to GitHub (via "Save to GitHub" button).
- User updates env vars on Render and Vercel and redeploys.
- Confirm `Run Analysis` succeeds on the deployed `sentinel-sre-zeta.vercel.app`.
- Optional Phase 2: convert `/incidents/analyze` to an async job + polling
  pattern for extra robustness against cold starts (tracked as P1).

## Backlog
- P1: Async job + polling for `/incidents/analyze` and `/postmortem`.
- P2: Add `/api/v1/healthz` endpoint used by the warm-up pinger.
- P2: Cron-based Render keep-alive (external uptime monitor) to avoid
  cold starts entirely.
