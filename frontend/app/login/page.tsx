'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {   m as motion   } from 'framer-motion';
import { Shield, Loader2, AlertCircle, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-black text-white">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 grid-bg radial-fade" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse-slow" />
      <div className="pointer-events-none absolute top-32 left-10 w-72 h-72 rounded-full bg-purple-600/20 blur-[100px] animate-blob" />
      <div className="pointer-events-none absolute bottom-10 right-10 w-72 h-72 rounded-full bg-cyan-500/10 blur-[100px] animate-blob" style={{ animationDelay: '4s' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong glow-border rounded-2xl p-8 shadow-[0_40px_100px_-30px_rgba(99,102,241,0.4)]">
          <Link href="/" className="flex items-center gap-2 mb-8 group w-fit">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">Sentinel-SRE</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
          <p className="mt-1.5 text-sm text-white/50">Sign in to your Incident Command Center.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" data-testid="login-form">
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
                  data-testid="login-email-input"
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
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="login-password-input"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:bg-white/[0.07] outline-none text-sm text-white placeholder:text-white/25 transition-colors"
                />
              </div>
            </label>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                data-testid="login-error"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="group relative w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.15)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/50">
            New to Sentinel-SRE?{' '}
            <Link href="/register" className="text-white hover:text-white/80 underline underline-offset-4" data-testid="login-register-link">
              Create an account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
