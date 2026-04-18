import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Play, Activity, Database, Server } from 'lucide-react';
import { triggerSimulation } from '@/lib/api';

interface ChaosPanelProps {
  onSimulationTriggered: () => void;
}

const SERVICES = [
  'user-gateway',
  'checkout-ui',
  'payment-api',
  'inventory-service',
  'database-cluster'
];

const FAILURE_TYPES = [
  'Memory leak (OOM Kill)',
  'CPU spike',
  'DB connection failure',
  'Latency spike'
];

const SEVERITIES = ['mild', 'moderate', 'severe'];

export default function ChaosPanel({ onSimulationTriggered }: ChaosPanelProps) {
  const [service, setService] = useState(SERVICES[0]);
  const [failureType, setFailureType] = useState(FAILURE_TYPES[0]);
  const [severity, setSeverity] = useState('moderate');
  const [isInjecting, setIsInjecting] = useState(false);

  const handleTrigger = async (preset?: { service: string; failure: string; severity: string }) => {
    setIsInjecting(true);
    try {
      const payload = preset || { service, failure: failureType, severity };
      await triggerSimulation(payload.service, payload.failure, payload.severity);
      // Wait a tiny bit for the ingestion background task to execute
      setTimeout(() => {
        onSimulationTriggered();
        setIsInjecting(false);
      }, 500);
    } catch (e) {
      console.error(e);
      setIsInjecting(false);
    }
  };

  return (
    <div className="bg-surface-100 border border-accent-purple/20 rounded-2xl p-6 relative overflow-hidden group hover:border-accent-purple/40 transition-colors">
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent-purple/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-rose/20 flex items-center justify-center border border-accent-purple/20">
          <Zap size={20} className="text-accent-purple" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            Chaos Simulator
            <span className="text-[10px] uppercase tracking-wider bg-accent-rose/10 text-accent-rose px-2 py-0.5 rounded-full border border-accent-rose/20">Live</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">Inject deterministic anomalies into the cluster.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Manual Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Service</label>
            <select 
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full bg-surface-200 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent-purple/50"
            >
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Failure Type</label>
            <select 
              value={failureType}
              onChange={(e) => setFailureType(e.target.value)}
              className="w-full bg-surface-200 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent-purple/50"
            >
              {FAILURE_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Severity</label>
            <select 
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full bg-surface-200 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent-purple/50"
            >
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={() => handleTrigger()}
          disabled={isInjecting}
          className="w-full py-2.5 rounded-lg bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/30 text-accent-purple font-medium text-sm transition-all flex items-center justify-center gap-2"
        >
          {isInjecting ? <Activity size={16} className="animate-spin" /> : <Play size={16} />}
          Inject Custom Chaos
        </button>

        {/* Presets */}
        <div className="pt-4 border-t border-white/5">
          <label className="block text-xs font-medium text-slate-400 mb-2">Scenario Presets</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => handleTrigger({ service: 'checkout-ui', failure: 'Memory leak (OOM Kill)', severity: 'moderate' })}
              disabled={isInjecting}
              className="px-3 py-2 rounded-lg bg-surface-200/50 hover:bg-surface-200 border border-white/5 text-xs text-slate-300 text-left transition-colors flex flex-col gap-1"
            >
              <span className="font-semibold text-slate-200">Memory Leak in Cache</span>
              <span className="text-[10px] text-slate-500">checkout-ui • OOM Kill</span>
            </button>
            <button
              onClick={() => handleTrigger({ service: 'database-cluster', failure: 'DB connection failure', severity: 'severe' })}
              disabled={isInjecting}
              className="px-3 py-2 rounded-lg bg-surface-200/50 hover:bg-surface-200 border border-white/5 text-xs text-slate-300 text-left transition-colors flex flex-col gap-1"
            >
              <span className="font-semibold text-slate-200">DB Conn Exhaustion</span>
              <span className="text-[10px] text-slate-500">database-cluster • Pool Limits</span>
            </button>
            <button
              onClick={() => handleTrigger({ service: 'user-gateway', failure: 'CPU spike', severity: 'moderate' })}
              disabled={isInjecting}
              className="px-3 py-2 rounded-lg bg-surface-200/50 hover:bg-surface-200 border border-white/5 text-xs text-slate-300 text-left transition-colors flex flex-col gap-1"
            >
              <span className="font-semibold text-slate-200">Traffic Spike</span>
              <span className="text-[10px] text-slate-500">user-gateway • CPU Saturation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
