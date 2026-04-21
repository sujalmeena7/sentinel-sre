'use client';

import {   m as motion   } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { Incident } from '@/lib/api';

interface StatsCardsProps {
  incidents: Incident[];
}

export default function StatsCards({ incidents }: StatsCardsProps) {
  const total = incidents.length;
  const resolved = incidents.filter((i) => i.resolved_time).length;
  const critical = incidents.filter((i) =>
    i.symptoms.some((s) => s.toLowerCase().includes('oom') || s.toLowerCase().includes('ssl'))
  ).length;

  // Calculate average resolution time in minutes
  const avgResolution = incidents
    .filter((i) => i.start_time && i.resolved_time)
    .reduce((acc, i) => {
      const start = new Date(i.start_time).getTime();
      const end = new Date(i.resolved_time!).getTime();
      return acc + (end - start) / 60000;
    }, 0) / (resolved || 1);

  const cards = [
    {
      label: 'Total Incidents',
      value: total,
      icon: Activity,
      color: 'cyan',
      glow: 'shadow-glow-cyan',
      borderColor: 'border-accent-cyan/20',
      iconBg: 'bg-accent-cyan/10',
      iconColor: 'text-accent-cyan',
    },
    {
      label: 'Critical',
      value: critical,
      icon: AlertTriangle,
      color: 'rose',
      glow: 'shadow-glow-rose',
      borderColor: 'border-accent-rose/20',
      iconBg: 'bg-accent-rose/10',
      iconColor: 'text-accent-rose',
    },
    {
      label: 'Resolved',
      value: resolved,
      icon: CheckCircle2,
      color: 'emerald',
      glow: 'shadow-glow-emerald',
      borderColor: 'border-accent-emerald/20',
      iconBg: 'bg-accent-emerald/10',
      iconColor: 'text-accent-emerald',
    },
    {
      label: 'Avg MTTR',
      value: `${Math.round(avgResolution)}m`,
      icon: Clock,
      color: 'amber',
      glow: 'shadow-glow-amber',
      borderColor: 'border-accent-amber/20',
      iconBg: 'bg-accent-amber/10',
      iconColor: 'text-accent-amber',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.5 }}
          className={`glass-hover rounded-xl p-5 ${card.glow} card-glow group cursor-default`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-400 font-medium">{card.label}</span>
            <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
              <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} size={18} />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight">{card.value}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <Zap size={12} className={card.iconColor} />
            <span className="text-xs text-slate-500">Live tracking</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
