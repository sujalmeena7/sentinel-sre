'use client';

import { motion } from 'framer-motion';
import {
  Clock, AlertTriangle, Zap, CheckCircle2, Server,
  GitBranch, FileText, ExternalLink, Tag
} from 'lucide-react';
import { Incident } from '@/lib/api';

interface IncidentDetailProps {
  incident: Incident;
}

export default function IncidentDetail({ incident }: IncidentDetailProps) {
  const startTime = new Date(incident.start_time);
  const peakTime = incident.peak_time ? new Date(incident.peak_time) : null;
  const resolvedTime = incident.resolved_time ? new Date(incident.resolved_time) : null;

  const durationMins = resolvedTime
    ? Math.round((resolvedTime.getTime() - startTime.getTime()) / 60000)
    : null;

  const timelineEvents = [
    { label: 'Incident Started', time: startTime, icon: AlertTriangle, color: 'text-accent-rose', dotColor: 'bg-accent-rose' },
    ...(peakTime ? [{ label: 'Peak Impact', time: peakTime, icon: Zap, color: 'text-accent-amber', dotColor: 'bg-accent-amber' }] : []),
    ...(resolvedTime ? [{ label: 'Resolved', time: resolvedTime, icon: CheckCircle2, color: 'text-accent-emerald', dotColor: 'bg-accent-emerald' }] : []),
  ];

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
              {incident.fixes_applied.map((fix, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-accent-emerald">
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{fix}</span>
                </div>
              ))}
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
    </motion.div>
  );
}
