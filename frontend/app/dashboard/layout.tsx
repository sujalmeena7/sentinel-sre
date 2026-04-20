import ProtectedRoute from '@/components/ProtectedRoute'
import UserMenu from '@/components/UserMenu'
import Link from 'next/link'
import { Shield } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-surface bg-grid">
        {/* Ambient background gradient orbs */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-accent-cyan/[0.03] rounded-full blur-[120px] animate-float" />
          <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-accent-purple/[0.04] rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-20 left-1/3 w-[400px] h-[400px] bg-accent-blue/[0.03] rounded-full blur-[80px] animate-float" style={{ animationDelay: '4s' }} />
        </div>

        {/* Dashboard top bar — contains brand + user menu */}
        <header className="relative z-20 border-b border-white/5 bg-black/40 backdrop-blur-md">
          <div className="mx-auto max-w-[1600px] px-4 md:px-6 lg:px-8 flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2" data-testid="dashboard-brand-link">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-[0_0_14px_rgba(99,102,241,0.5)]">
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-white">Sentinel-SRE</span>
              <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-white/40 hidden sm:inline">Command Center</span>
            </Link>
            <UserMenu />
          </div>
        </header>

        <div className="relative z-10">
          {children}
        </div>
      </div>
    </ProtectedRoute>
  )
}
