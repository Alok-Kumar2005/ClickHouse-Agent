'use client';
// ============================================================
// app/auth/page.tsx — Auth page
// ============================================================
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { saveSession } from '@/lib/auth';

export default function AuthPage() {
  const router = useRouter();

  function handleSuccess(token: string, userId: string, email: string) {
    saveSession({ token, user_id: userId, email });
    router.push('/chat');
  }

  return <AuthForm onSuccess={handleSuccess} />;
}
