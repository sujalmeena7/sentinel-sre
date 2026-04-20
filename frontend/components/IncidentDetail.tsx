'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, AlertTriangle, Zap, CheckCircle2, Server,
  GitBranch, FileText, ExternalLink, Tag, Brain,
  Play, UserCheck, ShieldCheck, Loader2, Activity
} from 'lucide-react';
import { Incident, handleChatOpsAction, fetchChatOpsLogs, ChatOpsActionType, ChatOpsLogEntry } from '@/lib/api';
import { CHATOPS_CONFIG } from '@/lib/chatops-config';

interface IncidentDetailProps {
  incident: Incident;
}

export default function IncidentDetail({ incident }: IncidentDetailProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activityLogs, setActivityLogs] = useState<ChatOpsLogEntry[]>([]);

  // Fetch activity logs for this incident
  useEffect(() => {
    fetchChatOpsLogs(incident.id).then(setActivityLogs).catch(() => {});
  }, [incident.id, actionLoading]); // refresh after each action completes

  const handleAction = async (action: ChatOpsActionType) => {
    setActionLoading(action);
    setActionResult(null);
    try {
      const result = await handleChatOpsAction(
        action,
        incident.id,
        CHATOPS_CONFIG.USE_SIMULATION,
        CHATOPS_CONFIG.SIMULATION_USERNAME,
        CHATOPS_CONFIG.MAX_RETRIES,
        CHATOPS_CONFIG.RETRY_BASE_DELAY_MS
      );
      setActionResult({ type: 'success', message: result.message });
      setTimeout(() => setActionResult(null), 5000);
    } catch (err: any) {
      setActionResult({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const startTime = new Date(incident.start_time);
  const peakTime = incident.peak_time ? new Date(incident.peak_time) : null;
  const resolvedTime = incident.resolved_time ? new Date(incident.resolved_time) : null;

  const durationMins = resolvedTime
    ? Math.round((resolvedTime.getTime() - startTime.getTime()) / 60000)
    : null;

  const timelineEvents: { label: string; time: Date; color: string; dotColor: string }[] = [];

  // Incident Created
  timelineEvents.push({
    label: 'Incident Created',
    time: startTime,
    color: 'text-accent-rose',
    dotColor: 'bg-accent-rose'
  });

  // AI Analysis Generated
  if (incident.predicted_cause || incident.root_cause || incident.human_feedback_score !== null) {
    timelineEvents.push({
      label: 'AI Analysis Generated',
      time: new Date(startTime.getTime() + 5000),
      color: 'text-accent-purple',
      dotColor: 'bg-accent-purple'
    });
    
    // Slack Alert Sent (heuristic based on dispatch right after analysis)
    timelineEvents.push({
      label: '🔔 Slack Alert Sent',
      time: new Date(startTime.getTime() + 7000),
      color: 'text-slate-300',
      dotColor: 'bg-slate-400'
    });
  }

  if (incident.acknowledged_by) {
    timelineEvents.push({
      label: `👤 Acknowledged by @${incident.acknowledged_by}`,
      // For MVP without explicit timestamp we approximate it 
      time: new Date(startTime.getTime() + 15000),
      color: 'text-accent-cyan',
      dotColor: 'bg-accent-cyan'
    });
  }

  if (incident.fixes_applied && incident.fixes_applied.length > 0) {
    incident.fixes_applied.forEach((fix: any, idx: number) => {
      const isDict = typeof fix === 'object' && fix !== null;
      const actionText = isDict ? fix.action : String(fix);
      const fixTime = isDict && fix.timestamp ? new Date(fix.timestamp) : new Date(startTime.getTime() + 30000 + (idx * 5000));
      
      timelineEvents.push({
        label: `⚙ Runbook Executed: ${actionText}`,
        time: fixTime,
        color: 'text-accent-amber',
        dotColor: 'bg-accent-amber'
      });
    });
  }

  if (resolvedTime) {
    timelineEvents.push({
      label: '✅ Resolved',
      time: resolvedTime,
      color: 'text-accent-emerald',
      dotColor: 'bg-accent-emerald'
    });
  }

  // Sort chronologically just to be absolutely sure
  timelineEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 flex items-center justify-center">
              <Server size={20} className="text-accent-cyan" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{incident.service}</h2>
              <p className="text-xs text-slate-500 font-mono">{incident.id.slice(0, 12)}...</p>
            </div>
          </div>
          <span className="badge-info">{incident.environment}</span>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3">
          {durationMins !== null && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-surface-100 px-3 py-1.5 rounded-lg">
              <Clock size={12} />
              <span>Duration: <strong className="text-slate-200">{durationMins}m</strong></span>
            </div>
          )}
          {incident.changes.map((change, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400 bg-surface-100 px-3 py-1.5 rounded-lg">
              <GitBranch size={12} />
              <span>{change.event}: <strong className="text-accent-purple">{change.version}</strong></span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Clock size={14} className="text-accent-cyan" />
          Incident Timeline
        </h3>
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-accent-rose via-accent-amber to-accent-emerald opacity-30" />

          {timelineEvents.map((event, i) => (
            <motion.div
              key={event.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
              className="relative flex items-start gap-4 mb-5 last:mb-0"
            >
              {/* Dot */}
              <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ${event.dotColor} ring-4 ring-surface/80`} />
              <div>
                <div className={`text-sm font-semibold ${event.color}`}>{event.label}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {event.time.toLocaleString()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Symptoms & Signals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Symptoms */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-amber" />
            Symptoms
          </h3>
          <div className="flex flex-wrap gap-2">
            {incident.symptoms.map((symptom, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="badge-critical"
              >
                <Tag size={10} />
                {symptom}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Signals */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Zap size={14} className="text-accent-cyan" />
            Signals
          </h3>
          <div className="space-y-2">
            {incident.signals.map((signal, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-xs font-mono bg-surface-100 rounded-lg px-3 py-2 text-slate-400"
              >
                {Object.entries(signal).map(([k, v]) => (
                  <span key={k}>
                    <span className="text-accent-cyan">{k}</span>: <span className="text-slate-300">{v}</span>
                  </span>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Root Cause & Fixes */}
      {incident.root_cause && (
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-accent-emerald" />
            Known Root Cause
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">{incident.root_cause}</p>

          {incident.fixes_applied.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Fixes Applied</span>
              {incident.fixes_applied.map((fix: any, i) => {
                const isDict = typeof fix === 'object' && fix !== null;
                const actionText = isDict ? fix.action : String(fix);
                const descText = isDict ? fix.description : '';
                return (
                  <div key={i} className="flex items-start gap-2 text-sm text-accent-emerald bg-surface-100 p-2 rounded-lg border border-white/[0.04]">
                    <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="block font-medium font-mono">{actionText}</span>
                      {descText && <span className="block text-xs text-slate-400 mt-1">{descText}</span>}
                      {isDict && fix.source && (
                        <span className="block text-xs text-accent-cyan mt-1 opacity-80">Triggered via {fix.source}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {incident.runbook_refs.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              {incident.runbook_refs.map((ref, i) => (
                <a
                  key={i}
                  href={ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-accent-blue hover:text-accent-cyan transition-colors"
                >
                  <FileText size={12} />
                  <span className="underline underline-offset-2">{ref}</span>
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ChatOps Actions */}
      <div className="glass rounded-xl p-5 border border-accent-cyan/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Play size={14} className="text-accent-cyan" />
            ChatOps Actions
          </h3>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            CHATOPS_CONFIG.USE_SIMULATION
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {CHATOPS_CONFIG.USE_SIMULATION ? 'Simulation' : 'Live Slack'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleAction('acknowledge')}
            disabled={!!actionLoading || !!incident.acknowledged_by}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-40
              bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/40"
          >
            {actionLoading === 'acknowledge' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
            {incident.acknowledged_by ? `Ack'd by ${incident.acknowledged_by}` : 'Acknowledge'}
          </button>
          <button
            onClick={() => handleAction('execute_runbook')}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-40
              bg-accent-cyan/10 border-accent-cyan/20 text-cyan-300 hover:bg-accent-cyan/20 hover:border-accent-cyan/40"
          >
            {actionLoading === 'execute_runbook' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Execute Runbook
          </button>
          <button
            onClick={() => handleAction('resolve')}
            disabled={!!actionLoading || !!incident.resolved_time}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-40
              bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/40"
          >
            {actionLoading === 'resolve' ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
            {incident.resolved_time ? 'Resolved' : 'Resolve'}
          </button>
        </div>
        {actionResult && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                actionResult.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              {actionResult.type === 'error' ? '⚠ ' : '✓ '}{actionResult.message}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Activity Log */}
        {activityLogs.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
              <Activity size={10} />
              Activity Log
            </h4>
            <div className="space-y-1">
              {activityLogs.slice(0, 10).map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    log.mode === 'simulation' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <span className="text-slate-400 font-medium">{log.action.replace('_', ' ')}</span>
                  <span className="text-slate-600">by</span>
                  <span className="text-accent-cyan">@{log.user}</span>
                  <span className="ml-auto text-slate-600 font-mono text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
