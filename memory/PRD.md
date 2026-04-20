# Sentinel-SRE — PRD & Work Log

## Original Problem Statement
Single-user RCA platform at https://github.com/sujalmeena7/sentinel-sre
transformed into a multi-tenant SaaS with email+password auth and
per-tenant data isolation.

## Architecture
- Frontend: Next.js 14 App Router on Vercel — `sentinel-sre-zeta.vercel.app`
- Backend: FastAPI (gunicorn + uvicorn on Render)
- Storage: SQLite locally / PostgreSQL on Render (`DATABASE_URL`)
- Vector store: ChromaDB (on-disk) with metadata filtering for tenant isolation
- LLMs: Groq (`llama-3.3-70b-versatile`) primary, OpenAI fallback
- Auth: bcrypt + PyJWT (HS256 Bearer tokens in localStorage)
- Rate limit: slowapi in-memory (single-worker Render free tier)

## Features Shipped

### Session 1 — 2026-04-20 (bug fix)
- Fixed `Analysis failed: 502 -` on deployed Render backend (gunicorn
  default 30s worker timeout → LLM call killed). Procfile now pins
  `--timeout 180`, 1 worker, `--keep-alive 75`.
- Hardened CORS parsing in main.py.
- Frontend `NEXT_PUBLIC_BACKEND_URL` support — production calls bypass
  Vercel Edge proxy (~30s timeout).
- Render cold-start warm-up ping on incident detail mount.

### Session 2 — 2026-04-20 (multi-tenant SaaS upgrade)

#### Backend
- `auth_utils.py`: bcrypt hashing, PyJWT `HS256` access tokens (24h TTL),
  `secrets.token_urlsafe(32)` webhook tokens stored only as SHA-256
  hashes, `get_current_user` FastAPI dependency.
- `models.py`: new `User` table (id, email, password_hash,
  webhook_token_hash, created_at, name, role). `Incident.user_id` FK.
- `database.py`: idempotent column migration (adds `user_id` on legacy
  DBs). On startup, `_seed_admin_and_backfill()` creates the admin user
  from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and assigns orphan incidents to it.
- `main.py`:
  - `POST /api/v1/auth/register` (rate-limited 10/min) → returns JWT +
    webhook_token (shown exactly once).
  - `POST /api/v1/auth/login` (rate-limited 20/min) → returns JWT.
  - `GET /api/v1/auth/me` → current user.
  - `POST /api/v1/auth/rotate-webhook-token` → regenerates token.
  - Every dashboard endpoint (`/incidents`, `/incidents/analyze`,
    `/incidents/feedback`, `/simulation/trigger`, `/evaluation`,
    `/incidents/{id}/postmortem`, `/incidents/{id}/dispatch`,
    `/slack/simulate`, `/chatops/logs`) now requires `get_current_user`
    and filters rows by `user_id == current_user.id`.
  - Webhook ingestion moved to `POST /api/v1/telemetry/prometheus/{token}`.
    Token is hashed (SHA-256) and looked up by hash. Rate-limited
    120/min per client IP. Fingerprint now includes
    `service::alertname::severity` for correct grouping.
- `rag_engine.py`: `add_incident_to_index()` writes `user_id` into
  ChromaDB metadata. `query_similar_incidents()` MANDATORILY filters by
  `user_id` (fail-closed if missing) plus a post-filter defense-in-depth.
- `hybrid_analyzer.py`: threads `user_id` through to the RAG layer.

#### Frontend
- `contexts/AuthContext.tsx`: `AuthProvider` (React Context + localStorage
  persistence), `login` / `register` / `logout` / `rotateWebhookToken`
  methods, `readAuthToken()` + `forceLogoutOn401()` helpers for
  non-React modules.
- `components/ProtectedRoute.tsx`: client-side guard. Shows a spinner
  during hydration, redirects to `/login` if not authenticated.
- `components/UserMenu.tsx`: profile dropdown with user email +
  "Rotate webhook token" + "Sign out". Post-rotate modal displays the
  new token exactly once with a copy-to-clipboard button.
- `app/login/page.tsx` + `app/register/page.tsx`: dark glassmorphism UI
  matching the landing page. Register success shows the Prometheus
  ingestion URL hint with the new tenant's webhook token.
- `app/dashboard/layout.tsx`: wraps in `<ProtectedRoute>` and renders a
  top bar with brand + `<UserMenu>`.
- `app/layout.tsx`: wraps the entire app in `<AuthProvider>`.
- `lib/api.ts`: new `authFetch` wrapper auto-injects Bearer JWT and
  calls `forceLogoutOn401()` on 401 for non-auth routes. All 9 existing
  API calls migrated to `authFetch`.
- Landing page nav: "Sign in" → `/login`, "Launch Dashboard" → `/register`.

## Security Choices
- Passwords stored as bcrypt hashes.
- JWTs signed HS256, 24h TTL, secret from `JWT_SECRET` env.
- Webhook tokens shown ONCE, stored only as SHA-256 hashes.
- Rate limiting on auth + webhook endpoints to prevent brute force / abuse.
- Strict `user_id` filter in SQL + ChromaDB + post-filter defense.
- No plaintext secrets in code; dev-only fallbacks flagged as insecure.

## Required User Actions on Deployed Infra
1. **Render (backend)** — add env vars:
   - `JWT_SECRET=<random 32+ char string>`
   - `ADMIN_EMAIL=you@yourcompany.com`
   - `ADMIN_PASSWORD=<strong password>`
   - `ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app`
   - `DATABASE_URL=<postgres>`
   - Existing: `GROQ_API_KEY`, `OPENAI_API_KEY`
   Then redeploy — the admin is seeded on first boot; check logs for the
   one-time webhook token print.
2. **Vercel (frontend)** — add/keep:
   - `NEXT_PUBLIC_BACKEND_URL=https://<render>.onrender.com`
3. **Update Prometheus/Alertmanager configs** to use the new per-user
   path: `POST /api/v1/telemetry/prometheus/<your-webhook-token>`.

## Status
- ✅ Backend: unit-tested via FastAPI TestClient (register, login, isolation,
  webhook token auth, rate limits, JWT protection).
- ✅ Frontend: production `next build` clean, TypeScript no errors,
  end-to-end UI flow verified (register → token reveal → dashboard
  shows empty list for new tenant).
- ✅ Admin seeded idempotently from env on startup.
- ✅ Legacy incidents auto-assigned to admin on first boot.

## Next Action Items
- Push via "Save to GitHub" button.
- Set env vars on Render (`JWT_SECRET`, `ADMIN_*`, `ALLOWED_ORIGINS`).
- Set env var on Vercel (`NEXT_PUBLIC_BACKEND_URL`).
- Update Prometheus configs with per-user webhook URLs.

## Backlog / Future
- P1: Password reset flow (email-based).
- P1: Async job + polling for `/incidents/analyze` (removes remaining
  cold-start pain entirely).
- P2: Redis-backed rate limiter when we scale past 1 worker.
- P2: Admin-only "view all tenants" dashboard.
- P2: Per-user API keys for programmatic access (distinct from webhook).
- P3: Team/workspace sharing of incidents within a tenant.
