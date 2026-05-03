'use client'

import { useEffect, useRef, useState, memo } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Radio, ChevronRight, X, Menu } from 'lucide-react'

/* ── HLS Video Player ─────────────────────────────────────── */
const VideoPlayer = memo(function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)

  useEffect(() => {
    let hls: any
    const video = videoRef.current
    if (!video) return

    const src = 'https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8'

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else if (typeof window !== 'undefined') {
      import('hls.js').then((HlsMod) => {
        const Hls = HlsMod.default
        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          })
          hls.loadSource(src)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {})
          })
          hlsRef.current = hls
        }
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [])

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      style={{ opacity: 1 }}
    />
  )
})

/* ── Navbar ─────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'Features', href: '#features', active: true },
    { label: 'Insights', href: '#insights' },
    { label: 'About', href: '#about' },
    { label: 'Case Studies', href: '#case-studies', strike: true },
    { label: 'Contact', href: '#contact' },
  ]

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <div
        className={`mx-4 mt-4 rounded-2xl border border-white/[0.06] backdrop-blur-xl transition-all duration-500 ${
          scrolled
            ? 'bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
            : 'bg-black/30'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-3">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-medium tracking-tight text-white text-sm">
              Sentinel-SRE
            </span>
          </a>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className={`relative px-3 py-1.5 text-[13px] transition-colors rounded-lg hover:bg-white/5 ${
                  l.active
                    ? 'text-white'
                    : l.strike
                    ? 'text-white/30 line-through decoration-white/20'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {l.active && (
                  <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent" />
                )}
                {l.label}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:block">
            <a
              href="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-black bg-gradient-to-b from-white to-gray-300 hover:from-gray-100 hover:to-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              Get Started for Free
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/60"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="md:hidden px-5 pb-4 space-y-1 border-t border-white/5"
          >
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 text-sm rounded-lg ${
                  l.strike
                    ? 'text-white/30 line-through'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/register"
              className="block mt-2 text-center px-4 py-2 rounded-full text-sm font-medium text-black bg-gradient-to-b from-white to-gray-300"
            >
              Get Started for Free
            </a>
          </motion.div>
        )}
      </div>
    </motion.header>
  )
}

/* ── Logo Marquee ───────────────────────────────────────── */
function LogoMarquee() {
  const logos = [
    { name: 'Prometheus', svg: <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/> },
    { name: 'Grafana', svg: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/> },
    { name: 'Datadog', svg: <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/> },
    { name: 'K8s', svg: <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="currentColor" strokeWidth="2" fill="none"/> },
    { name: 'AWS', svg: <path d="M4 14l4-8 4 8H4zm12 0l4-8 4 8h-8z" stroke="currentColor" strokeWidth="2" fill="none"/> },
    { name: 'PagerDuty', svg: <><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2"/></> },
  ]

  return (
    <div className="absolute bottom-8 left-0 right-0 z-10">
      <div className="flex items-center justify-center gap-10 px-8 flex-wrap">
        {logos.map((logo) => (
          <div
            key={logo.name}
            className="flex items-center gap-2 text-white/40 grayscale opacity-40 hover:opacity-60 transition-opacity"
            title={logo.name}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
              {logo.svg}
            </svg>
            <span className="text-[11px] font-medium tracking-wide uppercase">{logo.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hero Section ───────────────────────────────────────── */
export default function HeroSection() {
  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.1, delayChildren: 0.3 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
    },
  }

  return (
    <section className="relative min-h-screen bg-black overflow-hidden">
      {/* HLS Video Background */}
      <div
        className="absolute bottom-[35vh] left-0 right-0 h-[80vh] z-0"
        style={{ transform: 'translateY(20%)' }}
      >
        <VideoPlayer />
      </div>

      {/* Subtle radial glow behind text for readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none" />

      {/* Navbar */}
      <Navbar />

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-24 pb-32">
        <motion.div
          className="text-center max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Badges */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center justify-center gap-3 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm text-[11px] text-white/60">
              <Zap className="w-3 h-3 text-orange-400" />
              Integrated with Prometheus
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm text-[11px] text-white/60">
              <Radio className="w-3 h-3 text-emerald-400" />
              Real-time Telemetry
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm text-[11px] text-white/60">
              <Shield className="w-3 h-3 text-cyan-400" />
              AI-Powered RCA
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={itemVariants}
            className="text-5xl sm:text-6xl lg:text-[80px] font-semibold tracking-tight leading-[1.05] text-white mb-6"
          >
            Where Innovation
            <br />
            Meets Execution
          </motion.h1>

          {/* Subtext */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg text-white/50 max-w-xl mx-auto leading-relaxed mb-10"
          >
            Test chaos scenarios in simulated environments and deploy
            <br className="hidden sm:block" />
            confidently with AI-driven root cause analysis.
          </motion.p>

          {/* Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <a
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black border border-white/20 text-white text-sm font-medium hover:bg-white/5 hover:border-white/30 transition-all"
            >
              Get Started for Free
              <ChevronRight className="w-4 h-4" />
            </a>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm text-white/70 text-sm font-medium hover:bg-white/[0.06] hover:text-white transition-all"
            >
              Let's Get Connected
            </a>
          </motion.div>
        </motion.div>

        {/* Logo Marquee */}
        <LogoMarquee />
      </div>
    </section>
  )
}
