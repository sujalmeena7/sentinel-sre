'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string | null;
}

interface AuthState {
  // `undefined` = still checking localStorage on first mount.
  // `null`      = definitively unauthenticated.
  user: AuthUser | null | undefined;
  token: string | null;
  // Raw webhook token — persisted in localStorage so the TelemetryPanel
  // can always show the correct URL. Displayed once after register/rotate.
  webhookToken: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  rotateWebhookToken: () => Promise<string>;
  clearWebhookToken: () => void;
}

const STORAGE_TOKEN_KEY = 'sentinel_jwt';
const STORAGE_USER_KEY = 'sentinel_user';
const STORAGE_WEBHOOK_KEY = 'sentinel_webhook_token';

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────
const AuthCtx = createContext<AuthState | null>(null);

// Same resolution as in lib/api.ts — import would create a cycle.
const RAW_BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim().replace(/\/+$/, '');
const API_BASE = RAW_BACKEND_URL ? `${RAW_BACKEND_URL}/api/v1` : '/api/v1';

function formatApiError(detail: any, fallback = 'Something went wrong'): string {
  if (detail == null) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  }
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  // ── Hydrate from localStorage on first mount ──
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const storedUser = localStorage.getItem(STORAGE_USER_KEY);
      const storedWebhook = localStorage.getItem(STORAGE_WEBHOOK_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as AuthUser);
        if (storedWebhook) setWebhookToken(storedWebhook);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const persistSession = useCallback((jwt: string, u: AuthUser) => {
    setToken(jwt);
    setUser(u);
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, jwt);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(u));
    } catch { /* no-op */ }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setWebhookToken(null);
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_WEBHOOK_KEY);
    } catch { /* no-op */ }
    router.push('/login');
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatApiError(data?.detail, 'Login failed'));
    persistSession(data.access_token, data.user);
  }, [persistSession]);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatApiError(data?.detail, 'Registration failed'));
    persistSession(data.access_token, data.user);
    if (data.webhook_token) {
      setWebhookToken(data.webhook_token);
      try { localStorage.setItem(STORAGE_WEBHOOK_KEY, data.webhook_token); } catch {}
    }
  }, [persistSession]);

  const rotateWebhookToken = useCallback(async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/auth/rotate-webhook-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatApiError(data?.detail, 'Could not rotate token'));
    // Refresh the stored JWT (backend issues a new one defensively)
    if (data.access_token && data.user) persistSession(data.access_token, data.user);
    if (data.webhook_token) {
      setWebhookToken(data.webhook_token);
      try { localStorage.setItem(STORAGE_WEBHOOK_KEY, data.webhook_token); } catch {}
    }
    return data.webhook_token;
  }, [persistSession, token]);

  const clearWebhookToken = useCallback(() => setWebhookToken(null), []);

  return (
    <AuthCtx.Provider value={{ user, token, webhookToken, login, register, logout, rotateWebhookToken, clearWebhookToken }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/**
 * Returns the current JWT from localStorage — used by lib/api.ts to
 * inject the Bearer header without having to be inside React.
 */
export function readAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Wipes session and redirects to /login. Called by lib/api.ts on 401.
 */
export function forceLogoutOn401(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  } catch { /* no-op */ }
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}
