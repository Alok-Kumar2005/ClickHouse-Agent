'use client';
// ============================================================
// app/page.tsx — Entry redirect
// Checks auth state → /chat or /auth
// ============================================================
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { Sparkles } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/chat');
    } else {
      router.replace('/auth');
    }
  }, [router]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700">
        <Sparkles size={28} className="animate-pulse text-white" />
      </div>
      <p className="mt-4 text-sm text-zinc-500">Initializing War Room…</p>
    </div>
  );
}
