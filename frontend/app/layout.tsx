import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { MotionProvider } from '@/components/MotionProvider'

const inter = Inter({ 
  subsets: ['latin'], 
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
})

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'], 
  display: 'swap',
  variable: '--font-mono',
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: 'Sentinel-SRE — AI-Powered Root Cause Analysis',
  description: 'Detect, Diagnose, and Learn from System Failures — Automatically. AI-Powered Root Cause Analysis and Automated Postmortems for Modern Systems.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-black text-white antialiased min-h-screen font-sans">
        <MotionProvider>
          <AuthProvider>{children}</AuthProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
