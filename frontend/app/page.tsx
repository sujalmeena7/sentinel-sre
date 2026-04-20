'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useTransform, AnimatePresence, useInView } from 'framer-motion'
import {
  Brain,
  Zap,
  Target,
  RefreshCw,
  FileText,
  ArrowRight,
  Github,
  Play,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Shield,
  Code2,
  Terminal,
  Sparkles,
  Cpu,
  GitBranch,
  Radio,
  ChevronRight,
  Star,
  Gauge,
  Layers,
  Database,
  Bell,
  Menu,
  X,
  Loader2,
  Zap as Bolt,
  Crown,
  Rocket,
  Flame,
  Network,
  MemoryStick,
  Timer,
  ServerCrash,
  Plug,
  Puzzle,
} from 'lucide-react'

/* =========================================================
   Reusable bits
   ========================================================= */

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}

const FadeIn = ({ children, delay = 0, y = 20, className = '' }: FadeInProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface GradientBadgeProps {
  children: React.ReactNode;
  icon?: any;
}

const GradientBadge = ({ children, icon: Icon }: GradientBadgeProps) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-white/80">
    {Icon && <Icon className="w-3.5 h-3.5 text-indigo-400" />}
    <span>{children}</span>
  </div>
)

interface GlowButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  href?: string;
  icon?: any;
}

const GlowButton = ({ children, variant = 'primary', href = '#', icon: Icon }: GlowButtonProps) => {
  const base = 'relative inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 shine group'
  if (variant === 'primary') {
    return (
      <a href={href} className={`${base} bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.15)]`}>
        {children}
        {Icon && <Icon className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
      </a>
    )
  }
  return (
    <a href={href} className={`${base} glass text-white hover:bg-white/10`}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </a>
  )
}

/* =========================================================
   NAV
   ========================================================= */

const Nav = () => {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'Features', href: '#features' },
    { label: 'Chaos Demo', href: '#chaos' },
    { label: 'How it works', href: '#how' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Developers', href: '#developers' },
  ]

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-3' : 'py-5'
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className={`flex items-center justify-between rounded-2xl transition-all duration-300 ${
          scrolled ? 'glass-strong px-4 py-2.5' : 'px-2 py-2'
        }`}>
          <a href="#" className="flex items-center gap-2 group">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.5)]">
              <Shield className="w-4 h-4 text-white" />
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-50 -z-10" />
            </div>
            <span className="font-semibold tracking-tight text-white">Sentinel-SRE</span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l: any) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <a href="/login" className="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors" data-testid="nav-signin-link">
              Sign in
            </a>
            <a
              href="/register"
              className="px-4 py-1.5 text-sm rounded-full bg-white text-black hover:bg-white/90 transition-colors font-medium"
              data-testid="nav-launch-dashboard-link"
            >
              Launch Dashboard
            </a>
          </div>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg glass"
            aria-label="Menu"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden mt-2 glass-strong rounded-2xl p-4 space-y-1"
            >
              {links.map((l: any) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5">
                  {l.label}
                </a>
              ))}
              <a href="/register" onClick={() => setOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-full bg-white text-black text-sm font-medium">
                Get started
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  )
}

/* =========================================================
   HERO
   ========================================================= */

const Hero = () => {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 0.3], [0, -60])

  return (
    <section className="relative pt-40 pb-24 lg:pt-48 lg:pb-32 overflow-hidden">
      {/* Ambient layers */}
      <div className="absolute inset-0 grid-bg radial-fade" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/0 to-black pointer-events-none" />

      {/* Glowing orbs */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute top-32 left-10 w-72 h-72 rounded-full bg-purple-600/20 blur-[100px] animate-blob pointer-events-none" />
      <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-cyan-500/10 blur-[100px] animate-blob pointer-events-none" style={{ animationDelay: '4s' }} />

      <motion.div style={{ y }} className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <GradientBadge icon={Sparkles}>
              New · Chaos Simulation Engine 2.0 is here
            </GradientBadge>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-7xl font-semibold tracking-tight leading-[1.05]">
              <span className="text-gradient">Detect, Diagnose, and Learn</span>
              <br />
              <span className="text-white/90">from System Failures — </span>
              <span className="text-gradient-blue italic">Automatically</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="mt-7 text-lg lg:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              Sentinel-SRE uses AI, chaos simulations, and real-time signals to identify root causes
              and generate actionable insights in seconds.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <GlowButton variant="primary" href="/dashboard" icon={ArrowRight}>
                Launch Dashboard
              </GlowButton>
              <GlowButton variant="secondary" href="#preview" icon={Play}>
                View Demo
              </GlowButton>
            </div>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-white/40">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Deploy in minutes
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                SOC 2 · GDPR ready
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Dashboard preview */}
        <FadeIn delay={0.5} y={40}>
          <div id="preview" className="relative mt-20 lg:mt-28 max-w-6xl mx-auto">
            <div className="absolute -inset-8 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-500/20 blur-3xl rounded-full opacity-60" />
            <DashboardMock />
          </div>
        </FadeIn>

        {/* Logo strip */}
        <FadeIn delay={0.6}>
          <div className="mt-20 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-6">
              Trusted by engineering teams at
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-60">
              {['Acme Corp', 'Vertex', 'Quantum', 'Nebula', 'Linear', 'Helios'].map((name: string) => (
                <span key={name} className="text-white/50 font-semibold tracking-tight text-lg">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>
      </motion.div>
    </section>
  )
}

/* =========================================================
   DASHBOARD MOCK
   ========================================================= */

const DashboardMock = () => {
  const [selectedIncident, setSelectedIncident] = useState(0)

  const incidents = [
    {
      id: 'INC-4829',
      title: 'api-gateway 5xx spike',
      service: 'api-gateway',
      severity: 'critical',
      time: '2m ago',
      confidence: 94,
      cause: 'Connection pool exhausted on primary DB replica after surge in write traffic.',
      signals: ['CPU +38%', 'DB conn 980/1000', 'p99 latency 4.2s'],
    },
    {
      id: 'INC-4828',
      title: 'checkout-service timeout',
      service: 'checkout-service',
      severity: 'high',
      time: '14m ago',
      confidence: 87,
      cause: 'Downstream payment provider introduced 3s retry delay.',
      signals: ['Upstream p95 2.8s', 'Retries +420%', 'Error rate 6.2%'],
    },
    {
      id: 'INC-4827',
      title: 'auth-service memory leak',
      service: 'auth-service',
      severity: 'medium',
      time: '41m ago',
      confidence: 78,
      cause: 'Session cache TTL misconfiguration after v3.12 rollout.',
      signals: ['Mem +12%/hr', 'GC pauses 180ms', 'Heap 78%'],
    },
  ]

  const inc = incidents[selectedIncident]

  return (
    <div className="relative rounded-2xl glass-strong glow-border overflow-hidden shadow-[0_50px_120px_-20px_rgba(79,70,229,0.35)]">
      {/* Titlebar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 text-center text-xs text-white/40 font-mono">
          sentinel-sre.io/dashboard
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 min-h-[520px]">
        {/* Sidebar */}
        <div className="hidden md:flex col-span-2 border-r border-white/5 bg-black/40 flex-col p-3 gap-1">
          {[
            { icon: Activity, label: 'Incidents', active: true },
            { icon: Radio, label: 'Signals' },
            { icon: Brain, label: 'RCA' },
            { icon: GitBranch, label: 'Chaos' },
            { icon: FileText, label: 'Postmortems' },
            { icon: Database, label: 'Sources' },
            { icon: Bell, label: 'Alerts' },
          ].map((item: any, i: number) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                item.active
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Incident feed */}
        <div className="col-span-12 md:col-span-4 border-r border-white/5">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40">Incident feed</p>
              <p className="text-sm font-medium text-white">3 active</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <TrendingUp className="w-3 h-3" />
              -42% MTTR
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {incidents.map((incident: any, i: number) => (
              <button
                key={incident.id}
                onClick={() => setSelectedIncident(i)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedIncident === i ? 'bg-white/5' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          incident.severity === 'critical'
                            ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                            : incident.severity === 'high'
                            ? 'bg-orange-500'
                            : 'bg-yellow-500'
                        }`}
                      />
                      <span className="text-xs font-mono text-white/40">{incident.id}</span>
                    </div>
                    <p className="text-sm font-medium text-white truncate">{incident.title}</p>
                    <p className="text-xs text-white/40 mt-1 font-mono">{incident.service}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-white/40">{incident.time}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RCA panel */}
        <div className="col-span-12 md:col-span-6 p-5 space-y-4 bg-gradient-to-br from-transparent to-indigo-950/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-white/40">{inc.id}</span>
                <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-red-500/15 text-red-400 border border-red-500/20">
                  {inc.severity}
                </span>
              </div>
              <h3 className="text-base font-semibold text-white">{inc.title}</h3>
            </div>
            <ConfidenceBadge value={inc.confidence} />
          </div>

          {/* Live chart */}
          <MiniChart />

          {/* AI RCA card */}
          <motion.div
            key={inc.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="glass rounded-xl p-3.5 border border-indigo-500/20"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs font-medium text-white/80">AI Root Cause Analysis</span>
              <span className="ml-auto text-[10px] text-white/40 font-mono">gpt · claude · llama</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{inc.cause}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {inc.signals.map((s: string, i: number) => (
                <span
                  key={i}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10"
                >
                  {s}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90">
              Generate postmortem <ArrowRight className="w-3 h-3" />
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-white/80 text-xs font-medium hover:bg-white/10">
              <GitBranch className="w-3 h-3" /> Run chaos test
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-white/80 text-xs font-medium hover:bg-white/10">
              <ChevronRight className="w-3 h-3" /> View timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ConfidenceBadgeProps {
  value: number;
}

const ConfidenceBadge = ({ value }: ConfidenceBadgeProps) => {
  const color =
    value >= 90 ? 'from-emerald-400 to-teal-500' : value >= 80 ? 'from-cyan-400 to-blue-500' : 'from-yellow-400 to-orange-500'
  return (
    <div className="relative">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            stroke="url(#grad)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={2 * Math.PI * 28}
            initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - value / 100) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold text-white">{value}%</span>
          <span className="text-[8px] uppercase tracking-wider text-white/40">conf</span>
        </div>
      </div>
      <div className={`hidden ${color}`} />
    </div>
  )
}

const MiniChart = () => {
  // Deterministic pseudo-random data
  const points = [12, 18, 15, 22, 19, 25, 30, 28, 35, 40, 52, 68, 82, 74, 90, 65, 48, 40, 35, 30]
  const max = Math.max(...points)
  const width = 100
  const height = 28
  const path = points
    .map((p: number, i: number) => {
      const x = (i / (points.length - 1)) * width
      const y = height - (p / max) * height
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
  const area = `${path} L ${width} ${height} L 0 ${height} Z`

  return (
    <div className="glass rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs text-white/70 font-medium">Error rate · last 15m</span>
        </div>
        <span className="text-xs font-mono text-red-400">↑ 6.2%</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(239,68,68,0.35)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)" />
        <motion.path
          d={path}
          fill="none"
          stroke="#f87171"
          strokeWidth="0.6"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
    </div>
  )
}

/* =========================================================
   FEATURES
   ========================================================= */

const Features = () => {
  const features = [
    {
      icon: Brain,
      title: 'AI Root Cause Analysis',
      desc: 'Multi-model LLM ensemble correlates logs, metrics, and traces to surface the true cause — not just the symptom.',
      tint: 'from-indigo-500/20 to-purple-500/20',
      iconColor: 'text-indigo-400',
    },
    {
      icon: GitBranch,
      title: 'Chaos Engineering Simulator',
      desc: 'Safely inject failures in staging or prod shadow traffic to validate resilience before your users feel it.',
      tint: 'from-pink-500/20 to-orange-500/20',
      iconColor: 'text-pink-400',
    },
    {
      icon: Gauge,
      title: 'Confidence Scoring Engine',
      desc: 'Every AI verdict ships with a calibrated confidence score, so you know when to trust — and when to dig deeper.',
      tint: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-400',
    },
    {
      icon: RefreshCw,
      title: 'Feedback-Aware Learning (RAG)',
      desc: 'Engineers rate explanations; Sentinel stores context in a retrieval layer that gets smarter with every incident.',
      tint: 'from-cyan-500/20 to-blue-500/20',
      iconColor: 'text-cyan-400',
    },
    {
      icon: FileText,
      title: 'Automated Postmortems',
      desc: 'Structured, blameless postmortems generated in seconds — timelines, impact, fixes, action items. Ready to publish.',
      tint: 'from-violet-500/20 to-fuchsia-500/20',
      iconColor: 'text-violet-400',
    },
    {
      icon: Layers,
      title: 'Unified Telemetry',
      desc: 'Bring your own stack — Datadog, Prometheus, OpenTelemetry, Loki. Sentinel reasons across all of it.',
      tint: 'from-amber-500/20 to-rose-500/20',
      iconColor: 'text-amber-400',
    },
  ]

  return (
    <section id="features" className="relative py-28 lg:py-36">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950/50 to-black pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <GradientBadge icon={Zap}>Core capabilities</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Every signal. Every incident.<br />One resilient system.
            </h2>
            <p className="mt-5 text-white/50 text-lg">
              Purpose-built for modern SRE teams who want less paging and more insight.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f: any, i: number) => (
            <FadeIn key={f.title} delay={i * 0.05}>
              <FeatureCard {...f} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

interface FeatureCardProps {
  icon: any;
  title: string;
  desc: string;
  tint: string;
  iconColor?: string;
}

const FeatureCard = ({ icon: Icon, title, desc, tint, iconColor }: FeatureCardProps) => (
  <div className="group relative h-full rounded-2xl glass p-6 transition-all duration-500 hover:-translate-y-1 hover:border-white/15 overflow-hidden">
    <div className={`absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br ${tint} blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
    <div className="relative">
      <div className={`w-11 h-11 rounded-xl glass flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
      <div className="mt-5 inline-flex items-center gap-1 text-xs text-white/40 group-hover:text-white/80 transition-colors">
        Learn more <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  </div>
)

/* =========================================================
   HOW IT WORKS
   ========================================================= */

const HowItWorks = () => {
  const steps = [
    {
      icon: Radio,
      title: 'Ingest telemetry',
      desc: 'Stream logs, metrics, and traces from your existing observability stack in minutes.',
    },
    {
      icon: AlertTriangle,
      title: 'Detect anomalies',
      desc: 'Baseline-aware detectors spot drift and surges before on-call gets paged.',
    },
    {
      icon: Brain,
      title: 'AI analyzes root cause',
      desc: 'Multi-model RCA correlates signals, ranks hypotheses, and delivers a verdict.',
    },
    {
      icon: RefreshCw,
      title: 'Learn from feedback',
      desc: 'Engineers rate insights. Sentinel refines its reasoning for every new deploy.',
    },
  ]

  return (
    <section id="how" className="relative py-28 lg:py-36">
      <div className="container mx-auto px-4 lg:px-8">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-20">
            <GradientBadge icon={Cpu}>How it works</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              From signal to postmortem<br />in four steps
            </h2>
          </div>
        </FadeIn>

        <div className="relative">
          {/* connecting gradient line */}
          <div className="hidden lg:block absolute top-10 left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {steps.map((step: any, i: number) => (
              <FadeIn key={step.title} delay={i * 0.08}>
                <div className="relative">
                  <div className="relative z-10 flex flex-col items-start">
                    <div className="relative w-20 h-20 rounded-2xl glass flex items-center justify-center mb-5 group">
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/10 blur-lg opacity-50" />
                      <step.icon className="w-7 h-7 text-white relative" />
                      <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-black text-xs font-semibold flex items-center justify-center shadow-lg">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* =========================================================
   WHY SENTINEL
   ========================================================= */

const WhySentinel = () => {
  const reasons = [
    {
      icon: GitBranch,
      title: 'Simulates failures',
      desc: 'Built-in Chaos Engineering catches regressions before they page your team.',
      stat: '1000+',
      label: 'failure modes',
    },
    {
      icon: Target,
      title: 'Evaluates AI accuracy',
      desc: 'Confidence scoring + continuous eval means you know when to trust the model.',
      stat: '92%',
      label: 'avg accuracy',
    },
    {
      icon: RefreshCw,
      title: 'Self-improving system',
      desc: 'Every rating, every fix — fed back into the RAG layer. Your system gets smarter weekly.',
      stat: '+4%',
      label: 'accuracy / mo',
    },
    {
      icon: Shield,
      title: 'Built for real SRE workflows',
      desc: 'Runbooks, pagerduty hooks, slack threads, postmortem docs. It fits how you already work.',
      stat: '12+',
      label: 'integrations',
    },
  ]

  return (
    <section id="why" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-900/20 blur-[150px] pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <GradientBadge icon={Star}>Why Sentinel-SRE</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Not just another<br />observability tool
            </h2>
            <p className="mt-5 text-white/50 text-lg">
              Sentinel-SRE is the reasoning layer your dashboards have been waiting for.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5">
          {reasons.map((r, i) => (
            <FadeIn key={r.title} delay={i * 0.05}>
              <div className="group relative rounded-2xl glass p-7 h-full overflow-hidden hover:border-white/15 transition-all duration-500">
                <div className="absolute -top-16 -right-16 w-52 h-52 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex items-start justify-between gap-6 relative">
                  <div className="flex-1">
                    <div className="w-10 h-10 rounded-lg glass flex items-center justify-center mb-4">
                      <r.icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">{r.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed max-w-md">{r.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-semibold text-gradient-blue">{r.stat}</div>
                    <div className="text-xs text-white/40 mt-1">{r.label}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

/* =========================================================
   DEVELOPER FOCUS
   ========================================================= */

const DeveloperFocus = () => {
  return (
    <section id="developers" className="relative py-28 lg:py-36">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <FadeIn>
            <div>
              <GradientBadge icon={Code2}>Built for engineers</GradientBadge>
              <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
                Wire it up in<br />under a minute
              </h2>
              <p className="mt-5 text-white/55 text-lg leading-relaxed">
                A clean API, typed SDKs, and zero-config OpenTelemetry support. Sentinel
                fits the way you already ship code.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  'TypeScript, Go, Python, and Rust SDKs',
                  'OpenTelemetry-native — drop-in collector',
                  'Webhooks for PagerDuty, Slack, Linear, Jira',
                  'Terraform provider for infra-as-code setups',
                ].map((item: any) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <GlowButton variant="secondary" href="#" icon={Github}>
                  Read the docs
                </GlowButton>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.2} y={40}>
            <CodeBlock />
          </FadeIn>
        </div>
      </div>
    </section>
  )
}

const CodeBlock = () => {
  const lines = [
    { t: '// Instrument in seconds. Ship resilient.', c: 'text-white/30' },
    { t: 'import { Sentinel } from "@sentinel-sre/sdk";', c: 'text-pink-300' },
    { t: '', c: '' },
    { t: 'const sentinel = new Sentinel({', c: 'text-white/80' },
    { t: '  apiKey: process.env.SENTINEL_API_KEY,', c: 'text-white/80' },
    { t: '  service: "checkout-api",', c: 'text-white/80' },
    { t: '  env: "production",', c: 'text-white/80' },
    { t: '});', c: 'text-white/80' },
    { t: '', c: '' },
    { t: '// Report anomalies — or let auto-detect do it', c: 'text-white/30' },
    { t: 'await sentinel.incident.create({', c: 'text-cyan-300' },
    { t: '  title: "5xx spike on /checkout",', c: 'text-emerald-300' },
    { t: '  severity: "critical",', c: 'text-emerald-300' },
    { t: '  signals: await collectSignals(),', c: 'text-emerald-300' },
    { t: '});', c: 'text-cyan-300' },
    { t: '', c: '' },
    { t: '// → AI RCA generated in 2.1s ✓', c: 'text-emerald-400/80' },
  ]

  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-3xl rounded-full opacity-50" />
      <div className="relative rounded-2xl glass-strong glow-border overflow-hidden shadow-[0_40px_80px_-20px_rgba(79,70,229,0.35)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/40">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/50 font-mono ml-3">
            <Terminal className="w-3 h-3" />
            app.ts
          </div>
        </div>
        <pre className="p-5 text-[13px] leading-relaxed font-mono overflow-x-auto">
          <code>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-white/20 select-none w-5 text-right">{i + 1}</span>
                <span className={l.c}>{l.t || '\u00A0'}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

/* =========================================================
   TESTIMONIALS
   ========================================================= */

const Testimonials = () => {
  const items = [
    {
      quote: 'Sentinel-SRE reduced our debugging time by 70%. It caught a memory leak our dashboards had missed for two weeks.',
      name: 'Priya Raghavan',
      role: 'Staff SRE · Fintech scale-up',
      avatar: 'PR',
      accent: 'from-indigo-500 to-purple-500',
    },
    {
      quote: "It's like having an AI SRE on-call. The postmortems alone pay for the product — saves us hours per incident.",
      name: 'Marcus Feldman',
      role: 'Head of Platform · B2B SaaS',
      avatar: 'MF',
      accent: 'from-cyan-500 to-blue-500',
    },
    {
      quote: 'The chaos simulator found three resilience bugs before our peak launch. We would have taken a Sev-1.',
      name: 'Alicia Okafor',
      role: 'Principal Engineer · E-commerce',
      avatar: 'AO',
      accent: 'from-pink-500 to-orange-500',
    },
    {
      quote: "Confidence scoring is the killer feature. I actually trust the AI verdicts now — because it tells me when it's unsure.",
      name: 'Daniel Kwon',
      role: 'SRE Lead · Streaming platform',
      avatar: 'DK',
      accent: 'from-emerald-500 to-teal-500',
    },
  ]

  return (
    <section className="relative py-28 lg:py-36 overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <GradientBadge icon={Star}>Loved by SRE teams</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Reliability, rebuilt<br />by engineers who ship
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5">
          {items.map((t, i) => (
            <FadeIn key={t.name} delay={i * 0.05}>
              <div className="group relative rounded-2xl glass p-7 h-full hover:border-white/15 transition-all duration-500">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_: any, i: number) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-white/85 text-lg leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.accent} flex items-center justify-center font-semibold text-sm text-white`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{t.name}</div>
                    <div className="text-xs text-white/50">{t.role}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

/* =========================================================
   FINAL CTA
   ========================================================= */

const FinalCTA = () => {
  return (
    <section id="cta" className="relative py-28 lg:py-36">
      <div className="container mx-auto px-4 lg:px-8">
        <FadeIn>
          <div className="relative rounded-3xl overflow-hidden glass-strong p-10 lg:p-20 text-center">
            {/* gradient orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30 blur-[120px] animate-pulse-slow pointer-events-none" />
            <div className="absolute inset-0 grid-bg radial-fade pointer-events-none" />

            <div className="relative">
              <GradientBadge icon={Sparkles}>Ready to ship resilience</GradientBadge>
              <h2 className="mt-6 text-4xl lg:text-6xl font-semibold tracking-tight text-gradient max-w-3xl mx-auto">
                Start building resilient<br />systems today
              </h2>
              <p className="mt-6 text-white/60 text-lg max-w-xl mx-auto">
                Deploy Sentinel-SRE in minutes. Watch incidents resolve themselves.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <GlowButton variant="primary" href="/dashboard" icon={ArrowRight}>
                  Launch Dashboard
                </GlowButton>
                <GlowButton variant="secondary" href="#" icon={Github}>
                  Star on GitHub
                </GlowButton>
              </div>
              <div className="mt-8 text-xs text-white/40">
                Free for teams under 5 · No credit card
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

/* =========================================================
   FOOTER
   ========================================================= */

const Footer = () => {
  return (
    <footer className="relative pt-16 pb-10 border-t border-white/5">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-5 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Sentinel-SRE</span>
            </div>
            <p className="text-sm text-white/50 max-w-xs leading-relaxed">
              AI-powered root cause analysis and automated postmortems for modern systems.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a href="#" className="w-9 h-9 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition-colors">
                <Github className="w-4 h-4 text-white/70" />
              </a>
            </div>
          </div>

          <FooterCol
            title="Product"
            links={['Features', 'How it works', 'Changelog', 'Pricing', 'Roadmap']}
          />
          <FooterCol
            title="Developers"
            links={['Docs', 'API reference', 'SDKs', 'Status', 'GitHub']}
          />
          <FooterCol
            title="Company"
            links={['About', 'Blog', 'Careers', 'Security', 'Contact']}
          />
        </div>

        <div className="mt-14 pt-6 border-t border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © 2025 Sentinel-SRE · Built with Next.js, Tailwind, and Framer Motion
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/40">
            <span>Crafted by the Sentinel team</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Privacy</span>
            <span>Terms</span>
            <span>Security</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

interface FooterColProps {
  title: string;
  links: string[];
}

const FooterCol = ({ title, links }: FooterColProps) => (
  <div>
    <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
    <ul className="space-y-2.5">
      {links.map((l) => (
        <li key={l}>
          <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">
            {l}
          </a>
        </li>
      ))}
    </ul>
  </div>
)

/* =========================================================
   INTEGRATIONS
   ========================================================= */

const Integrations = () => {
  const integrations = [
    { name: 'Prometheus', color: '#E6522C', tag: 'Metrics' },
    { name: 'OpenTelemetry', color: '#F5A800', tag: 'Tracing' },
    { name: 'Grafana', color: '#F46800', tag: 'Dashboards' },
    { name: 'Datadog', color: '#632CA6', tag: 'Observability' },
    { name: 'Loki', color: '#FFD700', tag: 'Logs' },
    { name: 'Jaeger', color: '#60D0E4', tag: 'Tracing' },
    { name: 'Kubernetes', color: '#326CE5', tag: 'Orchestration' },
    { name: 'AWS CloudWatch', color: '#FF9900', tag: 'Cloud' },
    { name: 'PagerDuty', color: '#06AC38', tag: 'Alerts' },
    { name: 'Slack', color: '#E01E5A', tag: 'Comms' },
    { name: 'GitHub', color: '#FFFFFF', tag: 'Source' },
    { name: 'Elasticsearch', color: '#00BFB3', tag: 'Search' },
  ]

  return (
    <section id="integrations" className="relative py-28 lg:py-36">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950/40 to-black pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <GradientBadge icon={Plug}>Integrations</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Plugs into every<br />tool your team already uses
            </h2>
            <p className="mt-5 text-white/50 text-lg">
              Bring your own stack. Sentinel-SRE reasons across logs, metrics, traces, and alerts — wherever they live.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {integrations.map((tool: any, i: number) => (
            <FadeIn key={tool.name} delay={i * 0.03}>
              <IntegrationCard {...tool} />
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-10 text-center text-sm text-white/40">
            ...and 40+ more via our open API.{' '}
            <a href="#developers" className="text-white/80 hover:text-white underline underline-offset-4">
              See the full list →
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

interface IntegrationCardProps {
  name: string;
  color: string;
  tag: string;
}

const IntegrationCard = ({ name, color, tag }: IntegrationCardProps) => {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="group relative rounded-2xl glass p-5 h-full flex items-center gap-4 overflow-hidden hover:border-white/15 transition-all duration-500 hover:-translate-y-0.5">
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700"
        style={{ backgroundColor: color }}
      />
      <div className="relative w-11 h-11 rounded-xl glass flex items-center justify-center shrink-0 border border-white/10 group-hover:scale-110 transition-transform duration-500">
        <span
          className="text-sm font-bold"
          style={{ color, textShadow: `0 0 18px ${color}80` }}
        >
          {initials}
        </span>
      </div>
      <div className="relative min-w-0">
        <div className="text-sm font-semibold text-white truncate">{name}</div>
        <div className="text-[11px] text-white/40 mt-0.5 uppercase tracking-wider">{tag}</div>
      </div>
      <CheckCircle2 className="relative ml-auto w-4 h-4 text-emerald-400/70 shrink-0" />
    </div>
  )
}

/* =========================================================
   CHAOS SIMULATOR (interactive)
   ========================================================= */

const ChaosSimulator = () => {
  const services = [
    { id: 'api-gateway', label: 'api-gateway', desc: 'Edge routing · 12 instances' },
    { id: 'checkout-service', label: 'checkout-service', desc: 'Payment flow · 8 instances' },
    { id: 'auth-service', label: 'auth-service', desc: 'OAuth + JWT · 6 instances' },
    { id: 'search-service', label: 'search-service', desc: 'ElasticSearch · 10 instances' },
  ]

  const failures = [
    { id: 'network-latency', label: 'Network Latency', icon: Network, desc: '+500ms p99 delay' },
    { id: 'db-pool-exhaust', label: 'DB Pool Exhaustion', icon: Database, desc: 'Max conns 1000/1000' },
    { id: 'cpu-spike', label: 'CPU Spike', icon: Cpu, desc: '95%+ sustained' },
    { id: 'memory-leak', label: 'Memory Leak', icon: MemoryStick, desc: '+80MB/min heap' },
    { id: 'service-crash', label: 'Pod Restart Loop', icon: ServerCrash, desc: 'CrashLoopBackOff' },
  ]

  // Precomputed realistic RCA responses per combination (selected ones + fallback)
  const rcaMap: { [key: string]: any } = {
    'api-gateway|network-latency': {
      cause: 'Upstream DNS resolver in us-east-1 experiencing 500ms timeouts. Route53 health checks flapping across AZs, forcing gateway to retry failovers. Fix: pin resolver config + reduce DNS TTL to 30s.',
      confidence: 91,
      impact: 'p99 4.2s',
      blast: '12% of requests',
      signals: ['DNS failures +340%', 'Gateway retries +210%', 'TCP re-transmits 4.8%'],
    },
    'api-gateway|db-pool-exhaust': {
      cause: 'Gateway connection pool saturated after recent v4.2 rollout introduced synchronous DB lookup in auth middleware. Connections leak because error path skips .release().',
      confidence: 96,
      impact: '5xx 14.2%',
      blast: 'All downstream services',
      signals: ['DB conn 1000/1000', 'Auth latency +820%', 'Middleware p95 3.1s'],
    },
    'checkout-service|db-pool-exhaust': {
      cause: 'Primary Postgres replica saturated by long-running analytics query introduced in v3.9. Pool queue depth exceeds 200. Fix: move analytics to read-replica + add pool backpressure.',
      confidence: 94,
      impact: 'Checkout fail 8.7%',
      blast: 'Revenue path',
      signals: ['DB conn 980/1000', 'Query p99 12s', 'Pool wait 4.2s'],
    },
    'checkout-service|network-latency': {
      cause: 'Stripe API egress experiencing regional slowdown in EU-West-1. Timeout cascades to our retry logic (exponential backoff creating 8s blocking calls).',
      confidence: 88,
      impact: 'Order TTFB 6s',
      blast: 'EU cart conversions',
      signals: ['Stripe p95 3.8s', 'Retry rate +420%', 'Queue depth 180'],
    },
    'auth-service|memory-leak': {
      cause: 'Session cache TTL regression in v3.12 — entries marked "evicted" are retained by a listener closure in the cache warmup worker. Heap grows ~80MB/min.',
      confidence: 92,
      impact: 'GC pauses 180ms',
      blast: 'Login latency +240%',
      signals: ['Heap 78%', 'GC frequency +310%', 'Evict-retained 42k objects'],
    },
    'auth-service|cpu-spike': {
      cause: 'JWT verification switched to RS512 in v3.11 but still running on t3.medium instances. CPU saturates at 50 RPS — needs c6i.large or caching layer.',
      confidence: 89,
      impact: 'Auth p99 2.4s',
      blast: 'All authenticated traffic',
      signals: ['CPU 94%', 'JWT verify p95 480ms', 'Context switches 12k/s'],
    },
    'search-service|cpu-spike': {
      cause: 'ElasticSearch query plan regressed after mapping change — now performs full scan on 2TB index. Offending query: /search?filter=status:all&sort=_score.',
      confidence: 93,
      impact: 'Search p99 8s',
      blast: 'Discovery pages',
      signals: ['CPU 97%', 'Doc scan 2.1B/s', 'Hot shard imbalance 4.2x'],
    },
    'search-service|service-crash': {
      cause: 'OOMKilled on data nodes — heap sized at 16G but JVM direct buffers consuming additional 12G after Lucene upgrade in v8.14. Increase node memory or tune direct buffer pool.',
      confidence: 90,
      impact: '2 pods flapping',
      blast: 'Search availability 92%',
      signals: ['OOM events 11', 'Direct buffer 12.4G', 'Restart rate 4/5m'],
    },
    default: {
      cause: 'Rolling deploy of v4.3 correlates with error spike. Cross-referencing telemetry suggests a misconfigured environment variable cascading failures through dependent services.',
      confidence: 84,
      impact: 'Error +180%',
      blast: 'Partial',
      signals: ['Deploy t-120s', 'Error bursts correlated', 'Health checks 3/5'],
    },
  }

  const [service, setService] = useState('checkout-service')
  const [failure, setFailure] = useState('db-pool-exhaust')
  const [phase, setPhase] = useState('idle') // idle | injecting | detecting | analyzing | done
  const [events, setEvents] = useState<any[]>([])

  const result = rcaMap[`${service}|${failure}`] || rcaMap.default
  const serviceLabel = services.find(s => s.id === service)?.label
  const failureLabel = failures.find(f => f.id === failure)?.label

  const timers = useRef<NodeJS.Timeout[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const injectFailure = () => {
    if (phase !== 'idle' && phase !== 'done') return
    setEvents([])
    setPhase('injecting')
    timers.current.forEach(clearTimeout)
    timers.current = []

    const t = (ms: number, fn: () => void) => {
      const timeout = setTimeout(fn, ms);
      timers.current.push(timeout);
    }

    t(300, () =>
      setEvents(e => [...e, { time: 't+0.3s', type: 'inject', text: `Injecting "${failureLabel}" into ${serviceLabel}` }])
    )
    t(900, () => {
      setEvents(e => [...e, { time: 't+0.9s', type: 'signal', text: 'Anomaly detector triggered on error-rate baseline' }])
      setPhase('detecting')
    })
    t(1500, () =>
      setEvents(e => [...e, { time: 't+1.5s', type: 'signal', text: 'Correlated upstream signals: 3 services, 14 metrics' }])
    )
    t(2100, () => {
      setEvents(e => [...e, { time: 't+2.1s', type: 'ai', text: 'AI ensemble ranking 7 hypotheses...' }])
      setPhase('analyzing')
    })
    t(3100, () =>
      setEvents(e => [...e, { time: 't+3.1s', type: 'ai', text: 'Top hypothesis confirmed against historical incidents' }])
    )
    t(3800, () => {
      setEvents(e => [...e, { time: 't+3.8s', type: 'done', text: 'Root cause verdict generated · confidence calibrated' }])
      setPhase('done')
    })
  }

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('idle')
    setEvents([])
  }

  const isBusy = phase === 'injecting' || phase === 'detecting' || phase === 'analyzing'

  return (
    <section id="chaos" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] rounded-full bg-orange-500/10 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <GradientBadge icon={Flame}>Live chaos demo · interactive</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Inject a failure.<br />Watch Sentinel diagnose it.
            </h2>
            <p className="mt-5 text-white/50 text-lg">
              Pick a service and a failure mode. Our AI engine will analyze, correlate, and return a root cause in seconds — right here, in your browser.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1} y={30}>
          <div className="relative max-w-6xl mx-auto">
            <div className="absolute -inset-6 bg-gradient-to-r from-orange-500/20 via-red-500/10 to-indigo-500/20 blur-3xl rounded-full opacity-60" />
            <div className="relative rounded-2xl glass-strong glow-border overflow-hidden shadow-[0_50px_120px_-20px_rgba(239,68,68,0.25)]">
              {/* titlebar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/40">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 text-center text-xs text-white/40 font-mono">
                  sentinel-sre.io/chaos-lab
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${
                    phase === 'idle' ? 'bg-white/5 text-white/50' :
                    phase === 'done' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-orange-500/15 text-orange-400'
                  }`}>
                    <span className="relative flex h-1.5 w-1.5">
                      {isBusy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        phase === 'idle' ? 'bg-white/40' :
                        phase === 'done' ? 'bg-emerald-500' : 'bg-orange-500'
                      }`}></span>
                    </span>
                    {phase === 'idle' ? 'Ready' : phase === 'done' ? 'Complete' : 'Analyzing'}
                  </span>
                </div>
              </div>

              <div className="grid lg:grid-cols-12 min-h-[560px]">
                {/* LEFT — Controls */}
                <div className="lg:col-span-5 p-6 lg:p-7 border-b lg:border-b-0 lg:border-r border-white/5 space-y-6 bg-black/20">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 mb-3">
                      1 · Select service
                    </label>
                    <div className="space-y-2">
                      {services.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => !isBusy && setService(s.id)}
                          disabled={isBusy}
                          className={`w-full text-left rounded-xl px-3.5 py-2.5 border transition-all ${
                            service === s.id
                              ? 'border-indigo-500/40 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_0_30px_-5px_rgba(99,102,241,0.5)]'
                              : 'border-white/8 bg-white/[0.02] hover:bg-white/5'
                          } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono text-white">{s.label}</span>
                            {service === s.id && (
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                            )}
                          </div>
                          <div className="text-xs text-white/40 mt-0.5">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 mb-3">
                      2 · Select failure mode
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {failures.map((f: any) => (
                        <button
                          key={f.id}
                          onClick={() => !isBusy && setFailure(f.id)}
                          disabled={isBusy}
                          className={`rounded-xl px-3.5 py-2.5 border transition-all flex items-center gap-3 ${
                            failure === f.id
                              ? 'border-orange-500/40 bg-orange-500/10 shadow-[0_0_0_1px_rgba(249,115,22,0.25),0_0_30px_-5px_rgba(249,115,22,0.5)]'
                              : 'border-white/8 bg-white/[0.02] hover:bg-white/5'
                          } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            failure === f.id ? 'bg-orange-500/20 text-orange-300' : 'bg-white/5 text-white/60'
                          }`}>
                            <f.icon className="w-4 h-4" />
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className="text-sm font-medium text-white">{f.label}</div>
                            <div className="text-xs text-white/40">{f.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={injectFailure}
                      disabled={isBusy}
                      className={`group relative flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                        isBusy
                          ? 'bg-white/10 text-white/50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]'
                      }`}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Running simulation...
                        </>
                      ) : phase === 'done' ? (
                        <>
                          <Flame className="w-4 h-4" /> Run again
                        </>
                      ) : (
                        <>
                          <Flame className="w-4 h-4" /> Inject Failure
                        </>
                      )}
                    </button>
                    {phase === 'done' && (
                      <button
                        onClick={reset}
                        className="px-4 py-3 rounded-xl glass text-white/70 hover:text-white hover:bg-white/10 text-sm"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-white/30 text-center">
                    Simulations run in a sandboxed environment · no real traffic affected
                  </p>
                </div>

                {/* RIGHT — Live feed + result */}
                <div className="lg:col-span-7 p-6 lg:p-7 bg-gradient-to-br from-transparent to-indigo-950/10 flex flex-col gap-4">
                  {/* Event timeline */}
                  <div className="glass rounded-xl p-4 flex-1 min-h-[200px]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-medium text-white">Live telemetry</span>
                      </div>
                      <span className="text-[11px] text-white/40 font-mono">stream</span>
                    </div>
                    <div className="space-y-2 font-mono text-xs">
                      {events.length === 0 && (
                        <div className="text-white/30 italic py-8 text-center">
                          Awaiting failure injection...
                        </div>
                      )}
                      <AnimatePresence>
                        {events.map((e: any, i: number) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-3"
                          >
                            <span className="text-white/30 w-14 shrink-0">{e.time}</span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                e.type === 'inject'
                                  ? 'bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]'
                                  : e.type === 'signal'
                                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                                  : e.type === 'ai'
                                  ? 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]'
                                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                              }`}
                            />
                            <span className={`flex-1 ${
                              e.type === 'done' ? 'text-emerald-300' : 'text-white/75'
                            }`}>
                              {e.text}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* AI Verdict */}
                  <AnimatePresence mode="wait">
                    {phase === 'done' ? (
                      <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="relative glass rounded-xl p-5 border border-indigo-500/30 overflow-hidden"
                      >
                        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl" />
                        <div className="relative">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                <Brain className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-white">AI Root Cause Verdict</div>
                                <div className="text-[11px] text-white/40 font-mono">
                                  ensemble · gpt · claude · llama-405b
                                </div>
                              </div>
                            </div>
                            <ConfidenceBadge value={result.confidence} />
                          </div>

                          <p className="text-sm text-white/80 leading-relaxed">
                            {result.cause}
                          </p>

                          <div className="grid grid-cols-3 gap-2 mt-4">
                            <StatPill label="Impact" value={result.impact} tint="text-red-400" />
                            <StatPill label="Blast radius" value={result.blast} tint="text-orange-400" />
                            <StatPill label="Signals" value={`${result.signals.length} correlated`} tint="text-cyan-400" />
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {result.signals.map((s: string, i: number) => (
                              <span
                                key={i}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10"
                              >
                                {s}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2 mt-4">
                            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90">
                              Generate postmortem <ArrowRight className="w-3 h-3" />
                            </button>
                            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-white/80 text-xs font-medium hover:bg-white/10">
                              Apply suggested fix
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="glass rounded-xl p-6 border border-white/5 flex items-center gap-4"
                      >
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                          <Brain className="w-5 h-5 text-white/40" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white/80">AI Root Cause Verdict</div>
                          <div className="text-xs text-white/40 mt-0.5">
                            Will appear here after the simulation completes.
                          </div>
                        </div>
                        {isBusy && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

interface StatPillProps {
  label: string;
  value: string | number;
  tint: string;
}

const StatPill = ({ label, value, tint }: StatPillProps) => (
  <div className="rounded-lg bg-white/[0.03] border border-white/8 px-2.5 py-2">
    <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    <div className={`text-xs font-semibold mt-0.5 ${tint}`}>{value}</div>
  </div>
)

/* =========================================================
   PRICING
   ========================================================= */

const Pricing = () => {
  const tiers = [
    {
      name: 'Starter',
      icon: Rocket,
      price: 'Free',
      priceSub: 'forever',
      desc: 'For small teams wiring up their first reliability loop.',
      cta: 'Start free',
      featured: false,
      features: [
        'Up to 5 engineers',
        '1,000 incidents / month',
        '7-day telemetry retention',
        'AI Root Cause Analysis',
        'Basic postmortem templates',
        'Slack + GitHub integrations',
        'Community support',
      ],
      accent: 'from-cyan-500/20 to-blue-500/20',
      ring: 'ring-white/10',
    },
    {
      name: 'Pro',
      icon: Bolt,
      price: '$49',
      priceSub: 'per engineer / mo',
      desc: 'For growing SRE teams running production at scale.',
      cta: 'Start 14-day trial',
      featured: true,
      badge: 'Most popular',
      features: [
        'Unlimited engineers',
        'Unlimited incidents',
        '90-day telemetry retention',
        'Advanced AI ensemble (GPT + Claude)',
        'Chaos Engineering Simulator',
        'Confidence scoring + eval dashboard',
        'PagerDuty, Jira, Linear, Grafana',
        'Automated postmortems',
        'Priority support · 99.9% SLA',
      ],
      accent: 'from-indigo-500/30 via-purple-500/30 to-pink-500/30',
      ring: 'ring-indigo-500/40',
    },
    {
      name: 'Enterprise',
      icon: Crown,
      price: 'Custom',
      priceSub: 'tailored to you',
      desc: 'For platform orgs with complex compliance needs.',
      cta: 'Talk to sales',
      featured: false,
      features: [
        'Everything in Pro',
        'Self-hosted / on-prem deploy',
        'Unlimited retention',
        'Private model fine-tuning',
        'SSO / SAML / SCIM',
        'SOC 2 Type II + HIPAA',
        'Dedicated success engineer',
        'Custom integrations',
        '99.99% SLA + audit logs',
      ],
      accent: 'from-amber-500/20 to-rose-500/20',
      ring: 'ring-white/10',
    },
  ]

  return (
    <section id="pricing" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] rounded-full bg-indigo-900/20 blur-[150px] pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <GradientBadge icon={Sparkles}>Pricing</GradientBadge>
            <h2 className="mt-5 text-4xl lg:text-5xl font-semibold tracking-tight text-gradient">
              Simple pricing<br />that scales with reliability
            </h2>
            <p className="mt-5 text-white/50 text-lg">
              Start free. Upgrade when your system demands it. No per-incident fees — ever.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch">
          {tiers.map((tier: any, i: number) => (
            <FadeIn key={tier.name} delay={i * 0.08}>
              <PricingCard {...tier} />
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-white/40">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Cancel anytime</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 14-day Pro trial</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Migrate data in minutes</span>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

interface PricingCardProps {
  name: string;
  icon: any;
  price: string;
  priceSub: string;
  desc: string;
  cta: string;
  features: string[];
  featured?: boolean;
  badge?: string;
  accent: string;
  ring: string;
}

const PricingCard = ({ name, icon: Icon, price, priceSub, desc, cta, features, featured, badge, accent, ring }: PricingCardProps) => (
  <div
    className={`relative h-full flex flex-col rounded-2xl p-7 transition-all duration-500 hover:-translate-y-1 ${
      featured
        ? 'glass-strong ring-1 ring-indigo-500/40 shadow-[0_40px_100px_-20px_rgba(99,102,241,0.45)]'
        : `glass ring-1 ${ring}`
    } overflow-hidden`}
  >
    {/* background glow */}
    <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br ${accent} blur-3xl ${
      featured ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
    } transition-opacity duration-700 pointer-events-none`} />

    {featured && badge && (
      <div className="absolute top-5 right-5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]">
          <Sparkles className="w-3 h-3" /> {badge}
        </span>
      </div>
    )}

    <div className="relative flex-1 flex flex-col">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          featured
            ? 'bg-gradient-to-br from-indigo-500 to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'
            : 'glass'
        }`}>
          <Icon className={`w-4 h-4 ${featured ? 'text-white' : 'text-white/80'}`} />
        </div>
        <h3 className="text-xl font-semibold text-white">{name}</h3>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-semibold ${featured ? 'text-gradient-blue' : 'text-white'}`}>
            {price}
          </span>
          <span className="text-sm text-white/40">· {priceSub}</span>
        </div>
      </div>

      <p className="text-sm text-white/55 leading-relaxed mb-6">{desc}</p>

      <a
        href="#cta"
        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all mb-6 ${
          featured
            ? 'bg-white text-black hover:bg-white/90 shadow-[0_0_30px_rgba(255,255,255,0.2)]'
            : 'glass text-white hover:bg-white/10'
        }`}
      >
        {cta} <ArrowRight className="w-4 h-4" />
      </a>

      <div className="border-t border-white/5 pt-5 space-y-2.5">
        {features.map((f: any, i: number) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${
              featured ? 'text-indigo-400' : 'text-emerald-400/80'
            }`} />
            <span className="text-white/75 leading-relaxed">{f}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
)

/* =========================================================
   APP
   ========================================================= */

const App = () => {
  return (
    <main className="relative min-h-screen bg-black text-white selection:bg-indigo-500/30">
      <Nav />
      <Hero />
      <Integrations />
      <Features />
      <ChaosSimulator />
      <HowItWorks />
      <WhySentinel />
      <DeveloperFocus />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <Footer />
    </main>
  )
}

export default App
