import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetchAuth, configureAuth } from '../../lib/api/client';
import { useAuth } from './auth-context';
import { AuthProvider } from './auth-provider';

const authResponse = {
  accessToken: 'fresh-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '22222222-2222-4222-8222-222222222222',
    email: 'admin@acme.test',
    name: 'Admin Acme',
    role: 'ADMIN' as const,
    active: true,
    createdAt: '2026-11-11T00:00:00.000Z',
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function ConcurrentRequests() {
  const { status } = useAuth();

  useEffect(() => {
    void apiFetchAuth('/first').catch(() => undefined);
    void apiFetchAuth('/second').catch(() => undefined);
  }, []);

  return <p data-testid="status">{status}</p>;
}

afterEach(() => {
  configureAuth(null);
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('uses one refresh rotation for concurrent 401 retries', async () => {
    const refreshResponse = deferred<Response>();
    let refreshCalls = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/auth/refresh')) {
        refreshCalls += 1;
        return refreshResponse.promise;
      }

      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization === 'Bearer fresh-token') {
        return Promise.resolve(jsonResponse(200, { ok: true }));
      }
      return Promise.resolve(jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'expired' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <ConcurrentRequests />
      </AuthProvider>,
    );

    await waitFor(() => expect(refreshCalls).toBe(1));
    refreshResponse.resolve(jsonResponse(200, authResponse));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    expect(refreshCalls).toBe(1);
    const retried = fetchMock.mock.calls.filter(([input]) => {
      const url = String(input);
      return url.endsWith('/first') || url.endsWith('/second');
    });
    expect(retried).toHaveLength(4);
  });
});
