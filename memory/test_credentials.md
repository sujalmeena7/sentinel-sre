# Sentinel-SRE — Test Credentials

## Seeded Admin (created on backend startup)

| Field | Value |
|---|---|
| Email | `admin@sentinel.local` (override via `ADMIN_EMAIL` env) |
| Password | `admin123` (override via `ADMIN_PASSWORD` env) |
| Role | `admin` |
| Webhook token | Printed to backend logs ONCE on first boot (line: `🔑 Admin webhook token ...`). Lost after that unless rotated via UI. |

## Endpoints

| Purpose | Method | Path |
|---|---|---|
| Register | `POST` | `/api/v1/auth/register` |
| Login | `POST` | `/api/v1/auth/login` |
| Current user | `GET` | `/api/v1/auth/me` |
| Rotate webhook token | `POST` | `/api/v1/auth/rotate-webhook-token` |
| Prometheus ingest (per-tenant) | `POST` | `/api/v1/telemetry/prometheus/{webhook_token}` |
| Incidents list (tenant-scoped) | `GET` | `/api/v1/incidents` |
| Analyze | `POST` | `/api/v1/incidents/analyze` |
| Trigger chaos simulation | `POST` | `/api/v1/simulation/trigger` |
| Feedback | `POST` | `/api/v1/incidents/feedback` |
| Postmortem | `POST` | `/api/v1/incidents/{id}/postmortem` |
| Dispatch to Slack/Teams | `POST` | `/api/v1/incidents/{id}/dispatch` |

## Required Environment Variables

### Backend (Render)

```
JWT_SECRET=<random 32+ char string>
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=<strong password>
ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app
DATABASE_URL=<postgres URL on Render>
GROQ_API_KEY=<optional>
OPENAI_API_KEY=<optional, for embeddings + RAG>
SLACK_WEBHOOK_URL=<optional>
TEAMS_WEBHOOK_URL=<optional>
SLACK_ALLOWED_HOSTS=hooks.slack.com
TEAMS_ALLOWED_HOSTS=*.webhook.office.com
```

### Frontend (Vercel)

```
NEXT_PUBLIC_BACKEND_URL=https://<your-render-backend>.onrender.com
```

## Quick Local Test

```bash
cd /app/backend
export JWT_SECRET='a-32-char-test-secret-for-local-1234'
export DATABASE_URL='sqlite:///./incidents.db'
export ALLOWED_ORIGINS='*'
export ADMIN_EMAIL='admin@sentinel.local'
export ADMIN_PASSWORD='admin12345'
uvicorn main:app --reload
# Admin webhook token will print to the console on first boot
```
