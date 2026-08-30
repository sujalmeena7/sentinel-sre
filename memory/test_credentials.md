# Sentinel-SRE — Test Credentials

## Seeded Admin (created on backend startup)

| Field | Value |
|---|---|
| Email | `admin@sentinel-sre.dev` (override via `ADMIN_EMAIL`) |
| Password | Whatever `ADMIN_PASSWORD` is set to. If unset in dev, a random one is generated and printed to the log (`ADMIN_PASSWORD not set - using random dev password: ...`). In production the seeder refuses to run rather than create a weak admin. |
| Role | `admin` |
| Webhook token | Printed to the backend log ONCE on first boot (`Admin webhook token (save this - shown once)`). Lost after that unless rotated via the UI or `POST /api/v1/auth/rotate-webhook-token`. |

> `ADMIN_EMAIL` must use a real public TLD. `.local` (and other reserved suffixes) are rejected by the
> login validator, so the seeder logs an error and falls back to `admin@sentinel-sre.dev`. The old
> `admin@sentinel.local` account is auto-migrated to the new address on startup, so an existing DB
> keeps its incidents.

## Endpoints

| Purpose | Method | Path |
|---|---|---|
| Register | `POST` | `/api/v1/auth/register` |
| Login | `POST` | `/api/v1/auth/login` |
| Current user | `GET` | `/api/v1/auth/me` |
| Refresh token | `POST` | `/api/v1/auth/refresh` |
| Rotate webhook token | `POST` | `/api/v1/auth/rotate-webhook-token` |
| Prometheus ingest (per-tenant) | `POST` | `/api/v1/telemetry/prometheus/{webhook_token}` |
| Incidents list (tenant-scoped) | `GET` | `/api/v1/incidents` |
| Single incident | `GET` | `/api/v1/incidents/{id}` |
| Manual ingest | `POST` | `/api/v1/incidents/ingest` |
| Analyze (async, returns a task id) | `POST` | `/api/v1/incidents/analyze` |
| Analysis status | `GET` | `/api/v1/incidents/analyze/{id}/status` |
| Trigger chaos simulation | `POST` | `/api/v1/simulation/trigger` |
| Feedback | `POST` | `/api/v1/incidents/feedback` |
| Postmortem | `POST` | `/api/v1/incidents/{id}/postmortem` |
| Dispatch to Slack/Teams | `POST` | `/api/v1/incidents/{id}/dispatch` |
| Evaluation scorecard | `GET` | `/api/v1/evaluation` |
| Health | `GET` | `/health` and `/api/v1/health` |

Password rules on register: 8+ characters with at least one uppercase, one lowercase and one digit
(otherwise 422). Duplicate email returns 409. Cross-tenant reads return **404**, not 403.

## Required Environment Variables

### Backend (Render)

```
JWT_SECRET=<64-char random string: python -c "import secrets; print(secrets.token_urlsafe(64))">
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=<strong password>
DATABASE_URL=<postgres URL on Render>
APP_ENV=production
PYTHON_VERSION=3.12.7                                  # 3.13 is not supported by the pinned ChromaDB
ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app   # ADDED to the built-in defaults, not a replacement
FRONTEND_URL=https://<your-vercel-app>.vercel.app      # used in verification/notification links
CHROMA_PATH=/tmp/chroma_db                             # free tier has no disk; /var/data/chroma_db on a paid plan
DIAGNOSTICS_TOKEN=<random>                             # unlocks /api/v1/diagnostics in production
GROQ_API_KEY=<recommended>
GROQ_MODEL=openai/gpt-oss-120b                         # override when Groq retires the default
OPENAI_API_KEY=<optional: second LLM + API embeddings>
SLACK_WEBHOOK_URL=<optional>
TEAMS_WEBHOOK_URL=<optional>
```

All of this is declared in [render.yaml](../render.yaml) — apply it as a Render Blueprint instead of
setting the fields by hand. Secrets are `sync: false` there, so Render prompts for them.

Start command (single worker and the long timeout are both required):

```
gunicorn -w 1 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:$PORT --timeout 180 --graceful-timeout 30 --keep-alive 75
```

Neither LLM key is mandatory. Without one, analysis still returns rules + anomalies + RAG, and
postmortems render as a data-only document labelled "generated without AI narration".
Without a working embedding API, RAG falls back to a local hashing embedding (lexical, not semantic)
stored in a separate Chroma collection.

### Frontend (Vercel)

```
NEXT_PUBLIC_BACKEND_URL=https://<your-render-backend>.onrender.com
```

Direct browser → backend calls are correct here, not the proxy: Vercel's proxy layer times out
around 30s, which kills `/incidents/analyze` and `/incidents/{id}/postmortem`. Because the browser
calls the backend directly, CORS applies — the Vercel origin must appear in the backend's
`ALLOWED_ORIGINS` (the canonical domains are already in the built-in defaults).

`BACKEND_URL` is the alternative: it drives the server-side rewrite (`/api/*` → backend) and
sidesteps CORS, but inherits the proxy timeout. Set one, not both.

## Diagnosing a broken deploy

```bash
curl https://<backend>/health                                    # liveness, never touches the DB
curl https://<backend>/api/v1/health                             # {"degraded": bool, "degraded_subsystems": [...]}
curl "https://<backend>/api/v1/diagnostics?token=$DIAGNOSTICS_TOKEN"
```

`/api/v1/diagnostics` returns per-step startup results, DB reachability, the resolved embedding
backend and vector count, which provider keys are present, and the CORS allowlist. No secret values,
and it 404s in production without the token — deliberately usable when the DB is down and login is
impossible.

## Quick Local Test

```bash
cd backend
source venv/Scripts/activate        # venv/bin/activate on macOS/Linux
export JWT_SECRET='a-32-char-test-secret-for-local-1234'
export DATABASE_URL='sqlite:///./incidents.db'
export ADMIN_EMAIL='admin@sentinel-sre.dev'
export ADMIN_PASSWORD='Passw0rdLocal'
uvicorn main:app --reload --port 8000
# The admin webhook token prints to the console on first boot.
```

Then, against the running server:

```bash
python scripts/smoke_e2e.py         # 9-step live probe: login -> chaos -> analyze -> postmortem -> evaluation
```

Offline test suite (no server, no network, does not read your real `.env`):

```bash
pytest                              # 125 tests
```
