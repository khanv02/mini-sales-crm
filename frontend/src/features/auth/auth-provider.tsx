import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser, RegisterRequest } from '@pulse/shared';
import { apiFetch, configureAuth } from '../../lib/api/client';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const tokenRef = useRef<string | null>(null);
  const bootstrapped = useRef(false);

  const applySession = useCallback((session: AuthResponse) => {
    tokenRef.current = session.accessToken;
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setStatus('anonymous');
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const session = await apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST' });
      applySession(session);
      return session.accessToken;
    } catch {
      clearSession();
      return null;
    }
  }, [applySession, clearSession]);

  // Registered during render on purpose: children may start fetching before the
  // provider's effects run, and the accessor must already be in place.
  configureAuth({ getAccessToken: () => tokenRef.current, refreshAccessToken });

  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;
    void refreshAccessToken();
  }, [refreshAccessToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiFetch<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      applySession(session);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const session = await apiFetch<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
