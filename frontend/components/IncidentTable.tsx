'use client';

import {   m as motion   } from 'framer-motion';
import { AlertCircle, Server, Clock, ChevronRight, Flame } from 'lucide-react';
import { Incident } from '@/lib/api';

interface IncidentTableProps {
  incidents: Incident[];
  onSelect: (incident: Incident) => void;
  selectedId?: string;
}

function getSeverity(incident: Incident) {
  const syms = incident.symptoms.map((s) => s.toLowerCase());
  if (syms.some((s) => s.includes('oom') || s.includes('ssl') || s.includes('5xx')))
    return 'critical';
  if (syms.some((s) => s.includes('latency') || s.includes('slow')))
    return 'warning';
  return 'resolved';
}

function timeAgo(dateStr: string) {
  // SQLite strips timezone info, so FastAPI sends naive strings. We force UTC parsing with 'Z'.
  const utcStr = dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
  const diff = Math.max(0, Date.now() - new Date(utcStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IncidentTable({ incidents, onSelect, selectedId }: IncidentTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="glass rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
            <Flame size={16} className="text-accent-cyan" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Incident Feed</h3>
            <p className="text-xs text-slate-500">{incidents.length} incidents tracked</p>
          </div>
        </div>
        <span className="badge-info">
          <span className="dot-pulse bg-accent-cyan" />
          Live
        </span>
      </div>

      {/* Table */}
      <div className="divide-y divide-white/[0.04]">
        {incidents.map((incident, index) => {
          const severity = getSeverity(incident);
          const isSelected = selectedId === incident.id;

          return (
            <motion.button
              key={incident.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              onClick={() => onSelect(incident)}
              className={`w-full text-left px-6 py-4 flex items-center gap-4 transition-all duration-200 hover:bg-white/[0.03] group ${
                isSelected ? 'bg-accent-cyan/[0.05] border-l-2 border-accent-cyan' : 'border-l-2 border-transparent'
              }`}
            >
              {/* Severity indicator */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                severity === 'critical' ? 'bg-accent-rose dot-pulse' :
                severity === 'warning' ? 'bg-accent-amber dot-pulse' :
                'bg-accent-emerald'
              }`} />

              {/* Service icon */}
              <div className="w-9 h-9 rounded-lg bg-surface-200/60 flex items-center justify-center flex-shrink-0">
                <Server size={16} className="text-slate-400" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-200 truncate">
                    {incident.service}
                  </span>
                  <span className={`${
                    severity === 'critical' ? 'badge-critical' :
                    severity === 'warning' ? 'badge-warning' :
                    'badge-resolved'
                  }`}>
                    {severity}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <AlertCircle size={11} />
                    {incident.symptoms[0]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {timeAgo(incident.start_time)}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <ChevronRight
                size={16}
                className="text-slate-600 group-hover:text-accent-cyan transition-colors flex-shrink-0"
              />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
