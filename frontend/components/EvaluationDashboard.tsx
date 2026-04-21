import React, { useEffect, useState } from 'react';
import {   m as motion , AnimatePresence  } from 'framer-motion';
import { fetchEvaluation } from '@/lib/api';
import { BrainCircuit, CheckCircle2, XCircle, Activity, Server, Target } from 'lucide-react';

interface EvalResult {
  service: string;
  expected: string;
  predicted: string;
  is_correct: boolean;
}

interface EvalData {
  total_tests: number;
  correct_predictions: number;
  accuracy: number;
  results: EvalResult[];
}

export default function EvaluationDashboard() {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll quietly every 3 seconds to keep UI in sync without hard reloads
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchEvaluation();
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-surface-100 border border-white/5 rounded-2xl p-6 flex justify-center py-10">
        <Activity className="animate-spin text-accent-cyan" size={24} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-surface-100 border border-white/5 rounded-2xl overflow-hidden group">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/20 flex items-center justify-center border border-white/10">
            <BrainCircuit size={18} className="text-accent-cyan" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              AI Evaluation Dashboard
            </h3>
            <p className="text-xs text-slate-500">Continuous accuracy tracking for Hybrid Engine</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Stats */}
        <div className="w-full md:w-1/3 space-y-3">
          <div className="glass rounded-xl p-4 border border-accent-cyan/20 flex items-center justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-accent-cyan/10 blur-xl pointer-events-none" />
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase">Overall Accuracy</p>
              <h2 className={`text-3xl font-black mt-1 ${data.accuracy >= 80 ? 'text-accent-emerald' : data.accuracy >= 50 ? 'text-accent-amber' : 'text-accent-rose'}`}>
                {data.accuracy}%
              </h2>
            </div>
            <Target size={32} className="text-accent-cyan/50" />
          </div>
          
          <div className="flex gap-3">
            <div className="glass rounded-xl p-4 border border-white/[0.04] flex-1">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Total Tests</p>
              <p className="text-xl font-bold text-slate-200">{data.total_tests}</p>
            </div>
            <div className="glass rounded-xl p-4 border border-white/[0.04] flex-1">
              <p className="text-[10px] text-slate-500 font-semibold uppercase">Correct</p>
              <p className="text-xl font-bold text-accent-emerald">{data.correct_predictions}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Feed */}
        <div className="w-full md:w-2/3 border border-white/[0.04] rounded-xl overflow-hidden bg-surface-200/30 flex flex-col">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-white/[0.04] text-[10px] uppercase font-bold text-slate-500 bg-surface-200">
            <div className="col-span-3">Service</div>
            <div className="col-span-4">Expected (Chaos)</div>
            <div className="col-span-4">Predicted (AI)</div>
            <div className="col-span-1 text-right">Result</div>
          </div>
          
          <div className="overflow-y-auto max-h-[160px] divide-y divide-white/[0.02]">
            <AnimatePresence>
              {data.results.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-slate-500 italic">No evaluated incidents yet. Inject chaos and click 'Run Analysis'.</div>
              )}
              {data.results.map((row, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  key={i}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-xs hover:bg-white/[0.02] transition-colors"
                >
                  <div className="col-span-3 flex items-center gap-2 text-slate-300 font-medium truncate">
                    <Server size={12} className="text-slate-500 flex-shrink-0" />
                    <span className="truncate">{row.service}</span>
                  </div>
                  <div className="col-span-4 text-slate-400 font-mono truncate">{row.expected}</div>
                  <div className="col-span-4 text-slate-300 font-mono truncate">{row.predicted}</div>
                  <div className="col-span-1 flex justify-end">
                    {row.is_correct 
                      ? <CheckCircle2 size={16} className="text-accent-emerald" /> 
                      : <XCircle size={16} className="text-accent-rose" />
                    }
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
