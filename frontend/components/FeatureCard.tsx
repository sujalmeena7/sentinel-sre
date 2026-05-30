'use client'

import { m as motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  delay?: number
  className?: string
  icon: LucideIcon
  title: string
  description: string
  accent?: boolean
}

export function FeatureCard({ delay = 0, className = '', icon: Icon, title, description, accent }: FeatureCardProps) {
  return (
    <motion.div
      className={`${className} p-7 rounded-3xl border relative overflow-hidden group cursor-default shadow-lg`}
      style={{
        background: accent
          ? 'linear-gradient(160deg, rgba(99,102,241,0.06) 0%, rgba(17,17,19,0.5) 100%)'
          : 'linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(17,17,19,0.8) 100%)',
        borderColor: accent ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 40px -10px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(20px)',
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {/* Hover border highlight */}
      <motion.div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: accent
            ? 'inset 0 0 0 1px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
            : 'inset 0 0 0 1px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      />

      {/* Subtle top-left glow on hover */}
      <div
        className="absolute -top-10 -left-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl pointer-events-none"
        style={{ background: 'rgba(99,102,241,0.15)' }}
      />

      <div className="relative z-10">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center mb-5 transition-colors duration-200"
          style={{
            background: accent ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.04)',
            borderColor: accent ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
          }}
        >
          <Icon
            className="w-5 h-5 transition-colors duration-200"
            style={{ color: accent ? '#818CF8' : '#A1A1AA' }}
          />
        </div>

        <h3 className="text-lg mb-2.5 font-semibold text-white tracking-tight">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-zinc-400">
          {description}
        </p>
      </div>
    </motion.div>
  )
}
