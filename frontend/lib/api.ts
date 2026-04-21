// ─────────────────────────────────────────────────────────────
// API base resolution
// ─────────────────────────────────────────────────────────────
// In production (Vercel), call the Render backend DIRECTLY to avoid the
// ~30s Vercel Edge proxy timeout that breaks LLM-heavy calls like
// /incidents/analyze and /incidents/:id/postmortem.
//
// Local dev: if NEXT_PUBLIC_BACKEND_URL is unset, fall back to the
// relative "/api/v1" path which is rewritten by next.config.mjs to
// http://127.0.0.1:8000 during `next dev`.
//
// CORS: the backend already allows `*` origins with credentials off,
// so direct browser → Render calls work without any server changes.
// ─────────────────────────────────────────────────────────────
import { readAuthToken, forceLogoutOn401 } from '@/contexts/AuthContext';

const RAW_BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim().replace(/\/+$/, '');
const API_BASE = RAW_BACKEND_URL ? `${RAW_BACKEND_URL}/api/v1` : '/api/v1';

// Warm-up: if we're calling Render free tier, fire a cheap ping so the
// first real request doesn't eat the 30-60s cold start.
let _warmupFired = false;
export function warmBackend(): void {
  if (_warmupFired || !RAW_BACKEND_URL || typeof window === 'undefined') return;
  _warmupFired = true;
  // Non-blocking, no-await — any response (200/404/etc.) wakes the dyno.
  fetch(`${RAW_BACKEND_URL}/`, { method: 'GET', cache: 'no-store', keepalive: true })
    .catch(() => { /* silent */ });
}

// ─────────────────────────────────────────────────────────────
// Authenticated fetch wrapper
// ─────────────────────────────────────────────────────────────
async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = readAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    const isAuthRoute = input.includes('/auth/login') || input.includes('/auth/register');
    if (!isAuthRoute) forceLogoutOn401();
  }
  return res;
}

export interface Incident {
  id: string;
  service: string;
  environment: string;
  start_time: string;
  peak_time: string | null;
  resolved_time: string | null;
  symptoms: string[];
  signals: { [key: string]: string }[];
  changes: { [key: string]: string }[];
  root_cause: string | null;
  fixes_applied: {
    action: string;
    description: string;
    timestamp: string;
    source: string;
    status: string;
  }[];
  acknowledged_by?: string | null;
  predicted_cause?: string | null;
  expected_cause?: string | null;
  is_correct?: boolean | null;
  human_feedback_score?: number | null;
  human_feedback_count?: number | null;
  human_feedback_comment?: string | null;
  runbook_refs: string[];
  // Async analysis tracking (populated by the non-blocking /analyze pipeline)
  analysis_status?: 'idle' | 'processing' | 'completed' | 'failed' | null;
  analysis_result?: AnalysisResult | null;
  analysis_error?: string | null;
}

export interface AnalysisResult {
  hypotheses: any[];
  anomaly_report: any;
  similar_historic_incidents: string[];
  llm_narrative: string;
  reasoning_chain: string[];
  analysis_breakdown?: { [key: string]: string };
  rejected_hypotheses?: any[];
}

export interface AnalyzeKickoffResponse {
  status: 'processing';
  message: string;
  incident_id: string;
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await authFetch(`${API_BASE}/incidents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch incidents');
  return res.json();
}

export async function fetchIncident(incident_id: string): Promise<Incident> {
  const res = await authFetch(`${API_BASE}/incidents/${incident_id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch incident');
  return res.json();
}

export async function analyzeIncident(
  incident_id: string,
  symptoms: string[],
  signals: { [key: string]: string }[]
): Promise<AnalyzeKickoffResponse> {
  let res: Response;
  try {
    res = await authFetch(`${API_BASE}/incidents/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id, symptoms, signals }),
    });
  } catch (networkErr: any) {
    throw new Error(
      `Network error while contacting the analysis engine. ` +
      `If the backend is on Render free tier it may be cold-starting — please retry in ~30s. ` +
      `(${networkErr?.message || 'fetch failed'})`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to start analysis: ${res.status} ${res.statusText} - ${text}`);
  }
  // Non-blocking API: returns immediately with { status: "processing", ... }.
  // The caller should poll the incident record (or rely on the dashboard's
  // 4s list poll) to read `analysis_status` / `analysis_result`.
  return res.json();
}

export async function submitFeedback(incident_id: string, score: number, comment?: string) {
  const res = await authFetch(`${API_BASE}/incidents/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incident_id, score, comment }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Feedback submission failed: ${text}`);
  }
  return res.json();
}

export async function ingestIncident(incident: Partial<Incident>) {
  const res = await authFetch(`${API_BASE}/incidents/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(incident),
  });
  if (!res.ok) throw new Error('Ingestion failed');
  return res.json();
}

export async function triggerSimulation(service: string, failure_type: string, severity: string) {
  const res = await authFetch(`${API_BASE}/simulation/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, failure_type, severity }),
  });
  if (!res.ok) throw new Error('Failed to trigger simulation');
  return res.json();
}

export async function fetchEvaluation() {
  const res = await authFetch(`${API_BASE}/evaluation`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch evaluation metrics');
  return res.json();
}

export async function generatePostmortem(incident_id: string): Promise<{ postmortem: string }> {
  const res = await authFetch(`${API_BASE}/incidents/${incident_id}/postmortem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Postmortem generation failed: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function dispatchPostmortem(
  incident_id: string,
  destination: 'slack' | 'teams',
  webhook_override?: string
): Promise<{ status: string; destination: string; incident_id: string }> {
  const res = await authFetch(`${API_BASE}/incidents/${incident_id}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, webhook_override: webhook_override || undefined }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dispatch failed: ${res.status} - ${text}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// ChatOps Types
// ═══════════════════════════════════════════════════════════════

export type ChatOpsActionType = 'acknowledge' | 'execute_runbook' | 'resolve';

export interface ChatOpsResult {
  status: string;
  action: string;
  message: string;
}

export interface ChatOpsLogEntry {
  action: ChatOpsActionType;
  incident_id: string;
  mode: 'simulation' | 'real';
  timestamp: string;
  user: string;
}

// ═══════════════════════════════════════════════════════════════
// Retry Helper (exponential backoff)
// ═══════════════════════════════════════════════════════════════

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  label: string
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[ChatOps] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════
// ChatOps API Calls
// ═══════════════════════════════════════════════════════════════

async function callChatOpsEndpoint(
  incident_id: string,
  action: ChatOpsActionType,
  username: string
): Promise<ChatOpsResult> {
  const res = await authFetch(`${API_BASE}/slack/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incident_id, action, username }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ChatOps action failed: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function handleChatOpsAction(
  action: ChatOpsActionType,
  incidentId: string,
  useSimulation: boolean,
  username: string = 'local-engineer',
  maxRetries: number = 3,
  retryBaseDelayMs: number = 500
): Promise<ChatOpsResult> {
  const mode = useSimulation ? 'simulation' : 'real';
  const shortId = incidentId.slice(0, 8);
  console.log(`[ChatOps] MODE: ${mode}`);
  console.log(`[ChatOps] ACTION: ${action} on ${shortId} by ${username}`);

  if (useSimulation) {
    return callChatOpsEndpoint(incidentId, action, username);
  }

  return withRetry(
    () => callChatOpsEndpoint(incidentId, action, username),
    maxRetries,
    retryBaseDelayMs,
    `${action}(${shortId})`
  );
}

// ═══════════════════════════════════════════════════════════════
// ChatOps Activity Logs
// ═══════════════════════════════════════════════════════════════

export async function fetchChatOpsLogs(incident_id?: string): Promise<ChatOpsLogEntry[]> {
  const url = incident_id
    ? `${API_BASE}/chatops/logs?incident_id=${incident_id}`
    : `${API_BASE}/chatops/logs`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}