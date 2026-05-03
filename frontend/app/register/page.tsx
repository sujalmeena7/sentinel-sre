'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {   m as motion   } from 'framer-motion';
import { Shield, Loader2, AlertCircle, Mail, Lock, User, ArrowRight, Copy, Check, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const { register, webhookToken, clearWebhookToken, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim() || undefined);
      // Success — the webhookToken is now in context and we stay on this page
      // to show it to the user exactly once before routing them to the dashboard.
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!webhookToken) return;
    await navigator.clipboard.writeText(webhookToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const continueToDashboard = () => {
    clearWebhookToken();
    router.push('/dashboard');
  };

  // ─── Success state: display webhook token exactly once ───
  if (user && webhookToken) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-black text-white">
        <div className="pointer-events-none absolute inset-0 grid-bg radial-fade" />
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-emerald-500/15 blur-[120px] animate-pulse-slow" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-lg"
        >
          <div className="glass-strong glow-border rounded-2xl p-8 shadow-[0_40px_100px_-30px_rgba(16,185,129,0.3)]" data-testid="register-success-panel">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold tracking-tight">Your tenant is ready</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-white">Save your webhook token</h1>
            <p className="mt-1.5 text-sm text-white/55">
              This is your <strong className="text-white">private Prometheus / Alertmanager ingestion token</strong>. It&apos;s shown <em>once</em> and stored on our side only as a hash — we can&apos;t recover it later.
            </p>

            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.15em] text-emerald-300/80 mb-2">Webhook token</div>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-emerald-200 break-all" data-testid="webhook-token-value">
                  {webhookToken}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  data-testid="copy-webhook-token-button"
                  className="inline-flex items-center gap-1.5 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-white transition-colors"
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-300" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs text-white/55 leading-relaxed">
              <div className="font-semibold text-white/80 mb-1">Point Alertmanager at:</div>
              <code className="block font-mono text-white/70 break-all">
                POST &lt;backend&gt;/api/v1/telemetry/prometheus/{webhookToken.slice(0, 8)}…
              </code>
              <div className="mt-2">You can always rotate this token from the user menu.</div>
            </div>

            <button
              onClick={continueToDashboard}
              data-testid="continue-to-dashboard-button"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all"
            >
              Continue to dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Form state ───
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 grid-bg radial-fade" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse-slow" />
      <div className="pointer-events-none absolute top-32 left-10 w-72 h-72 rounded-full bg-purple-600/20 blur-[100px] animate-blob" />
      <div className="pointer-events-none absolute bottom-10 right-10 w-72 h-72 rounded-full bg-pink-500/10 blur-[100px] animate-blob" style={{ animationDelay: '4s' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong glow-border rounded-2xl p-8 shadow-[0_40px_100px_-30px_rgba(168,85,247,0.4)]">
          <Link href="/" className="flex items-center gap-2 mb-8 group w-fit">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">Sentinel-SRE</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-white">Create your workspace</h1>
          <p className="mt-1.5 text-sm text-white/50">Isolated tenant · your own RAG memory · your own webhook.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" data-testid="register-form">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.15em] text-white/40 mb-2">Name (optional)</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  data-testid="register-name-input"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:bg-white/[0.07] outline-none text-sm text-white placeholder:text-white/25 transition-colors"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.15em] text-white/40 mb-2">Email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  data-testid="register-email-input"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:bg-white/[0.07] outline-none text-sm text-white placeholder:text-white/25 transition-colors"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.15em] text-white/40 mb-2">Password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  data-testid="register-password-input"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:bg-white/[0.07] outline-none text-sm text-white placeholder:text-white/25 transition-colors"
                />
              </div>
            </label>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                data-testid="register-error"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              data-testid="register-submit-button"
              className="group relative w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.15)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create account <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/50">
            Already have an account?{' '}
            <Link href="/login" className="text-white hover:text-white/80 underline underline-offset-4" data-testid="register-login-link">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
