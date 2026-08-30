'use client';

import { useState, useEffect } from 'react';
import {   m as motion , AnimatePresence  } from 'framer-motion';
import {
  Activity, Shield, ArrowLeft,
  Radio, Cpu, RefreshCw, AlertTriangle
} from 'lucide-react';
import { Incident, fetchIncidents } from '@/lib/api';
import dynamic from 'next/dynamic';
import StatsCards from '@/components/StatsCards';
import ServiceGraph from '@/components/ServiceGraph';
import IncidentTable from '@/components/IncidentTable';

// Lazy loading heavy components with framer-motion and SVG complexity
const IncidentDetail = dynamic(() => import('@/components/IncidentDetail'), { ssr: false });
const AIAnalysisPanel = dynamic(() => import('@/components/AIAnalysisPanel'), { ssr: false });
const ChaosPanel = dynamic(() => import('@/components/ChaosPanel'), { ssr: false });
const TelemetryPanel = dynamic(() => import('@/components/TelemetryPanel'), { ssr: false });
const EvaluationDashboard = dynamic(() => import('@/components/EvaluationDashboard'), { ssr: false });
const LearningDashboard = dynamic(() => import('@/components/LearningDashboard'), { ssr: false });

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'command-center' | 'learning'>('command-center');

  const loadIncidents = async () => {
    try {
      const data = await fetchIncidents();
      setIncidents(data);
      // Keep the open incident in sync with the freshly fetched row so a
      // finished analysis appears without the user reselecting it.
      setSelectedIncident(prev => (prev ? data.find(i => i.id === prev.id) || prev : null));
      setError(null);
    } catch (err) {
      console.error('Failed to load incidents:', err);
      setError('Cannot reach the backend. Make sure it is running on http://127.0.0.1:8000.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadIncidents();
    // Short polling for live updates. Failures here update the same error
    // state as the initial load, so the connection badge stays truthful.
    const intervalId = setInterval(loadIncidents, 4000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadIncidents();
  };

  const connection = error
    ? { label: 'Backend unreachable', dot: 'bg-accent-rose', text: 'text-accent-rose' }
    : loading
      ? { label: 'Connecting…', dot: 'bg-accent-amber', text: 'text-slate-400' }
      : { label: 'Backend connected', dot: 'bg-accent-emerald dot-pulse', text: 'text-slate-500' };

  return (
    <div className="min-h-screen">
      {/* Secondary control bar. The brand + user menu live in the dashboard
          layout header, so this row only carries navigation and controls. */}
      <nav className="sticky top-0 z-50 glass border-b border-white/[0.06]">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-h-8">
            {selectedIncident && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedIncident(null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-200/60 hover:bg-surface-200 transition-colors text-xs text-slate-300"
              >
                <ArrowLeft size={14} className="text-slate-400" />
                Back to incidents
              </motion.button>
            )}
          </div>

          {!selectedIncident && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-100 p-1 rounded-xl border border-white/[0.04]">
              <button
                onClick={() => setCurrentTab('command-center')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${currentTab === 'command-center' ? 'bg-surface text-slate-100 shadow-sm border border-white/[0.08]' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-200/50'}`}
              >
                Command Center
              </button>
              <button
                onClick={() => setCurrentTab('learning')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${currentTab === 'learning' ? 'bg-surface text-slate-100 shadow-sm border border-white/[0.08]' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-200/50'}`}
              >
                Learning Dashboard
              </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-surface-100/50 hover:bg-surface-200/60 transition-all border border-white/[0.04]"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <div className={`flex items-center gap-2 text-xs ${connection.text}`}>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connection.dot}`} />
                {connection.label}
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

              {currentTab === 'command-center' ? (
                <>
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

                  {/* Ingestion & Chaos Panels */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <ChaosPanel onSimulationTriggered={loadIncidents} />
                    <TelemetryPanel />
                  </div>

                  {/* Incident Feed */}
                  <IncidentTable
                    incidents={incidents}
                    onSelect={setSelectedIncident}
                    selectedId={undefined}
                  />
                </>
              ) : (
                <LearningDashboard incidents={incidents} />
              )}
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
          <span>Sentinel-SRE v0.1.0 — Built with FastAPI + ChromaDB + Groq</span>
          <span>© 2026 Sentinel-SRE</span>
        </div>
      </footer>
    </div>
  );
}
