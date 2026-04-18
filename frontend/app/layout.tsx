import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RootCause AI — Intelligent Incident Analyzer',
  description: 'AI-powered root cause analysis for DevOps incidents. Correlate signals, detect anomalies, and fix issues faster.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface min-h-screen bg-grid">
        {/* Ambient background gradient orbs */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-accent-cyan/[0.03] rounded-full blur-[120px] animate-float" />
          <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-accent-purple/[0.04] rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-20 left-1/3 w-[400px] h-[400px] bg-accent-blue/[0.03] rounded-full blur-[80px] animate-float" style={{ animationDelay: '4s' }} />
        </div>
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  )
}
