'use client';
// ============================================================
// hooks/useAuth.ts — Auth state from localStorage
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { AuthUser } from '@/types';
import { getUser, getToken, saveSession, clearSession } from '@/lib/auth';
import { logoutRequest } from '@/lib/api';

export function useAuth() {
  const [user, setUser] = useState<Omit<AuthUser, 'token'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setToken(getToken());
    setIsReady(true);
  }, []);

  const login = useCallback((authUser: AuthUser) => {
    saveSession(authUser);
    setUser({ user_id: authUser.user_id, email: authUser.email });
    setToken(authUser.token);
  }, []);

  const logout = useCallback(() => {
    logoutRequest().catch(() => {});
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  return { user, token, isReady, isAuthenticated: !!token, login, logout };
}
