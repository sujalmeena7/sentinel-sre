/**
 * ChatOps Configuration — Production-Ready
 *
 * Mode is determined automatically:
 *   - development → simulation (no Slack/ngrok needed)
 *   - production  → real Slack integration
 *
 * Override via NEXT_PUBLIC_USE_SIMULATION env var if needed.
 */

function resolveMode(): boolean {
  // Explicit env override always wins
  const envOverride = process.env.NEXT_PUBLIC_USE_SIMULATION;
  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;

  // Auto-detect based on environment
  return process.env.NODE_ENV === 'development';
}

export const CHATOPS_CONFIG = {
  /** Resolved mode: true = simulation, false = real Slack */
  USE_SIMULATION: resolveMode(),

  /** Username for simulated/local actions */
  SIMULATION_USERNAME: process.env.NEXT_PUBLIC_SIMULATION_USERNAME || 'local-engineer',

  /** Max retries for real Slack mode (simulation never retries) */
  MAX_RETRIES: 3,

  /** Base delay for exponential backoff (ms) */
  RETRY_BASE_DELAY_MS: 500,
} as const;
