import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0a0e1a',
          50: '#0d1225',
          100: '#111830',
          200: '#161e3d',
          300: '#1c254a',
        },
        accent: {
          DEFAULT: '#f97316',
          cyan: '#00e5ff',
          blue: '#3b82f6',
          purple: '#a855f7',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(249, 115, 22, 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse-slow 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'blob': 'blob 18s ease-in-out infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(40px, -30px) scale(1.1)' },
          '66%': { transform: 'translate(-30px, 30px) scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
