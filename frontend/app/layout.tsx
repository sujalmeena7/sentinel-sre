import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { MotionProvider } from '@/components/MotionProvider'

const plusJakarta = Plus_Jakarta_Sans({ 
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
  icons: {
    icon: [
      {
        url: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2032%2032%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%226%22%20fill%3D%22%23f97316%22%2F%3E%3Cpath%20d%3D%22M16%206L8%2010v6.18c0%204.96%203.42%209.6%208%2010.82%204.58-1.22%208-5.86%208-10.82V10l-8-4z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E',
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-cinematic text-white antialiased min-h-screen font-sans">
        <MotionProvider>
          <AuthProvider>{children}</AuthProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
