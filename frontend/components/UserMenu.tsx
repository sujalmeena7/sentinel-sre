'use client';

import { useState, useRef, useEffect } from 'react';
import {   m as motion , AnimatePresence  } from 'framer-motion';
import { LogOut, KeyRound, Copy, Check, ChevronDown, User as UserIcon, Loader2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function UserMenu() {
  const { user, logout, rotateWebhookToken, webhookToken, clearWebhookToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) return null;

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      await rotateWebhookToken();
      setShowTokenModal(true);
      setOpen(false);
    } catch (err: any) {
      setRotateError(err?.message || 'Failed to rotate token');
    } finally {
      setRotating(false);
    }
  };

  const handleCopy = async () => {
    if (!webhookToken) return;
    await navigator.clipboard.writeText(webhookToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeTokenModal = () => {
    clearWebhookToken();
    setShowTokenModal(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu-trigger"
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-[11px] font-semibold text-white">
          {initials}
        </div>
        <span className="text-xs text-white/80 font-medium max-w-[140px] truncate" data-testid="user-menu-email">{user.email}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 rounded-xl bg-[#0b0b0f] border border-white/10 shadow-2xl overflow-hidden z-50"
            data-testid="user-menu-dropdown"
          >
            <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{user.name || user.email}</div>
                  <div className="text-[11px] text-white/50 truncate">{user.email}</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.15em] text-white/30">Role · {user.role}</div>
            </div>

            <div className="p-1.5">
              <button
                onClick={handleRotate}
                disabled={rotating}
                data-testid="rotate-webhook-button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />}
                <span className="flex-1">Rotate webhook token</span>
                <KeyRound className="w-3 h-3 text-white/30" />
              </button>
              {rotateError && <div className="px-3 py-1 text-xs text-rose-400">{rotateError}</div>}

              <button
                onClick={() => { setOpen(false); logout(); }}
                data-testid="logout-button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-white/80 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Token reveal modal (after rotate) ── */}
      <AnimatePresence>
        {showTokenModal && webhookToken && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={closeTokenModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-[#0b0b0f] p-6 shadow-2xl"
              data-testid="token-reveal-modal"
            >
              <button
                onClick={closeTokenModal}
                className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-emerald-300" />
                </div>
                <h3 className="text-base font-semibold text-white">New webhook token</h3>
              </div>
              <p className="text-xs text-white/55 leading-relaxed mb-4">
                This replaces your previous token. The old one stops working immediately. We only store a hash — save this copy now.
              </p>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-emerald-200 break-all">
                  {webhookToken}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-white"
                >
                  {copied ? <><Check className="w-3.5 h-3.5 text-emerald-300" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
              <button
                onClick={closeTokenModal}
                className="mt-5 w-full px-4 py-2 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90"
              >
                I&apos;ve saved it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
