import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Sentinel-SRE — AI-Powered Root Cause Analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          position: 'relative',
        }}
      >
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '30%',
            width: '600px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />

        {/* Logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v5.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V6l-8-4z" fill="white" />
            </svg>
          </div>
          <span style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Sentinel-SRE
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: '900px',
          }}
        >
          Resolve incidents
        </div>
        <div
          style={{
            fontSize: '64px',
            fontWeight: 700,
            background: 'linear-gradient(90deg, #818CF8, #6366F1)',
            backgroundClip: 'text',
            color: 'transparent',
            textAlign: 'center',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          10x faster
        </div>

        {/* Subtext */}
        <div
          style={{
            fontSize: '22px',
            color: '#71717A',
            textAlign: 'center',
            marginTop: '24px',
            maxWidth: '700px',
            lineHeight: 1.5,
          }}
        >
          AI-powered root cause analysis with calibrated confidence scores
        </div>

        {/* Metrics bar */}
        <div
          style={{
            display: 'flex',
            gap: '48px',
            marginTop: '48px',
            padding: '20px 40px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>4.2s</span>
            <span style={{ fontSize: '12px', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg Resolution</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>94%</span>
            <span style={{ fontSize: '12px', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Confidence</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>10x</span>
            <span style={{ fontSize: '12px', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Faster MTTR</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
