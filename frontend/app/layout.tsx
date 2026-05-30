import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { MotionProvider } from '@/components/MotionProvider'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4F46E5',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://sentinel-sre-zeta.vercel.app'),
  title: {
    default: 'Sentinel-SRE — AI-Powered Root Cause Analysis for SRE Teams',
    template: '%s | Sentinel-SRE',
  },
  description: 'Resolve incidents 10x faster with AI-powered root cause analysis. Sentinel-SRE correlates signals, runs chaos simulations, and delivers verdicts with calibrated confidence — automatically.',
  keywords: [
    'root cause analysis',
    'incident response',
    'SRE',
    'site reliability engineering',
    'AI incident management',
    'chaos engineering',
    'postmortem automation',
    'Prometheus alerting',
    'observability',
    'DevOps',
    'on-call',
    'MTTR reduction',
  ],
  authors: [{ name: 'Sentinel-SRE', url: 'https://sentinel-sre-zeta.vercel.app' }],
  creator: 'Sentinel-SRE',
  publisher: 'Sentinel-SRE',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://sentinel-sre-zeta.vercel.app',
    siteName: 'Sentinel-SRE',
    title: 'Sentinel-SRE — AI-Powered Root Cause Analysis for SRE Teams',
    description: 'Resolve incidents 10x faster with AI-powered root cause analysis. Correlate signals, run chaos simulations, and get verdicts with calibrated confidence.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sentinel-SRE — AI-Powered Root Cause Analysis',
    description: 'Resolve incidents 10x faster. AI-powered root cause analysis with calibrated confidence scores.',
  },
  alternates: {
    canonical: 'https://sentinel-sre-zeta.vercel.app',
  },
  icons: {
    icon: [
      {
        url: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2032%2032%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%228%22%20fill%3D%22%234F46E5%22%2F%3E%3Cpath%20d%3D%22M16%206L8%2010v6.18c0%204.96%203.42%209.6%208%2010.82%204.58-1.22%208-5.86%208-10.82V10l-8-4z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E',
        type: 'image/svg+xml',
      },
    ],
    apple: [
      {
        url: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%22180%22%20viewBox%3D%220%200%2032%2032%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%228%22%20fill%3D%22%234F46E5%22%2F%3E%3Cpath%20d%3D%22M16%206L8%2010v6.18c0%204.96%203.42%209.6%208%2010.82%204.58-1.22%208-5.86%208-10.82V10l-8-4z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E',
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sentinel-SRE',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: 'AI-powered root cause analysis platform for SRE teams. Resolve incidents 10x faster with calibrated confidence scores.',
    url: 'https://sentinel-sre-zeta.vercel.app',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available',
    },
    featureList: [
      'AI Root Cause Analysis',
      'Chaos Engineering Simulations',
      'Confidence Scoring',
      'Self-Improving RAG',
      'Automated Postmortems',
      'Prometheus Integration',
      'Slack & Teams Dispatch',
    ],
  }

  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased bg-black text-white min-h-screen">
        <MotionProvider>
          <AuthProvider>{children}</AuthProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
