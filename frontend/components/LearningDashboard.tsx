'use client';

import { motion } from 'framer-motion';
import { BookOpen, TrendingUp, CheckCircle2, ShieldAlert, Award, Server } from 'lucide-react';
import { Incident } from '@/lib/api';

interface LearningDashboardProps {
  incidents: Incident[];
}

export default function LearningDashboard({ incidents }: LearningDashboardProps) {
  const resolvedIncidents = incidents.filter(i => i.resolved_time);
  const incidentsWithFixes = incidents.filter(i => i.fixes_applied && i.fixes_applied.length > 0);
  
  // Aggregate top fixes
  const fixesMap: Record<string, number> = {};
  incidentsWithFixes.forEach(inc => {
    inc.fixes_applied.forEach(fix => {
      const isDict = typeof fix === 'object' && fix !== null;
      const actionText = isDict ? (fix as any).action : String(fix);
      fixesMap[actionText] = (fixesMap[actionText] || 0) + 1;
    });
  });
  
  const topFixes = Object.entries(fixesMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const mttrMinutes = resolvedIncidents.length > 0 
    ? Math.round(resolvedIncidents.reduce((acc, inc) => {
        const start = new Date(inc.start_time).getTime();
        const end = new Date(inc.resolved_time!).getTime();
        return acc + (end - start) / 60000;
      }, 0) / resolvedIncidents.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center">
          <BookOpen size={20} className="text-accent-blue" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-100">Learning Dashboard</h2>
          <p className="text-sm text-slate-500">Insights extracted from historical incidents & ChatOps resolutions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Metrics */}
        <div className="glass p-6 rounded-xl border border-accent-blue/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 font-medium">Avg MTTR</span>
            <TrendingUp size={16} className="text-accent-emerald" />
          </div>
          <div className="text-3xl font-bold text-slate-100">{mttrMinutes} <span className="text-base font-normal text-slate-500">mins</span></div>
          <p className="text-xs text-slate-500 mt-2">Across {resolvedIncidents.length} resolved incidents</p>
        </div>

        <div className="glass p-6 rounded-xl border border-accent-purple/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 font-medium">Runbooks Triggered</span>
            <Server size={16} className="text-accent-purple" />
          </div>
          <div className="text-3xl font-bold text-slate-100">{incidentsWithFixes.length}</div>
          <p className="text-xs text-slate-500 mt-2">Incidents resolved via ChatOps</p>
        </div>

        <div className="glass p-6 rounded-xl border border-accent-amber/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 font-medium">Human Feedback</span>
            <Award size={16} className="text-accent-amber" />
          </div>
          <div className="text-3xl font-bold text-slate-100">
            {incidents.filter(i => (i as any).human_feedback_score).length}
          </div>
          <p className="text-xs text-slate-500 mt-2">RLHF events logged to Engine</p>
        </div>
      </div>

      {/* Top Actions Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-accent-emerald" />
            Most Effective Mitigations
          </h3>
          {topFixes.length === 0 ? (
            <p className="text-sm text-slate-500">No mitigation data collected yet.</p>
          ) : (
            <div className="space-y-4">
              {topFixes.map(([action, count], i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-200 font-medium">{action}</span>
                    <span className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded-full">{count} uses</span>
                  </div>
                  <div className="w-full bg-surface-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-accent-blue h-full" 
                      style={{ width: `${(count / topFixes[0][1]) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Insights */}
        <div className="glass p-6 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <ShieldAlert size={16} className="text-accent-rose" />
            System Insights
          </h3>
          <div className="space-y-3">
            {incidentsWithFixes.slice(0, 3).map((inc, i) => (
              <div key={i} className="bg-surface-100 p-3 rounded-lg border border-white/[0.04]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-accent-cyan">{inc.service}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{new Date(inc.start_time).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-300 mb-2">{inc.root_cause || inc.symptoms[0]}</p>
                <div className="flex flex-wrap gap-1">
                  {inc.fixes_applied.map((fix: any, j) => (
                    <span key={j} className="text-[10px] bg-accent-emerald/10 text-accent-emerald px-2 py-0.5 rounded">
                      {typeof fix === 'object' ? fix.action : String(fix)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {incidentsWithFixes.length === 0 && (
              <p className="text-sm text-slate-500">Runbooks must be executed to generate insights.</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
