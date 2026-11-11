import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser, RegisterRequest } from '@pulse/shared';
import { apiFetch, configureAuth } from '../../lib/api/client';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const tokenRef = useRef<string | null>(null);
  const bootstrapped = useRef(false);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const sessionEpoch = useRef(0);

  const applySession = useCallback((session: AuthResponse) => {
    sessionEpoch.current += 1;
    tokenRef.current = session.accessToken;
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    sessionEpoch.current += 1;
    tokenRef.current = null;
    setUser(null);
    setStatus('anonymous');
  }, []);

  /**
   * Single-flight refresh: the bootstrap call and every 401 retry share one
   * rotation, so concurrent requests cannot rotate the same token twice (which
   * the API treats as reuse and answers by revoking the whole family).
   */
  const refreshAccessToken = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const epoch = sessionEpoch.current;
    const request = (async () => {
      try {
        const session = await apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST' });
        // A login/logout that happened while the refresh was in flight wins.
        if (epoch !== sessionEpoch.current) {
          return null;
        }
        applySession(session);
        return session.accessToken;
      } catch {
        if (epoch === sessionEpoch.current) {
          clearSession();
        }
        return null;
      }
    })().finally(() => {
      refreshInFlight.current = null;
    });

    refreshInFlight.current = request;
    return request;
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
