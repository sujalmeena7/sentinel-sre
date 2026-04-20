'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Shield } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) {
      router.replace('/login');
    }
  }, [user, router]);

  // Hydrating → show a minimal loader
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 text-white/60">
          <Shield className="w-5 h-5 text-indigo-400" />
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Restoring session…</span>
        </div>
      </div>
    );
  }

  // Not authenticated → blank while router.replace takes effect
  if (user === null) {
    return null;
  }

  return <>{children}</>;
}
