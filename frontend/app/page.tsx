'use client'

import { useState, useEffect, useRef } from 'react'
import { m as motion, AnimatePresence, useInView, LazyMotion, domAnimation } from 'framer-motion'
import {
  Brain,
  Zap,
  ArrowRight,
  Github,
  Activity,
  Shield,
  Sparkles,
  Cpu,
  Radio,
  Gauge,
  Database,
  Menu,
  X,
  Loader2,
  Flame,
  Network,
  MemoryStick,
  ServerCrash,
  GitBranch,
  RefreshCw,
  FileText,
  Layers,
  Check,
  Copy,
  Terminal,
  FileCode,
  Plug,
} from 'lucide-react'

/* =========================================================
   MOTION WRAPPER
   ========================================================= */

function MotionWrap({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}

/* =========================================================
   REUSABLE PRIMITIVES
   ========================================================= */

function FadeIn({ children, delay = 0, y = 30, className = '' }: {
  children: React.ReactNode; delay?: number; y?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* =========================================================
   NAVBAR — Floating glass pill
   ========================================================= */

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 inset-x-0 z-50 px-4 pt-4"
    >
      <div className={`max-w-5xl mx-auto rounded-2xl border transition-all duration-500 ${
        scrolled
          ? 'bg-black/70 backdrop-blur-2xl border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.5)]'
          : 'bg-transparent border-transparent'
      }`}>
        <div className="flex items-center justify-between px-5 py-3">
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-[15px] text-white tracking-tight">Sentinel</span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {['Features', 'Demo', 'How it works'].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/\s/g, '-')}`}
                className="px-3.5 py-1.5 text-[13px] text-white/50 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <a href="/login" className="text-[13px] text-white/50 hover:text-white transition-colors">
              Sign in
            </a>
            <a
              href="/register"
              className="px-4 py-2 text-[13px] font-medium rounded-full bg-white text-black hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              Get Started
            </a>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-white/60" aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/[0.06] px-5 pb-4 pt-2 space-y-1"
            >
              {['Features', 'Demo', 'How it works'].map((label) => (
                <a key={label} href={`#${label.toLowerCase().replace(/\s/g, '-')}`} onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-white/60 hover:text-white rounded-lg hover:bg-white/5">
                  {label}
                </a>
              ))}
              <a href="/register" className="block mt-3 text-center px-4 py-2.5 rounded-full bg-white text-black text-sm font-medium">
                Get Started
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  )
}

/* =========================================================
   HERO — Cinematic, minimal, high-impact
   ========================================================= */

function Hero() {
  return (
    <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
      {/* Ambient gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-orange-500/[0.07] blur-[120px] animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.05] blur-[100px] animate-blob" style={{ animationDelay: '6s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-purple-500/[0.03] blur-[150px]" />
      </div>

      {/* Subtle grid */}
      <div className="absolute inset-0 bg-dot-grid opacity-40" />

      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_50%,rgba(0,0,0,0.8)_100%)]" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 text-center pt-32 pb-24">
        {/* Announcement pill */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm mb-8"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
          </span>
          <span className="text-[13px] text-white/70">Now with Chaos Engineering v2.0</span>
          <ArrowRight className="w-3 h-3 text-white/40" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-[clamp(2.5rem,7vw,5.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white"
        >
          Incidents diagnosed
          <br />
          <span className="bg-gradient-to-r from-orange-400 via-orange-300 to-amber-400 bg-clip-text text-transparent">
            before you get paged
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="mt-6 text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed"
        >
          Sentinel-SRE correlates signals, runs chaos simulations, and delivers
          root cause verdicts with calibrated confidence — in seconds, not hours.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="/register"
            className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-white text-black text-sm font-semibold hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all duration-300 hover:-translate-y-0.5"
          >
            Start for free
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/[0.12] text-white/80 text-sm font-medium hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <Flame className="w-4 h-4 text-orange-400" />
            Live Demo
          </a>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-[13px] text-white/30"
        >
          {['Prometheus', 'Grafana', 'Kubernetes', 'Datadog', 'PagerDuty'].map((name) => (
            <span key={name} className="hover:text-white/50 transition-colors cursor-default">{name}</span>
          ))}
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  )
}

/* =========================================================
   FEATURES — Bento grid layout
   ========================================================= */

function Features() {
  const features = [
    {
      icon: Brain,
      title: 'AI Root Cause Analysis',
      desc: 'Multi-model LLM ensemble correlates logs, metrics, and traces to surface the true cause.',
      gradient: 'from-orange-500/20 to-orange-600/5',
      iconColor: 'text-orange-400',
      span: 'md:col-span-2',
    },
    {
      icon: GitBranch,
      title: 'Chaos Engineering',
      desc: 'Inject failures safely. Validate resilience before users feel it.',
      gradient: 'from-pink-500/15 to-pink-600/5',
      iconColor: 'text-pink-400',
      span: '',
    },
    {
      icon: Gauge,
      title: 'Confidence Scoring',
      desc: 'Every verdict ships with a calibrated confidence score.',
      gradient: 'from-emerald-500/15 to-emerald-600/5',
      iconColor: 'text-emerald-400',
      span: '',
    },
    {
      icon: RefreshCw,
      title: 'Self-Improving RAG',
      desc: 'Engineers rate explanations. The system gets smarter with every incident.',
      gradient: 'from-cyan-500/15 to-cyan-600/5',
      iconColor: 'text-cyan-400',
      span: '',
    },
    {
      icon: FileText,
      title: 'Auto Postmortems',
      desc: 'Structured, blameless postmortems generated in seconds. Ready to publish.',
      gradient: 'from-violet-500/15 to-violet-600/5',
      iconColor: 'text-violet-400',
      span: '',
    },
    {
      icon: Layers,
      title: 'Unified Telemetry',
      desc: 'Prometheus, Datadog, OpenTelemetry — Sentinel reasons across all of it.',
      gradient: 'from-amber-500/15 to-amber-600/5',
      iconColor: 'text-amber-400',
      span: 'md:col-span-2',
    },
  ]

  return (
    <section id="features" className="relative py-32">
      <div className="max-w-6xl mx-auto px-4">
        <FadeIn>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[12px] text-white/60 mb-4">
              <Zap className="w-3 h-3 text-orange-400" />
              Core capabilities
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Everything you need to
              <br />
              <span className="text-white/60">ship with confidence</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.05} className={f.span}>
              <div className={`group relative h-full rounded-2xl border border-white/[0.06] bg-gradient-to-br ${f.gradient} p-6 sm:p-8 transition-all duration-500 hover:border-white/[0.12] hover:-translate-y-0.5 overflow-hidden`}>
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-br from-white/[0.02] to-transparent" />
                <div className="relative">
                  <div className={`w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center mb-4`}>
                    <f.icon className={`w-5 h-5 ${f.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
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
   HOW IT WORKS — Horizontal timeline
   ========================================================= */

function HowItWorks() {
  const steps = [
    { icon: Radio, title: 'Ingest', desc: 'Stream logs, metrics, traces from your stack.' },
    { icon: Activity, title: 'Detect', desc: 'Baseline-aware anomaly detection catches drift.' },
    { icon: Brain, title: 'Analyze', desc: 'Multi-model AI ranks hypotheses and delivers a verdict.' },
    { icon: RefreshCw, title: 'Learn', desc: 'Feedback loop refines reasoning every cycle.' },
  ]

  return (
    <section id="how-it-works" className="relative py-32">
      <div className="max-w-6xl mx-auto px-4">
        <FadeIn>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[12px] text-white/60 mb-4">
              <Cpu className="w-3 h-3 text-orange-400" />
              How it works
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Signal to postmortem
              <br />
              <span className="text-white/60">in four steps</span>
            </h2>
          </div>
        </FadeIn>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden lg:block absolute top-12 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <FadeIn key={step.title} delay={i * 0.1}>
                <div className="text-center lg:text-left">
                  <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-white/[0.08] bg-white/[0.02] mb-5">
                    <step.icon className="w-6 h-6 text-white/80" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-orange-500 text-[11px] font-bold text-white flex items-center justify-center shadow-lg">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1.5">{step.title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{step.desc}</p>
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
   CHAOS DEMO — Interactive simulator
   ========================================================= */

function ChaosDemo() {
  const services = [
    { id: 'api-gateway', label: 'api-gateway', desc: 'Edge routing · 12 pods' },
    { id: 'checkout-service', label: 'checkout-service', desc: 'Payment flow · 8 pods' },
    { id: 'auth-service', label: 'auth-service', desc: 'OAuth + JWT · 6 pods' },
    { id: 'search-service', label: 'search-service', desc: 'ElasticSearch · 10 pods' },
  ]

  const failures = [
    { id: 'network-latency', label: 'Network Latency', icon: Network, desc: '+500ms p99' },
    { id: 'db-pool-exhaust', label: 'DB Pool Exhaustion', icon: Database, desc: 'Max conns hit' },
    { id: 'cpu-spike', label: 'CPU Spike', icon: Cpu, desc: '95%+ sustained' },
    { id: 'memory-leak', label: 'Memory Leak', icon: MemoryStick, desc: '+80MB/min' },
    { id: 'service-crash', label: 'Pod Restart Loop', icon: ServerCrash, desc: 'CrashLoopBackOff' },
  ]

  const rcaMap: Record<string, any> = {
    'api-gateway|network-latency': {
      cause: 'Upstream DNS resolver in us-east-1 experiencing 500ms timeouts. Route53 health checks flapping, forcing gateway retries.',
      confidence: 91, impact: 'p99 4.2s', blast: '12% of requests',
      signals: ['DNS failures +340%', 'Gateway retries +210%', 'TCP re-transmits 4.8%'],
    },
    'api-gateway|db-pool-exhaust': {
      cause: 'Gateway connection pool saturated after v4.2 rollout introduced synchronous DB lookup in auth middleware. Connections leak on error path.',
      confidence: 96, impact: '5xx 14.2%', blast: 'All downstream',
      signals: ['DB conn 1000/1000', 'Auth latency +820%', 'Middleware p95 3.1s'],
    },
    'checkout-service|db-pool-exhaust': {
      cause: 'Primary Postgres saturated by long-running analytics query in v3.9. Pool queue depth exceeds 200.',
      confidence: 94, impact: 'Checkout fail 8.7%', blast: 'Revenue path',
      signals: ['DB conn 980/1000', 'Query p99 12s', 'Pool wait 4.2s'],
    },
    'auth-service|memory-leak': {
      cause: 'Session cache TTL regression in v3.12 — entries marked "evicted" retained by listener closure. Heap grows ~80MB/min.',
      confidence: 92, impact: 'GC pauses 180ms', blast: 'Login latency +240%',
      signals: ['Heap 78%', 'GC frequency +310%', 'Evict-retained 42k objects'],
    },
    'search-service|cpu-spike': {
      cause: 'ElasticSearch query plan regressed after mapping change — full scan on 2TB index.',
      confidence: 93, impact: 'Search p99 8s', blast: 'Discovery pages',
      signals: ['CPU 97%', 'Doc scan 2.1B/s', 'Hot shard imbalance 4.2x'],
    },
    default: {
      cause: 'Rolling deploy correlates with error spike. Cross-referencing telemetry suggests misconfigured env var cascading through dependent services.',
      confidence: 84, impact: 'Error +180%', blast: 'Partial',
      signals: ['Deploy t-120s', 'Error bursts correlated', 'Health checks 3/5'],
    },
  }

  const [service, setService] = useState('checkout-service')
  const [failure, setFailure] = useState('db-pool-exhaust')
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [events, setEvents] = useState<{ time: string; text: string; type: string }[]>([])
  const timers = useRef<NodeJS.Timeout[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const result = rcaMap[`${service}|${failure}`] || rcaMap.default

  const run = () => {
    if (phase === 'running') return
    setEvents([])
    setPhase('running')
    timers.current.forEach(clearTimeout)
    timers.current = []

    const t = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }
    t(300, () => setEvents(e => [...e, { time: '0.3s', type: 'inject', text: `Injecting failure into ${service}` }]))
    t(900, () => setEvents(e => [...e, { time: '0.9s', type: 'signal', text: 'Anomaly detector triggered' }]))
    t(1500, () => setEvents(e => [...e, { time: '1.5s', type: 'signal', text: 'Correlated 3 services, 14 metrics' }]))
    t(2200, () => setEvents(e => [...e, { time: '2.2s', type: 'ai', text: 'AI ranking 7 hypotheses...' }]))
    t(3200, () => setEvents(e => [...e, { time: '3.2s', type: 'ai', text: 'Top hypothesis confirmed via RAG' }]))
    t(3800, () => { setEvents(e => [...e, { time: '3.8s', type: 'done', text: 'Root cause verdict ready' }]); setPhase('done') })
  }

  const isRunning = phase === 'running'

  return (
    <section id="demo" className="relative py-32">
      <div className="max-w-6xl mx-auto px-4">
        <FadeIn>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[12px] text-white/60 mb-4">
              <Flame className="w-3 h-3 text-orange-400" />
              Interactive demo
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Inject a failure.
              <br />
              <span className="text-white/60">Watch AI diagnose it.</span>
            </h2>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] overflow-hidden shadow-[0_20px_80px_-20px_rgba(0,0,0,0.5)]">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-black/40">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-white/10" />
                <div className="w-3 h-3 rounded-full bg-white/10" />
                <div className="w-3 h-3 rounded-full bg-white/10" />
              </div>
              <div className="flex-1 text-center text-[11px] text-white/30 font-mono">chaos-lab</div>
              <div className={`text-[11px] px-2 py-0.5 rounded-full ${
                phase === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
                isRunning ? 'bg-orange-500/10 text-orange-400' : 'bg-white/5 text-white/40'
              }`}>
                {phase === 'done' ? '● Complete' : isRunning ? '● Analyzing' : '○ Ready'}
              </div>
            </div>

            <div className="grid lg:grid-cols-5 min-h-[520px]">
              {/* Controls */}
              <div className="lg:col-span-2 p-6 border-b lg:border-b-0 lg:border-r border-white/[0.06] space-y-5 bg-black/20">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-widest text-white/30 mb-2.5">Service</label>
                  <div className="space-y-1.5">
                    {services.map(s => (
                      <button key={s.id} onClick={() => !isRunning && setService(s.id)} disabled={isRunning}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all text-sm ${
                          service === s.id ? 'border-orange-500/30 bg-orange-500/[0.06]' : 'border-white/[0.05] hover:bg-white/[0.03]'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <span className="font-mono text-white/90">{s.label}</span>
                        <span className="block text-[11px] text-white/35 mt-0.5">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-widest text-white/30 mb-2.5">Failure mode</label>
                  <div className="space-y-1.5">
                    {failures.map(f => (
                      <button key={f.id} onClick={() => !isRunning && setFailure(f.id)} disabled={isRunning}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all flex items-center gap-2.5 ${
                          failure === f.id ? 'border-orange-500/30 bg-orange-500/[0.06]' : 'border-white/[0.05] hover:bg-white/[0.03]'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <f.icon className={`w-4 h-4 ${failure === f.id ? 'text-orange-400' : 'text-white/40'}`} />
                        <div>
                          <span className="text-sm text-white/90">{f.label}</span>
                          <span className="block text-[11px] text-white/35">{f.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={run} disabled={isRunning}
                  className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    isRunning ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}>
                  {isRunning ? <><Loader2 className="w-4 h-4 animate-spin" /> Running...</> : <><Flame className="w-4 h-4" /> Inject Failure</>}
                </button>
              </div>

              {/* Results */}
              <div className="lg:col-span-3 p-6 flex flex-col gap-4">
                {/* Event stream */}
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 flex-1 min-h-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[12px] font-medium text-white/60">Live telemetry</span>
                  </div>
                  <div className="space-y-1.5 font-mono text-[12px]">
                    {events.length === 0 && <div className="text-white/20 py-8 text-center italic">Awaiting injection...</div>}
                    <AnimatePresence>
                      {events.map((e, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2.5">
                          <span className="text-white/25 w-10 shrink-0">{e.time}</span>
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            e.type === 'inject' ? 'bg-orange-400' : e.type === 'signal' ? 'bg-cyan-400' : e.type === 'ai' ? 'bg-purple-400' : 'bg-emerald-400'
                          }`} />
                          <span className={e.type === 'done' ? 'text-emerald-300' : 'text-white/60'}>{e.text}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Verdict card */}
                <AnimatePresence mode="wait">
                  {phase === 'done' ? (
                    <motion.div key="verdict" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.04] to-transparent p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <Brain className="w-4 h-4 text-orange-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">Root Cause Verdict</div>
                            <div className="text-[11px] text-white/35 font-mono">multi-model ensemble</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-orange-400">{result.confidence}%</div>
                          <div className="text-[10px] text-white/35 uppercase">confidence</div>
                        </div>
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed mb-4">{result.cause}</p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
                          <div className="text-[10px] text-white/35 uppercase">Impact</div>
                          <div className="text-xs font-semibold text-red-400 mt-0.5">{result.impact}</div>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
                          <div className="text-[10px] text-white/35 uppercase">Blast</div>
                          <div className="text-xs font-semibold text-orange-400 mt-0.5">{result.blast}</div>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
                          <div className="text-[10px] text-white/35 uppercase">Signals</div>
                          <div className="text-xs font-semibold text-cyan-400 mt-0.5">{result.signals.length} correlated</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.signals.map((s: string, i: number) => (
                          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-white/50 border border-white/[0.06]">{s}</span>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/[0.03] flex items-center justify-center">
                        <Brain className="w-4 h-4 text-white/30" />
                      </div>
                      <div>
                        <div className="text-sm text-white/60">AI Verdict</div>
                        <div className="text-[12px] text-white/30">Appears after simulation completes</div>
                      </div>
                      {isRunning && <Loader2 className="w-4 h-4 text-white/30 animate-spin ml-auto" />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

/* =========================================================
   CTA — Final conversion section
   ========================================================= */

function CTA() {
  return (
    <section className="relative py-32">
      <div className="max-w-4xl mx-auto px-4">
        <FadeIn>
          <div className="relative rounded-3xl border border-white/[0.06] bg-gradient-to-br from-orange-500/[0.04] via-transparent to-cyan-500/[0.02] p-12 sm:p-16 text-center overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-orange-500/10 blur-[100px] rounded-full" />

            <div className="relative">
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white">
                Ready to ship
                <br />
                <span className="text-white/60">resilient systems?</span>
              </h2>
              <p className="mt-4 text-white/45 text-lg max-w-lg mx-auto">
                Deploy in minutes. Watch incidents resolve themselves.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <a href="/register" className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-white text-black text-sm font-semibold hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all hover:-translate-y-0.5">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a href="https://github.com/sujalmeena7/sentinel-sre" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-white/[0.1] text-white/70 text-sm font-medium hover:bg-white/[0.04] transition-all">
                  <Github className="w-4 h-4" />
                  Star on GitHub
                </a>
              </div>
              <p className="mt-6 text-[13px] text-white/30">Open source · Self-hostable · No limits</p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

/* =========================================================
   FOOTER — Minimal
   ========================================================= */

function Footer() {
  return (
    <footer className="border-t border-white/[0.05] py-10">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center">
            <Shield className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm text-white/50">Sentinel-SRE</span>
        </div>
        <div className="flex items-center gap-6 text-[13px] text-white/30">
          <a href="https://github.com/sujalmeena7/sentinel-sre" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
          <a href="/login" className="hover:text-white/60 transition-colors">Sign in</a>
          <a href="/register" className="hover:text-white/60 transition-colors">Get Started</a>
        </div>
        <p className="text-[12px] text-white/20">© 2026 Sentinel-SRE</p>
      </div>
    </footer>
  )
}

/* =========================================================
   PAGE
   ========================================================= */

export default function Page() {
  return (
    <MotionWrap>
      <main className="relative min-h-screen bg-black text-white selection:bg-orange-500/30 overflow-x-hidden">
        {/* Fixed background layers */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-dot-grid opacity-30" />
          <div className="absolute inset-0 bg-cinematic-noise opacity-[0.04]" />
        </div>

        <div className="relative z-10">
          <Navbar />
          <Hero />
          <Features />
          <ChaosDemo />
          <HowItWorks />
          <CTA />
          <Footer />
        </div>
      </main>
    </MotionWrap>
  )
}
