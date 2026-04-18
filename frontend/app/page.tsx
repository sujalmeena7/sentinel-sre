'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Brain, Shield, ArrowLeft,
  Radio, Cpu, RefreshCw, AlertTriangle
} from 'lucide-react';
import { Incident, fetchIncidents } from '@/lib/api';
import StatsCards from '@/components/StatsCards';
import IncidentTable from '@/components/IncidentTable';
import IncidentDetail from '@/components/IncidentDetail';
import AIAnalysisPanel from '@/components/AIAnalysisPanel';
import ChaosPanel from '@/components/ChaosPanel';
import EvaluationDashboard from '@/components/EvaluationDashboard';
import ServiceGraph from '@/components/ServiceGraph';

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIncidents = async () => {
    setError(null);
    try {
      const data = await fetchIncidents();
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents:', err);
      setError('Failed to connect to the backend server. Please verify it is running on the correct port.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadIncidents();
  };

  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 glass border-b border-white/[0.06]">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedIncident && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedIncident(null)}
                className="w-8 h-8 rounded-lg bg-surface-200/60 flex items-center justify-center hover:bg-surface-200 transition-colors mr-1"
              >
                <ArrowLeft size={16} className="text-slate-400" />
              </motion.button>
            )}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center border border-accent-cyan/20">
              <Brain size={18} className="text-accent-cyan" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">
                <span className="gradient-text">RootCause</span>
                <span className="text-slate-400 font-normal ml-1">AI</span>
              </h1>
              <p className="text-[10px] text-slate-600 -mt-0.5 tracking-wider uppercase">
                Intelligent Incident Analyzer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-surface-100/50 hover:bg-surface-200/60 transition-all border border-white/[0.04]"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald dot-pulse" />
                Backend connected
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Target Error Banner */}
      {error && (
        <div className="max-w-[1600px] mx-auto px-6 mt-6">
          <div className="bg-accent-rose/10 border border-accent-rose/20 rounded-xl p-4 flex items-center gap-3 text-accent-rose">
            <AlertTriangle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center">
                  <Cpu size={32} className="text-accent-cyan animate-pulse" />
                </div>
                <div className="absolute -inset-2 rounded-2xl border border-accent-cyan/10 animate-ping" />
              </div>
              <p className="text-sm text-slate-500 mt-6">Loading incident data...</p>
            </motion.div>
          ) : !selectedIncident ? (
            /* ===== DASHBOARD VIEW ===== */
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Page Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Activity size={20} className="text-accent-cyan" />
                    Incident Command Center
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Monitor, correlate, and resolve incidents with AI-powered analysis.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge-info">
                    <Radio size={10} />
                    {incidents.length} active
                  </span>
                </div>
              </div>

              {/* Stats */}
              <StatsCards incidents={incidents} />

              {/* Service Dependency Graph */}
              <ServiceGraph
                incidents={incidents}
                onSelectService={(service) => {
                  const inc = incidents.find(i => i.service === service);
                  if (inc) setSelectedIncident(inc);
                }}
              />

              {/* AI Evaluation */}
              <EvaluationDashboard />

              {/* Chaos Simulator */}
              <ChaosPanel onSimulationTriggered={loadIncidents} />

              {/* Incident Feed */}
              <IncidentTable
                incidents={incidents}
                onSelect={setSelectedIncident}
                selectedId={undefined}
              />
            </motion.div>
          ) : (
            /* ===== INVESTIGATION VIEW ===== */
            <motion.div
              key="detail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Page Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Shield size={20} className="text-accent-purple" />
                    Investigation: {selectedIncident.service}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Deep-dive into timeline, evidence, and AI-generated root cause hypothesis.
                  </p>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Left: Incident Timeline & Evidence */}
                <IncidentDetail incident={selectedIncident} />

                {/* Right: AI Analysis */}
                <AIAnalysisPanel incident={selectedIncident} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] mt-12">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-600">
          <span>RootCause AI v0.1.0 — Built with FastAPI + ChromaDB + Groq</span>
          <span>© 2026 AI Root Cause Analyzer</span>
        </div>
      </footer>
    </div>
  );
}
