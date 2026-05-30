'use client'

import { useState, useEffect, useRef } from 'react'
import { m as motion, AnimatePresence, useInView, LazyMotion, domAnimation } from 'framer-motion'
import {
  Shield, Zap, Brain, GitBranch, Gauge, RefreshCw, FileText, Layers,
  ArrowRight, Circle, Activity, Network, Database, Server, AlertCircle,
  TrendingUp, Lock, Terminal, Menu, X,
} from 'lucide-react'
import { FeatureCard } from '@/components/FeatureCard'

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedService, setSelectedService] = useState('checkout-ui')
  const [selectedFailure, setSelectedFailure] = useState('latency')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [telemetryEvents, setTelemetryEvents] = useState<string[]>([])
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY })
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  const injectFailure = () => {
    setIsAnalyzing(true)
    setTelemetryEvents([])
    const events = [
      `◉ 14:32:01 ${selectedService} alert firing — ${selectedFailure} detected`,
      `◉ 14:32:03 anomaly scorer: z-score 3.2σ above baseline`,
      `◉ 14:32:05 rules engine: 2 pattern matches found`,
      `◉ 14:32:07 RAG: querying similar past incidents...`,
      `◉ 14:32:09 correlating signals across affected services`,
      `◉ 14:32:11 LLM synthesis: generating root cause hypothesis`,
      `◉ 14:32:13 verdict ready — confidence score calculated`,
    ]
    events.forEach((event, i) => {
      setTimeout(() => {
        setTelemetryEvents(prev => [...prev, event])
        if (i === events.length - 1) setTimeout(() => setIsAnalyzing(false), 500)
      }, i * 800)
    })
  }

  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: '#09090b', fontFamily: "'Inter', sans-serif" }}>
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[40%] left-1/2 -translate-x-1/2 w-[1000px] h-[800px] rounded-full blur-[140px] opacity-70"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full transition-all duration-300 ease-out pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 60%)',
            left: mousePosition.x - 300,
            top: mousePosition.y - 300,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090b]/40 to-[#09090b]" />
      </div>

      {/* ── NAVBAR ── */}
      <motion.nav
        className="fixed top-4 inset-x-0 z-50 px-6"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div
          className="max-w-5xl mx-auto px-6 py-3 rounded-xl border flex items-center justify-between"
          style={{
            background: 'rgba(15,15,20,0.85)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <motion.div className="flex items-center gap-2.5" whileHover={{ scale: 1.02 }}>
            <Shield className="w-5 h-5 text-indigo-500" />
            <span className="font-bold text-white tracking-tight">Sentinel</span>
          </motion.div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            {['Features', 'Demo', 'How it works'].map(label => (
              <motion.a
                key={label}
                href={`#${label.toLowerCase().replace(/ /g, '-')}`}
                className="text-zinc-400 hover:text-white transition-colors"
                whileHover={{ y: -1 }}
              >
                {label}
              </motion.a>
            ))}
          </div>

          <div className="flex items-center gap-4 font-medium">
            <motion.a
              href="/login"
              className="text-sm text-zinc-400 hover:text-white transition-colors hidden md:block"
              whileHover={{ scale: 1.02 }}
            >
              Sign in
            </motion.a>
            <motion.a
              href="/register"
              className="px-5 py-2.5 text-white text-sm rounded-xl font-medium"
              style={{ background: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)', boxShadow: '0 0 20px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 14px rgba(99,102,241,0.3)' }}
              whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98 }}
            >
              Get Started
            </motion.a>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center px-8 pt-32 pb-20">
        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 backdrop-blur-md shadow-[0_4px_24px_rgba(99,102,241,0.12)]"
          >
            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
              <Circle className="w-1.5 h-1.5 fill-indigo-400 text-indigo-400" />
            </motion.div>
            <span className="text-xs text-indigo-300 font-semibold tracking-wide uppercase">Chaos Engineering v2.0</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="text-5xl sm:text-7xl tracking-tighter leading-[1.05] font-semibold"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <span className="text-white">Diagnose incidents</span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-indigo-600">before you get paged</span>
          </motion.h1>

          <motion.p
            className="text-lg max-w-2xl mx-auto leading-relaxed text-zinc-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
          >
            Sentinel-SRE correlates signals, runs chaos simulations, and delivers root cause verdicts
            with <span className="text-white font-medium">calibrated confidence</span> — in seconds, not hours.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.75 }}
          >
            <motion.a
              href="/register"
              className="px-7 py-3.5 rounded-xl flex items-center gap-2 font-semibold text-sm text-white w-full sm:w-auto justify-center"
              style={{ background: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 30px rgba(99,102,241,0.25)' }}
              whileHover={{ scale: 1.02, filter: 'brightness(1.15)' }}
              whileTap={{ scale: 0.98 }}
            >
              Start for free
              <ArrowRight className="w-4 h-4" />
            </motion.a>
            <motion.a
              href="#demo"
              className="px-7 py-3.5 border border-white/10 text-zinc-300 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-white/5 transition-colors w-full sm:w-auto justify-center backdrop-blur-md"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Terminal className="w-4 h-4" />
              Live Demo
            </motion.a>
          </motion.div>

          {/* Integrations */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 pt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
          >
            <span className="text-xs text-zinc-600 font-semibold uppercase tracking-wider w-full sm:w-auto mb-2 sm:mb-0">Integrations</span>
            {['Prometheus', 'Slack', 'Microsoft Teams'].map((name, i) => (
              <motion.span
                key={name}
                className="text-sm font-medium text-zinc-500 hover:text-white transition-colors cursor-default"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 1.1 + i * 0.08 }}
              >
                {name}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative py-28 px-8 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <motion.div className="mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-indigo-200 font-semibold tracking-wide uppercase">Core Capabilities</span>
            </div>
            <h2 className="text-4xl sm:text-5xl tracking-tight leading-tight font-semibold text-white">
              Everything you need to<br />
              <span className="text-zinc-500">ship with confidence.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard delay={0} className="md:col-span-2" icon={Brain} title="AI Root Cause Analysis" description="Multi-model ensemble ranks hypotheses, tests them with chaos simulations, and delivers verdicts with calibrated confidence scores." accent />
            <FeatureCard delay={0.08} icon={GitBranch} title="Chaos Engineering" description="Trigger synthetic failure scenarios to test your AI analysis pipeline and validate detection accuracy." />
            <FeatureCard delay={0.14} icon={Gauge} title="Confidence Scoring" description="Calibrated confidence intervals help you know exactly when to trust AI verdicts vs escalate." />
            <FeatureCard delay={0.2} icon={RefreshCw} title="Self-Improving RAG" description="Every postmortem and false positive refines the reasoning engine exclusively for your stack." />
            <FeatureCard delay={0.26} icon={FileText} title="Auto Postmortems" description="Generate production-ready incident reports with timeline, impact analysis, and remediation steps." />
            <FeatureCard delay={0.32} className="md:col-span-2" icon={Layers} title="Prometheus + Slack/Teams" description="Ingest alerts via Prometheus Alertmanager webhook. Dispatch postmortems and interactive actions to Slack and Microsoft Teams." />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative py-28 px-8 border-t border-white/5" style={{ background: 'linear-gradient(to bottom, #09090b 0%, rgba(17,17,19,0.5) 100%)' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div className="mb-20" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-indigo-200 font-semibold tracking-wide uppercase">Workflow</span>
            </div>
            <h2 className="text-4xl sm:text-5xl tracking-tight leading-tight font-semibold text-white">
              Signal to postmortem<br />
              <span className="text-indigo-400">in four simple steps.</span>
            </h2>
          </motion.div>

          <div className="relative">
            <motion.div
              className="absolute top-6 left-6 right-6 h-px hidden md:block"
              style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(99,102,241,0.1) 50%, rgba(99,102,241,0.5))' }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
              {[
                { num: '01', title: 'Ingest', desc: 'Stream logs, metrics, traces from your stack in real time.', icon: Database },
                { num: '02', title: 'Detect', desc: 'Baseline-aware anomaly detection catches drift instantly.', icon: TrendingUp },
                { num: '03', title: 'Analyze', desc: 'Multi-model AI ranks hypotheses and delivers a verdict.', icon: Brain },
                { num: '04', title: 'Learn', desc: 'Feedback loop refines reasoning on every single cycle.', icon: RefreshCw },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  className="group cursor-default"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                >
                  <div className="w-12 h-12 rounded-full border border-zinc-800 bg-[#09090b] flex items-center justify-center mb-6 relative z-10 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <span className="text-sm font-bold text-zinc-500 group-hover:text-indigo-400 transition-colors">{step.num}</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl border border-zinc-800 bg-[#18181b] flex items-center justify-center mb-5 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <step.icon className="w-5 h-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <h3 className="text-xl mb-2 font-semibold text-white">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CHAOS DEMO ── */}
      <section id="demo" className="relative py-28 px-8 border-t border-white/5">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div className="mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-indigo-200 font-semibold tracking-wide uppercase">Interactive Demo</span>
            </div>
            <h2 className="text-4xl sm:text-5xl tracking-tight leading-tight font-semibold">
              <span className="text-indigo-400">Inject a failure.</span><br />
              <span className="text-white">Watch AI diagnose it.</span>
            </h2>
          </motion.div>

          <motion.div
            className="rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl"
            style={{
              background: 'linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(17,17,19,0.9) 100%)',
              borderColor: 'rgba(255,255,255,0.08)',
              boxShadow: '0 24px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            {/* Window chrome */}
            <div className="border-b px-5 py-3.5 flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#18181b' }}>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-zinc-800" />
                  <div className="w-3 h-3 rounded-full bg-zinc-800" />
                  <div className="w-3 h-3 rounded-full bg-zinc-800" />
                </div>
                <span className="text-xs text-zinc-500 font-medium tracking-wide hidden sm:block font-mono">sentinel ~ chaos-lab</span>
              </div>
              <div className="flex items-center gap-2.5">
                <motion.div animate={{ scale: isAnalyzing ? [1, 1.3, 1] : 1 }} transition={{ duration: 1, repeat: isAnalyzing ? Infinity : 0 }}>
                  <Circle className={`w-2 h-2 ${isAnalyzing ? 'fill-rose-500 text-rose-500' : 'fill-indigo-500 text-indigo-500'}`} />
                </motion.div>
                <span className="text-xs text-zinc-500 font-medium font-mono">{isAnalyzing ? 'Analyzing...' : 'Ready'}</span>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row">
              {/* Controls */}
              <div className="w-full lg:w-2/5 border-b lg:border-b-0 lg:border-r p-5 sm:p-6 space-y-6" style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Target Service</label>
                  <div className="space-y-2">
                    {[
                      { id: 'checkout-ui', icon: Database, label: 'checkout-ui' },
                      { id: 'auth-service', icon: Server, label: 'auth-service' },
                      { id: 'order-processor', icon: Network, label: 'order-processor' },
                      { id: 'api-gateway', icon: Activity, label: 'api-gateway' },
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedService(s.id)}
                        className="w-full px-4 py-3 rounded-xl border text-sm flex items-center gap-3 transition-all duration-200"
                        style={{
                          borderColor: selectedService === s.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.03)',
                          background: selectedService === s.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                          color: selectedService === s.id ? '#fff' : '#A1A1AA',
                        }}
                      >
                        <s.icon className={`w-4 h-4 flex-shrink-0 ${selectedService === s.id ? 'text-indigo-400' : 'text-zinc-500'}`} />
                        <span className="font-medium text-xs font-mono">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Failure Mode</label>
                  <div className="space-y-2">
                    {[
                      { id: 'latency', icon: Activity, label: 'High Latency' },
                      { id: 'timeout', icon: AlertCircle, label: 'Timeout Spike' },
                      { id: 'error-rate', icon: AlertCircle, label: 'Error Rate' },
                      { id: 'cpu', icon: Server, label: 'CPU Throttle' },
                      { id: 'network', icon: Network, label: 'Network Partition' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFailure(f.id)}
                        className="w-full px-4 py-3 rounded-xl border text-sm flex items-center gap-3 transition-all duration-200"
                        style={{
                          borderColor: selectedFailure === f.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.03)',
                          background: selectedFailure === f.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                          color: selectedFailure === f.id ? '#fff' : '#A1A1AA',
                        }}
                      >
                        <f.icon className={`w-4 h-4 flex-shrink-0 ${selectedFailure === f.id ? 'text-indigo-400' : 'text-zinc-500'}`} />
                        <span className="font-medium text-sm">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <motion.button
                  onClick={injectFailure}
                  disabled={isAnalyzing}
                  aria-label={isAnalyzing ? 'Simulation running' : 'Inject failure into selected service'}
                  className="w-full px-5 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all text-white"
                  style={{ background: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 14px rgba(99,102,241,0.2)' }}
                  whileHover={{ filter: 'brightness(1.1)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isAnalyzing ? 'Running Simulation...' : 'Inject Failure'}
                </motion.button>
              </div>

              {/* Telemetry + Results */}
              <div className="w-full lg:w-3/5 p-5 sm:p-6 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Live Telemetry</label>
                  <div
                    className="h-56 rounded-xl p-5 text-sm overflow-y-auto space-y-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] font-mono"
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {telemetryEvents.length === 0 ? (
                      <div className="text-zinc-600 flex items-center h-full justify-center opacity-50">Waiting for failure injection...</div>
                    ) : (
                      telemetryEvents.map((event, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-indigo-300 leading-relaxed text-xs">
                          {event}
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {!isAnalyzing && telemetryEvents.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl p-6 relative overflow-hidden backdrop-blur-md"
                      style={{
                        background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(0,0,0,0.4) 100%)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        boxShadow: '0 10px 40px -10px rgba(99,102,241,0.15)',
                      }}
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-indigo-400" />
                      <div className="flex items-start justify-between mb-4">
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-wide">Root Cause Verdict</span>
                        <span className="text-2xl font-bold text-white tracking-tight">94%</span>
                      </div>
                      <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
                        High memory usage on <code className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">{selectedService}</code> triggered by {selectedFailure}. Hybrid analysis pipeline correlated anomaly scores, matched 2 rules, and confirmed via RAG similarity with past incidents.
                      </p>
                      <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
                        {[['Impact', 'Critical'], ['Services', '3 affected'], ['Confidence', '94%']].map(([k, v]) => (
                          <div key={k}>
                            <div className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">{k}</div>
                            <div className="text-white font-semibold text-sm">{v}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── SETUP ── */}
      <section className="relative py-28 px-8 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <motion.div className="mb-16 text-center" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-4xl sm:text-5xl tracking-tight leading-tight mb-4 font-semibold text-white">
              Up and running in <span className="text-indigo-400">minutes</span>.
            </h2>
            <p className="text-lg text-zinc-400">Three steps to AI-powered incident response</p>
          </motion.div>

          <div className="space-y-6">
            {[
              { num: 1, title: 'Register and get your webhook token', code: 'POST /api/v1/auth/register → returns JWT + webhook_token', icon: Lock },
              { num: 2, title: 'Configure Prometheus Alertmanager', code: 'webhook_configs:\n  - url: https://your-backend.onrender.com/api/v1/telemetry/prometheus/<your-token>', icon: Activity },
              { num: 3, title: 'Alerts flow in, AI analyzes automatically', code: '✓ Incidents created, grouped, and analyzed with root cause verdicts', icon: Brain },
            ].map((step, i) => (
              <motion.div
                key={i}
                className="flex flex-col sm:flex-row gap-4 sm:gap-6 group"
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
              >
                <div className="w-10 h-10 rounded-full border border-zinc-800 bg-[#18181b] flex items-center justify-center flex-shrink-0 group-hover:border-indigo-500/40 group-hover:bg-indigo-500/10 transition-all shadow-sm">
                  <span className="text-sm font-bold text-zinc-500 group-hover:text-indigo-400 transition-colors">{step.num}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <step.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                    <h4 className="text-base font-semibold text-zinc-200">{step.title}</h4>
                  </div>
                  <div
                    className="rounded-xl p-4 text-sm relative group/code shadow-inner transition-colors overflow-hidden font-mono"
                    style={{
                      background: 'linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(17,17,19,0.8) 100%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <code className="text-indigo-300 break-all text-xs whitespace-pre-wrap">{step.code}</code>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative border-t py-12 px-6 sm:px-8 bg-[#09090b]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col gap-8 sm:gap-6">
            {/* Top row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-bold text-white tracking-wide">Sentinel-SRE</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 font-medium">
                <a href="https://github.com/sujalmeena7/sentinel-sre" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-white transition-colors">GitHub</a>
                <a href="#features" className="text-sm text-zinc-500 hover:text-white transition-colors">Features</a>
                <a href="/privacy" className="text-sm text-zinc-500 hover:text-white transition-colors">Privacy</a>
                <a href="/terms" className="text-sm text-zinc-500 hover:text-white transition-colors">Terms</a>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />

            {/* Bottom row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
              <p>© 2026 Sentinel-SRE. Open-source project by Sujal Meena.</p>
              <p>Built with Next.js, FastAPI, Groq & ChromaDB.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </LazyMotion>
  )
}
