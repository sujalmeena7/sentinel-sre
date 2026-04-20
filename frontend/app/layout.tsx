import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sentinel-SRE — AI-Powered Root Cause Analysis',
  description: 'Detect, Diagnose, and Learn from System Failures — Automatically. AI-Powered Root Cause Analysis and Automated Postmortems for Modern Systems.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}

