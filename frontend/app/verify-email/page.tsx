'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { Shield, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Status = 'pending' | 'verifying' | 'success' | 'error';

function VerifyEmailInner() {
  const { verifyEmail } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [message, setMessage] = useState<string>(
    token ? 'Confirming your email…' : 'Missing verification token in the URL.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await verifyEmail(token);
        if (cancelled) return;
        setStatus('success');
        setMessage('Your email is verified. Redirecting to sign in…');
        setTimeout(() => router.push('/login'), 2200);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err?.message || 'Verification failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail, router]);

  const Icon =
    status === 'success' ? CheckCircle2 : status === 'error' ? AlertCircle : Loader2;
  const iconClass =
    status === 'success'
      ? 'text-emerald-400'
      : status === 'error'
      ? 'text-rose-400'
      : 'text-orange-400 animate-spin';

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 grid-bg radial-fade" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-orange-600/15 blur-[120px] animate-pulse-slow" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong glow-border rounded-2xl p-8 text-center">
          <Link href="/" className="flex items-center justify-center gap-2 mb-8 group w-fit mx-auto">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">Sentinel-SRE</span>
          </Link>

          <div className="flex justify-center mb-4">
            <Icon className={`w-10 h-10 ${iconClass}`} />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {status === 'success'
              ? 'Email verified'
              : status === 'error'
              ? "We couldn't verify your email"
              : 'Verifying your email'}
          </h1>
          <p className="mt-2 text-sm text-white/60">{message}</p>

          {status === 'error' && (
            <div className="mt-6 space-y-3 text-sm">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 font-medium transition-colors"
              >
                Back to sign in
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-white/40">
                Or{' '}
                <Link href="/register" className="text-white/70 underline underline-offset-4 hover:text-white">
                  create a new account
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
