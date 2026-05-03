'use client'

import { useState, useEffect, useRef } from 'react'
import {   m as motion , AnimatePresence, useInView  } from 'framer-motion'
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
  Shield,
  Terminal,
  Sparkles,
  Cpu,
  GitBranch,
  Radio,
  Star,
  Gauge,
  Layers,
  Database,
  Menu,
  X,
  Loader2,
  Flame,
  Network,
  MemoryStick,
  ServerCrash,
  Plug,
  Check,
  Copy,
  FileCode,
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

interface BadgeProps {
  children: React.ReactNode;
  icon?: any;
}

const Badge = ({ children, icon: Icon }: BadgeProps) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-white/80">
    {Icon && <Icon className="w-3.5 h-3.5 text-orange-400" />}
    <span>{children}</span>
  </div>
)

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  href?: string;
  icon?: any;
}

const Button = ({ children, variant = 'primary', href = '#', icon: Icon }: ButtonProps) => {
  const base = 'relative inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 group'
  if (variant === 'primary') {
    return (
      <a href={href} className={`${base} bg-orange-500 text-white hover:bg-orange-600`}>
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
            <div className="relative w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
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
              className="px-4 py-1.5 text-sm rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium"
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
              <a href="/register" onClick={() => setOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-medium">
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
  return (
    <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <Badge icon={Sparkles}>
              New · Chaos Simulation Engine 2.0 is here
            </Badge>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-7xl font-semibold tracking-tight leading-[1.1]">
              <span className="text-white">Detect, Diagnose, and Learn</span>
              <br />
              <span className="text-white/90">from System Failures — </span>
              <span className="text-orange-400 italic">Automatically</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="mt-6 text-lg lg:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              Sentinel-SRE uses AI, chaos simulations, and real-time signals to identify root causes
              and generate actionable insights in seconds.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button variant="primary" href="/dashboard" icon={ArrowRight}>
                Launch Dashboard
              </Button>
              <Button variant="secondary" href="#chaos" icon={Play}>
                View Demo
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-white/40">
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
      </div>
    </section>
  )
}


interface ConfidenceBadgeProps {
  value: number;
}

const ConfidenceBadge = ({ value }: ConfidenceBadgeProps) => {
  const color =
    value >= 90 ? 'text-emerald-400' : value >= 80 ? 'text-orange-400' : 'text-yellow-400'
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
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f97316" />
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

//FEATURES
 

const Features = () => {
  const features = [
    {
      icon: Brain,
      title: 'AI Root Cause Analysis',
      desc: 'Multi-model LLM ensemble correlates logs, metrics, and traces to surface the true cause — not just the symptom.',
      iconColor: 'text-orange-400',
    },
    {
      icon: GitBranch,
      title: 'Chaos Engineering Simulator',
      desc: 'Safely inject failures in staging or prod shadow traffic to validate resilience before your users feel it.',
      iconColor: 'text-pink-400',
    },
    {
      icon: Gauge,
      title: 'Confidence Scoring Engine',
      desc: 'Every AI verdict ships with a calibrated confidence score, so you know when to trust — and when to dig deeper.',
      iconColor: 'text-emerald-400',
    },
    {
      icon: RefreshCw,
      title: 'Feedback-Aware Learning (RAG)',
      desc: 'Engineers rate explanations; Sentinel stores context in a retrieval layer that gets smarter with every incident.',
      iconColor: 'text-cyan-400',
    },
    {
      icon: FileText,
      title: 'Automated Postmortems',
      desc: 'Structured, blameless postmortems generated in seconds — timelines, impact, fixes, action items. Ready to publish.',
      iconColor: 'text-violet-400',
    },
    {
      icon: Layers,
      title: 'Unified Telemetry',
      desc: 'Bring your own stack — Datadog, Prometheus, OpenTelemetry, Loki. Sentinel reasons across all of it.',
      iconColor: 'text-amber-400',
    },
  ]

  return (
    <section id="features" className="relative py-24 lg:py-32">
      <div className="absolute inset-0 bg-[#0a0e1a] pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge icon={Zap}>Core capabilities</Badge>
            <h2 className="mt-4 text-4xl lg:text-5xl font-semibold tracking-tight text-white">
              Every signal. Every incident.<br />One resilient system.
            </h2>
            <p className="mt-4 text-white/50 text-lg leading-relaxed">
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
  iconColor?: string;
}

const FeatureCard = ({ icon: Icon, title, desc, iconColor }: FeatureCardProps) => (
  <div className="group relative h-full rounded-2xl glass p-6 transition-all duration-500 hover:-translate-y-1 hover:border-white/15 overflow-hidden">
    <div className="relative">
      <div className={`w-11 h-11 rounded-xl glass flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-xs text-white/40 group-hover:text-white/80 transition-colors">
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
    <section id="how" className="relative py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge icon={Cpu}>How it works</Badge>
            <h2 className="mt-4 text-4xl lg:text-5xl font-semibold tracking-tight text-white">
              From signal to postmortem<br />in four steps
            </h2>
          </div>
        </FadeIn>

        <div className="relative">
          {/* connecting line */}
          <div className="hidden lg:block absolute top-10 left-[8%] right-[8%] h-px bg-white/10" />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {steps.map((step: any, i: number) => (
              <FadeIn key={step.title} delay={i * 0.08}>
                <div className="relative">
                  <div className="relative z-10 flex flex-col items-start">
                    <div className="relative w-20 h-20 rounded-2xl glass flex items-center justify-center mb-4 group">
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
    <section id="why" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge icon={Star}>Why Sentinel-SRE</Badge>
            <h2 className="mt-4 text-4xl lg:text-5xl font-semibold tracking-tight text-white">
              Not just another<br />observability tool
            </h2>
            <p className="mt-4 text-white/50 text-lg leading-relaxed">
              Sentinel-SRE is the reasoning layer your dashboards have been waiting for.
            </p>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5">
          {reasons.map((r, i) => (
            <FadeIn key={r.title} delay={i * 0.05}>
              <div className="group relative rounded-2xl glass p-6 h-full overflow-hidden hover:border-white/15 transition-all duration-500">
                <div className="flex items-start justify-between gap-6 relative">
                  <div className="flex-1">
              <div className="w-10 h-10 rounded-lg glass flex items-center justify-center mb-4">
                      <r.icon className="w-4 h-4 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">{r.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed max-w-md">{r.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-semibold text-orange-400">{r.stat}</div>
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
   FINAL CTA
   ========================================================= */

const FinalCTA = () => {
  return (
    <section id="cta" className="relative py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8">
        <FadeIn>
          <div className="relative rounded-3xl glass-strong p-8 lg:p-16 text-center">
            <div className="relative">
              <Badge icon={Sparkles}>Ready to ship resilience</Badge>
              <h2 className="mt-4 text-4xl lg:text-6xl font-semibold tracking-tight text-white max-w-3xl mx-auto">
                Start building resilient<br />systems today
              </h2>
              <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto leading-relaxed">
                Deploy Sentinel-SRE in minutes. Watch incidents resolve themselves.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Button variant="primary" href="/dashboard" icon={ArrowRight}>
                  Launch Dashboard
                </Button>
                <Button variant="secondary" href="#" icon={Github}>
                  Star on GitHub
                </Button>
              </div>
              <div className="mt-6 text-xs text-white/40">
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
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Sentinel-SRE</span>
            </div>
            <p className="text-sm text-white/50 max-w-xs leading-relaxed">
              AI-powered root cause analysis and automated postmortems for modern systems.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a href="#" className="w-9 h-9 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition-colors">
                <Github className="w-4 h-4 text-white/70" />
              </a>
            </div>
          </div>

          <FooterCol
            title="Product"
            links={['Features', 'How it works', 'Changelog', 'Roadmap']}
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
            2025 Sentinel-SRE · Built with Next.js, Tailwind, and Framer Motion
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
   INTEGRATIONS — Real Prometheus Webhook
   ========================================================= */

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_BACKEND_URL
  ? process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/+$/, '')
  : 'https://sentinel-backend-box9.onrender.com'

const Integrations = () => {
  const [copied, setCopied] = useState<string | null>(null)
  const webhookUrl = `${WEBHOOK_BASE}/api/v1/telemetry/prometheus/{your-webhook-token}`

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const alertmanagerYaml = `route:
  receiver: sentinel-sre

receivers:
  - name: sentinel-sre
    webhook_configs:
      - url: "${webhookUrl}"
        send_resolved: true`

  const curlCommand = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "receiver": "webhook",
    "status": "firing",
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "HighMemoryUsage",
        "service": "checkout-ui",
        "severity": "critical"
      }
    }]
  }'`

  return (
    <section id="integrations" className="relative py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge icon={Plug}>Integrations</Badge>
            <h2 className="mt-4 text-4xl lg:text-5xl font-semibold tracking-tight text-white">
              One webhook.<br />Any alert source.
            </h2>
            <p className="mt-4 text-white/50 text-lg leading-relaxed">
              Sentinel-SRE ingests alerts via a single Prometheus-compatible webhook. No agents. No sidecars.
            </p>
          </div>
        </FadeIn>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Webhook URL */}
          <FadeIn>
            <div className="rounded-2xl glass p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-semibold text-white">Webhook Endpoint</h3>
                </div>
                <button
                  onClick={() => copy(webhookUrl, 'url')}
                  className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  {copied === 'url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block bg-black/40 rounded-lg px-3 py-2.5 text-xs font-mono text-white/70 break-all">
                {webhookUrl}
              </code>
              <p className="mt-2 text-xs text-white/40">
                Replace <code className="text-white/60">{'{your-webhook-token}'}</code> with your personal token from the dashboard.
              </p>
            </div>
          </FadeIn>

          {/* Alertmanager config */}
          <FadeIn delay={0.05}>
            <div className="rounded-2xl glass p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Alertmanager Config</h3>
                </div>
                <button
                  onClick={() => copy(alertmanagerYaml, 'yaml')}
                  className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  {copied === 'yaml' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'yaml' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-black/40 rounded-lg px-3 py-2.5 text-[11px] font-mono text-white/70 overflow-x-auto">
                <code>{alertmanagerYaml}</code>
              </pre>
            </div>
          </FadeIn>

          {/* Test cURL */}
          <FadeIn delay={0.1}>
            <div className="rounded-2xl glass p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">Test with cURL</h3>
                </div>
                <button
                  onClick={() => copy(curlCommand, 'curl')}
                  className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  {copied === 'curl' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'curl' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-black/40 rounded-lg px-3 py-2.5 text-[11px] font-mono text-white/70 overflow-x-auto">
                <code>{curlCommand}</code>
              </pre>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
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
    <section id="chaos" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8 relative">
        <FadeIn>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge icon={Flame}>Live chaos demo · interactive</Badge>
            <h2 className="mt-4 text-4xl lg:text-5xl font-semibold tracking-tight text-white">
              Inject a failure.<br />Watch Sentinel diagnose it.
            </h2>
            <p className="mt-4 text-white/50 text-lg leading-relaxed">
              Pick a service and a failure mode. Our AI engine will analyze, correlate, and return a root cause in seconds — right here, in your browser.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1} y={30}>
          <div className="relative max-w-6xl mx-auto">
            <div className="relative rounded-2xl glass-strong overflow-hidden shadow-lg">
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
                              ? 'border-orange-500/40 bg-orange-500/10'
                              : 'border-white/8 bg-white/[0.02] hover:bg-white/5'
                          } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono text-white">{s.label}</span>
                            {service === s.id && (
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
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
                          : 'bg-orange-500 text-white hover:bg-orange-600'
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
                <div className="lg:col-span-7 p-6 lg:p-7 flex flex-col gap-4">
                  {/* Event timeline */}
                  <div className="glass rounded-xl p-4 flex-1 min-h-[200px]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-orange-400" />
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
                                  ? 'bg-orange-400'
                                  : e.type === 'signal'
                                  ? 'bg-cyan-400'
                                  : e.type === 'ai'
                                  ? 'bg-orange-300'
                                  : 'bg-emerald-400'
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
                        className="relative glass rounded-xl p-5 border border-orange-500/30 overflow-hidden"
                      >
                        <div className="relative">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center">
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
                            <StatPill label="Signals" value={`${result.signals.length} correlated`} tint="text-orange-400" />
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
                            <button className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600">
                              Generate postmortem <ArrowRight className="w-3 h-3" />
                            </button>
                            <button className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg glass text-white/80 text-xs font-medium hover:bg-white/10">
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
   APP
   ========================================================= */

const App = () => {
  return (
    <main className="relative min-h-screen bg-cinematic text-white selection:bg-orange-500/30">
      {/* Cinematic background layers */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Dot grid — telemetry matrix, most visible layer */}
        <div className="absolute inset-0 bg-dot-grid opacity-70" />
        {/* Film grain — cinematic texture */}
        <div className="absolute inset-0 bg-cinematic-noise opacity-[0.08]" />
        {/* Scanlines — retro monitoring scope */}
        <div className="absolute inset-0 bg-cinematic-scanlines opacity-60" />
        {/* Vignette — dark edges, draws eye inward */}
        <div className="absolute inset-0 bg-cinematic-vignette" />
      </div>

      <div className="relative z-10">
        <Nav />
        <Hero />
        <Integrations />
        <Features />
        <ChaosSimulator />
        <HowItWorks />
        <WhySentinel />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  )
}

export default App
