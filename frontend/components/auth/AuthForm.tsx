'use client';
// ============================================================
// components/auth/AuthForm.tsx
// Login: POST /api/v1/auth/login (application/x-www-form-urlencoded)
//   fields: username (email), password
// Register: POST /api/v1/auth/register (JSON)
//   fields: email, password, full_name
// ============================================================
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Sparkles, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { loginRequest, registerRequest } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface AuthFormProps {
  onSuccess: (token: string, userId: string, email: string) => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let res;
      if (mode === 'login') {
        // ⚡ OAuth2: username field = email, content-type = form-urlencoded
        res = await loginRequest(email, password);
      } else {
        res = await registerRequest(email, password, fullName);
      }
      onSuccess(res.access_token, res.user_id, res.email);
      showToast(mode === 'login' ? 'Logged in successfully' : 'Account created!', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      {/* Background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:48px_48px]" />
      {/* Gradient glow */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-cyan-500/10 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-lg shadow-cyan-500/30">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">BoxOfficePulse</h1>
          <p className="text-sm text-zinc-500">Enterprise AI Command Center</p>
        </div>

        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-md">
          {/* Tab toggle */}
          <div className="mb-6 flex rounded-xl bg-zinc-800/80 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? 'bg-zinc-700 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  key="fullname"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <InputField
                    icon={<User size={15} />}
                    type="text"
                    placeholder="Full Name"
                    value={fullName}
                    onChange={setFullName}
                    required={mode === 'register'}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <InputField
              icon={<Mail size={15} />}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={setEmail}
              required
            />

            <div className="relative">
              <InputField
                icon={<Lock size={15} />}
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={setPassword}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2.5 text-sm text-rose-400"
              >
                <AlertTriangle size={14} className="shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-400 hover:to-cyan-500 hover:shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {mode === 'login' ? 'Authenticating...' : 'Creating account...'}
                </span>
              ) : mode === 'login' ? (
                'Sign In to War Room'
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Input sub-component ────────────────────────────────────────────
function InputField({
  icon,
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-zinc-500">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'name'}
        className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 py-3 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
      />
    </div>
  );
}
