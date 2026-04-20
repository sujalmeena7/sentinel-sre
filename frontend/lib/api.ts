const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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
  predicted_cause?: string | null; // Adding this to help with timeline logic
  runbook_refs: string[];
}

export interface AnalysisResult {
  similar_historic_incidents: string[];
  investigation_report: string;
  hypotheses: any[];
  reasoning_chain: string[];
  analysis_breakdown?: { [key: string]: string };
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(`${API_BASE}/incidents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch incidents');
  return res.json();
}

export async function analyzeIncident(
  incident_id: string,
  symptoms: string[],
  signals: { [key: string]: string }[]
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/incidents/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incident_id, symptoms, signals }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analysis failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

export async function submitFeedback(incident_id: string, score: number, comment?: string) {
  const res = await fetch(`${API_BASE}/incidents/feedback`, {
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
  const res = await fetch(`${API_BASE}/incidents/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(incident),
  });
  if (!res.ok) throw new Error('Ingestion failed');
  return res.json();
}

export async function triggerSimulation(service: string, failure_type: string, severity: string) {
  const res = await fetch(`${API_BASE}/simulation/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, failure_type, severity }),
  });
  if (!res.ok) throw new Error('Failed to trigger simulation');
  return res.json();
}

export async function fetchEvaluation() {
  const res = await fetch(`${API_BASE}/evaluation`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch evaluation metrics');
  return res.json();
}

export async function generatePostmortem(incident_id: string): Promise<{ postmortem: string }> {
  const res = await fetch(`${API_BASE}/incidents/${incident_id}/postmortem`, {
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
  const res = await fetch(`${API_BASE}/incidents/${incident_id}/dispatch`, {
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
  const res = await fetch(`${API_BASE}/slack/simulate`, {
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

/**
 * Unified ChatOps action handler.
 *
 * - Simulation mode: direct call, no retries
 * - Real Slack mode: retries with exponential backoff
 *
 * Logs mode + action to console for debugging.
 */
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

  // Real Slack mode — retry with exponential backoff
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

