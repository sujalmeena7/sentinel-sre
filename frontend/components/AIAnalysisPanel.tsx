'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  Brain, Loader2, Sparkles, Search, ShieldCheck,
  Zap, BarChart3, Target, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Activity,
  ThumbsUp, ThumbsDown, FileText, Copy, Download, X, Pencil, Send, CheckCheck
} from 'lucide-react';
import { Incident, analyzeIncident, submitFeedback, generatePostmortem, dispatchPostmortem } from '@/lib/api';

interface Hypothesis {
  rank: number;
  source: string;
  title: string;
  description: string;
  confidence: number;
  evidence: string[];
  mitigation: string;
  long_term_fix: string;
  category: string;
}

interface AnomalyMetric {
  metric: string;
  value: number;
  z_score: number;
  severity: string;
  is_anomalous: boolean;
  description: string;
}

interface AnomalyReport {
  overall_score: number;
  summary: string;
  anomalies: AnomalyMetric[];
  error_signals: string[];
}

interface RejectedHypothesis {
  rule_id: string;
  rule_name: string;
  hypothesis: string;
  reason: string;
  score: number;
  missing_evidence: string[];
}

interface HybridResult {
  hypotheses: Hypothesis[];
  anomaly_report: AnomalyReport;
  similar_historic_incidents: string[];
  llm_narrative: string;
  reasoning_chain: string[];
  analysis_breakdown?: { [key: string]: string };
  rejected_hypotheses?: RejectedHypothesis[];
}

interface AIAnalysisPanelProps {
  incident: Incident;
}

const sourceIcons: Record<string, any> = {
  rules: Zap,
  anomaly: BarChart3,
  llm: Brain,
  rag: Search,
};

const sourceColors: Record<string, string> = {
  rules: 'text-accent-amber',
  anomaly: 'text-accent-cyan',
  llm: 'text-accent-purple',
  rag: 'text-accent-emerald',
};

const severityColors: Record<string, string> = {
  normal: 'text-accent-emerald',
  elevated: 'text-accent-amber',
  high: 'text-accent-rose',
  critical: 'text-accent-rose',
};

export default function AIAnalysisPanel({ incident }: AIAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<HybridResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [postmortem, setPostmortem] = useState<string | null>(null);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);
  const [showPmModal, setShowPmModal] = useState(false);
  const [pmEditing, setPmEditing] = useState(false);
  const [pmEditText, setPmEditText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchDestination, setDispatchDestination] = useState<'slack' | 'teams'>('slack');
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [showDispatchSuccess, setShowDispatchSuccess] = useState(false);

  const handleFeedback = async (score: number) => {
    setFeedbackStatus('submitting');
    try {
      await submitFeedback(incident.id, score, 'Submitted via UI Analysis Panel');
      setFeedbackStatus('submitted');
    } catch (err) {
      setFeedbackStatus('error');
    }
  };

  const handleGeneratePostmortem = async () => {
    setPmLoading(true);
    setPmError(null);
    try {
      const result = await generatePostmortem(incident.id);
      setPostmortem(result.postmortem);
      setPmEditText(result.postmortem);
      setShowPmModal(true);
    } catch (err: any) {
      setPmError(err.message || 'Failed to generate postmortem');
    } finally {
      setPmLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = pmEditing ? pmEditText : (postmortem || '');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = pmEditing ? pmEditText : (postmortem || '');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postmortem-${incident.service}-${incident.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDispatch = async () => {
    setDispatchLoading(true);
    setDispatchError(null);
    try {
      await dispatchPostmortem(incident.id, dispatchDestination);
      setShowDispatchModal(false);
      setShowDispatchSuccess(true);
      setTimeout(() => setShowDispatchSuccess(false), 3000);
    } catch (err: any) {
      setDispatchError(err.message || 'Failed to dispatch postmortem');
    } finally {
      setDispatchLoading(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeIncident(
        incident.id,
        incident.symptoms,
        incident.signals as any
      );
      setAnalysis(result as any as HybridResult);
    } catch (err: any) {
      setError(err.message || 'Unknown network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4"
    >
      {/* Trigger Button Card */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-purple/10 flex items-center justify-center">
              <Brain size={18} className="text-accent-purple" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Hybrid AI Analysis</h3>
              <p className="text-xs text-slate-500">Rules + Anomaly + RAG + LLM</p>
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 disabled:opacity-50 bg-gradient-to-r from-accent-cyan/20 to-accent-purple/20 hover:from-accent-cyan/30 hover:to-accent-purple/30 text-white border border-accent-cyan/20 hover:border-accent-cyan/40 hover:shadow-glow-cyan"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles size={14} /> Run Analysis</>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!analysis && !loading && !error && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-xl flex flex-col items-center justify-center py-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-200/50 flex items-center justify-center mb-4">
              <Search size={24} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-500 max-w-xs">
              Click <strong className="text-slate-300">Run Analysis</strong> to activate the 4-stage hybrid reasoning pipeline.
            </p>
          </motion.div>
        )}

        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-xl flex flex-col items-center justify-center py-14">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-accent-cyan/20 flex items-center justify-center">
                <Loader2 size={28} className="text-accent-cyan animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-accent-purple/10 animate-ping" />
            </div>
            <p className="text-sm text-slate-400 mt-4">Running hybrid pipeline...</p>
            <div className="flex gap-3 mt-3 text-xs text-slate-600">
              <span className="flex items-center gap-1"><Zap size={10} />Rules</span>
              <span>→</span>
              <span className="flex items-center gap-1"><BarChart3 size={10} />Anomaly</span>
              <span>→</span>
              <span className="flex items-center gap-1"><Search size={10} />RAG</span>
              <span>→</span>
              <span className="flex items-center gap-1"><Brain size={10} />LLM</span>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-xl p-4 text-sm text-accent-rose border border-accent-rose/20">
            {error}
          </motion.div>
        )}

        {analysis && (
          <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">

            {/* Reasoning Chain (collapsible) */}
            <div className="glass rounded-xl overflow-hidden">
              <button onClick={() => setShowChain(!showChain)}
                className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Activity size={12} className="text-accent-cyan" />
                  Reasoning Chain ({analysis.reasoning_chain.length} steps)
                </span>
                {showChain ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
              </button>
              <AnimatePresence>
                {showChain && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="px-5 pb-4 space-y-1 overflow-hidden">
                    {analysis.reasoning_chain.map((step, i) => (
                      <div key={i} className="text-xs font-mono text-slate-500">{step}</div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Anomaly Report */}
            <div className="glass rounded-xl p-5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart3 size={12} className="text-accent-cyan" />
                Anomaly Report — Score: {analysis.anomaly_report.overall_score}
              </h4>
              <p className="text-sm text-slate-300 mb-3">{analysis.anomaly_report.summary}</p>
              <div className="space-y-2">
                {analysis.anomaly_report.anomalies.map((a, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 text-xs bg-surface-100/60 rounded-lg px-3 py-2">
                    <span className={`w-2 h-2 rounded-full ${a.is_anomalous ? 'bg-accent-rose dot-pulse' : 'bg-accent-emerald'}`} />
                    <span className="font-mono text-slate-400 flex-1">{a.description}</span>
                    <span className={`font-semibold ${severityColors[a.severity] || 'text-slate-400'}`}>
                      z={a.z_score}
                    </span>
                  </motion.div>
                ))}
                {analysis.anomaly_report.error_signals.map((sig, i) => (
                  <div key={`sig-${i}`} className="text-xs text-accent-amber bg-accent-amber/5 rounded-lg px-3 py-2">{sig}</div>
                ))}
              </div>
            </div>

            {/* Analysis Breakdown (Why this result?) */}
            {analysis.analysis_breakdown && (
              <div className="glass rounded-xl p-5 border border-accent-purple/20">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Brain size={12} className="text-accent-purple" />
                  Why this result? (Traceability Breakdown)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(analysis.analysis_breakdown).map(([layer, text]) => (
                    <div key={layer} className="bg-surface-100/60 rounded-lg p-3 text-xs border border-white/[0.04]">
                      <span className="font-semibold text-slate-300 block mb-1">{layer}</span>
                      <span className="text-slate-500 leading-relaxed">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ranked Hypotheses */}
            <div className="glass rounded-xl p-5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Target size={12} className="text-accent-purple" />
                Ranked Hypotheses
              </h4>
              <div className="space-y-3">
                {analysis.hypotheses.map((hyp, i) => {
                  const SourceIcon = sourceIcons[hyp.source] || Brain;
                  const sourceColor = sourceColors[hyp.source] || 'text-slate-400';

                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
                      className={`rounded-xl p-4 border transition-all ${
                        i === 0
                          ? 'bg-accent-cyan/[0.04] border-accent-cyan/20 shadow-glow-cyan'
                          : 'bg-surface-100/40 border-white/[0.04]'
                      }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-slate-500">#{hyp.rank}</span>
                          <SourceIcon size={14} className={sourceColor} />
                          <span className={`text-xs font-medium uppercase ${sourceColor}`}>{hyp.source}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              hyp.confidence >= 80 ? 'bg-accent-emerald' :
                              hyp.confidence >= 50 ? 'bg-accent-amber' : 'bg-accent-rose'
                            }`} style={{ width: `${hyp.confidence}%` }} />
                          </div>
                          <span className="text-xs font-bold text-slate-300">{hyp.confidence}%</span>
                        </div>
                      </div>
                      <h5 className="text-sm font-semibold text-slate-200 mb-1">{hyp.title}</h5>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{hyp.description}</p>
                      {hyp.evidence.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {hyp.evidence.map((ev, j) => (
                            <span key={j} className="text-[10px] font-mono bg-surface-200/60 text-slate-500 px-2 py-0.5 rounded">
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}
                      {hyp.mitigation && (
                        <div className="mt-3 pt-2 border-t border-white/[0.04] text-xs text-accent-emerald flex items-start gap-1.5">
                          <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" />
                          <span>{hyp.mitigation}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Similar Incidents */}
            {analysis.similar_historic_incidents.length > 0 && (
              <div className="glass rounded-xl p-5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ShieldCheck size={12} className="text-accent-emerald" />
                  Similar Historic Incidents (RAG)
                </h4>
                <div className="space-y-2">
                  {analysis.similar_historic_incidents.map((text, i) => (
                    <div key={i} className="bg-surface-100/60 rounded-lg p-3 text-xs font-mono text-slate-400 border border-white/[0.04] leading-relaxed">
                      {text.slice(0, 200)}...
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LLM Narrative */}
            <div className="glass rounded-xl p-5 gradient-border">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Brain size={12} className="text-accent-purple" />
                LLM Synthesis (Groq)
              </h4>
              <div className="bg-surface-50/30 rounded-xl p-5 border border-white/[0.04] markdown-body">
                <ReactMarkdown>{analysis.llm_narrative}</ReactMarkdown>
              </div>
            </div>

            {/* ═══ Why Not X? — Rejected Hypotheses ═══ */}
            {analysis.rejected_hypotheses && analysis.rejected_hypotheses.length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowRejected(!showRejected)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-slate-100 transition-colors w-full"
                >
                  <AlertTriangle size={14} className="text-amber-400" />
                  Why not {analysis.rejected_hypotheses.length} other hypothesis{analysis.rejected_hypotheses.length > 1 ? 'es' : ''}?
                  <ChevronDown
                    size={14}
                    className={`ml-auto transition-transform duration-200 text-slate-500 ${showRejected ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {showRejected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1">
                        Ruled out by insufficient evidence
                      </p>
                      {analysis.rejected_hypotheses.map((rej, idx) => (
                        <motion.div
                          key={rej.rule_id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-surface-50/20 rounded-lg p-3 border border-white/[0.03] hover:border-amber-500/10 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">
                                  {rej.rule_id}
                                </span>
                                <span className="text-xs font-medium text-slate-300">{rej.rule_name}</span>
                              </div>
                              <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                                &ldquo;{rej.hypothesis.length > 120 ? rej.hypothesis.slice(0, 120) + '...' : rej.hypothesis}&rdquo;
                              </p>
                              <div className="space-y-1">
                                {rej.missing_evidence.map((ev, i) => (
                                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                                    <X size={10} className="text-rose-400 mt-0.5 flex-shrink-0" />
                                    <span className="text-slate-400">{ev}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-[10px] text-slate-500">Match</div>
                              <div className={`text-sm font-bold ${
                                rej.score >= 0.2 ? 'text-amber-400' : 'text-slate-600'
                              }`}>
                                {Math.round(rej.score * 100)}%
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Engineer Feedback Loop */}
            <div className="glass rounded-xl p-5 border-t border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">Was this analysis helpful?</h4>
                <p className="text-xs text-slate-400">Help the system learn from your response to improve future hypotheses.</p>
              </div>
              
              <div className="flex gap-2">
                {feedbackStatus === 'idle' || feedbackStatus === 'error' ? (
                  <>
                    <button 
                      onClick={() => handleFeedback(1)}
                      className="px-4 py-2 bg-surface-100 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-all text-sm flex items-center gap-2"
                    >
                      <ThumbsUp size={14} /> Helpful
                    </button>
                    <button 
                      onClick={() => handleFeedback(-1)}
                      className="px-4 py-2 bg-surface-100 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-all text-sm flex items-center gap-2"
                    >
                      <ThumbsDown size={14} /> Incorrect
                    </button>
                  </>
                ) : feedbackStatus === 'submitting' ? (
                  <div className="flex items-center gap-2 text-slate-400 px-4 py-2 text-sm">
                    <Loader2 size={14} className="animate-spin" /> Recording...
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
                    <CheckCircle2 size={14} /> Feedback saved as learning example
                  </div>
                )}
              </div>
            </div>
            {feedbackStatus === 'error' && (
              <p className="text-xs text-rose-400 mt-2 text-right">Failed to record feedback. Please try again.</p>
            )}

            {/* Postmortem Generator Button */}
            <div className="glass rounded-xl p-5 mt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                    <FileText size={14} className="text-accent-cyan" />
                    Incident Postmortem
                  </h4>
                  <p className="text-xs text-slate-400">Generate a structured postmortem document from this analysis.</p>
                </div>
                <button
                  onClick={handleGeneratePostmortem}
                  disabled={pmLoading}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/30 rounded-lg transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {pmLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating...</>
                  ) : (
                    <><FileText size={14} /> Generate Postmortem</>
                  )}
                </button>
              </div>
              {pmError && (
                <p className="text-xs text-rose-400 mt-2">{pmError}</p>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Postmortem Modal ═══ */}
      <AnimatePresence>
        {showPmModal && postmortem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowPmModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-surface-200 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <FileText size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">Incident Postmortem</h3>
                    <p className="text-xs text-slate-400">{incident.service} — {incident.id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPmEditing(!pmEditing); }}
                    className={`p-2 rounded-lg text-sm transition-all ${
                      pmEditing
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-surface-100 text-slate-400 hover:text-slate-200 border border-white/5'
                    }`}
                    title={pmEditing ? 'Preview' : 'Edit'}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-2 bg-surface-100 hover:bg-surface-50 text-slate-400 hover:text-slate-200 rounded-lg transition-all border border-white/5"
                    title="Copy to clipboard"
                  >
                    {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 bg-surface-100 hover:bg-surface-50 text-slate-400 hover:text-slate-200 rounded-lg transition-all border border-white/5"
                    title="Download as .md"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => { setDispatchError(null); setShowDispatchModal(true); }}
                    className="p-2 bg-surface-100 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 rounded-lg transition-all border border-white/5"
                    title="Dispatch to channel"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    onClick={() => setShowPmModal(false)}
                    className="p-2 bg-surface-100 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-all border border-white/5"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {pmEditing ? (
                  <textarea
                    value={pmEditText}
                    onChange={(e) => setPmEditText(e.target.value)}
                    className="w-full h-full min-h-[500px] bg-surface-100 border border-white/5 rounded-xl p-4 text-sm text-slate-300 font-mono resize-y focus:outline-none focus:border-cyan-500/30"
                  />
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none markdown-body">
                    <ReactMarkdown>{pmEditing ? pmEditText : postmortem}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between p-4 border-t border-white/5">
                <p className="text-xs text-slate-500">Generated by AI Root Cause Analyzer • {new Date().toLocaleDateString()}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-surface-100 hover:bg-surface-50 text-slate-300 rounded-lg text-sm flex items-center gap-2 border border-white/5 transition-all"
                  >
                    {copied ? <><CheckCircle2 size={12} className="text-emerald-400" /> Copied!</> : <><Copy size={12} /> Copy Markdown</>}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-sm flex items-center gap-2 transition-all"
                  >
                    <Download size={12} /> Download .md
                  </button>
                  <button
                    onClick={() => { setDispatchError(null); setShowDispatchModal(true); }}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500/20 to-cyan-500/20 hover:from-violet-500/30 hover:to-cyan-500/30 text-violet-200 border border-violet-500/30 rounded-lg text-sm flex items-center gap-2 transition-all"
                  >
                    <Send size={12} /> Dispatch to Channel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Dispatch Modal ═══ */}
      <AnimatePresence>
        {showDispatchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowDispatchModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-surface-200 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-500/20">
                  <Send size={16} className="text-violet-300" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">Dispatch to Channel</h4>
                  <p className="text-xs text-slate-400">Choose destination for this postmortem.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setDispatchDestination('slack')}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                    dispatchDestination === 'slack'
                      ? 'bg-[#4A154B]/25 border-[#4A154B]/60 text-[#E5D3F2]'
                      : 'bg-surface-100 border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className="inline-flex w-4 h-4 mr-2 rounded bg-[#4A154B]/90 align-middle" /> Slack
                </button>
                <button
                  onClick={() => setDispatchDestination('teams')}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                    dispatchDestination === 'teams'
                      ? 'bg-[#464EB8]/25 border-[#464EB8]/60 text-[#DDE1FF]'
                      : 'bg-surface-100 border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className="inline-flex w-4 h-4 mr-2 rounded bg-[#464EB8]/90 align-middle" /> Teams
                </button>
              </div>

              {dispatchError && (
                <p className="text-xs text-rose-400 mb-3">{dispatchError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="px-3 py-2 text-xs rounded-lg bg-surface-100 border border-white/10 text-slate-300 hover:bg-surface-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispatch}
                  disabled={dispatchLoading}
                  className="px-3 py-2 text-xs rounded-lg bg-gradient-to-r from-violet-500/25 to-cyan-500/25 border border-violet-500/30 text-violet-100 hover:from-violet-500/35 hover:to-cyan-500/35 disabled:opacity-50 flex items-center gap-2"
                >
                  {dispatchLoading ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : <><Send size={12} /> Dispatch</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Dispatch Success Toast ═══ */}
      <AnimatePresence>
        {showDispatchSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[70] bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 text-emerald-300 text-sm">
              <CheckCheck size={16} />
              <span>Postmortem delivered successfully.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
