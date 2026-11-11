export interface ApiClientErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function readError(response: Response): Promise<ApiClientError> {
  let body: ApiClientErrorBody = {};
  try {
    body = (await response.json()) as ApiClientErrorBody;
  } catch {
    body = {};
  }
  return new ApiClientError(
    response.status,
    body.code ?? 'INTERNAL_ERROR',
    body.message ?? 'Yêu cầu không thành công.',
    body.requestId,
    body.details,
  );
}

/** Plain request used by public endpoints (health) and by the auth endpoints. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface AuthAccessor {
  /** Access token kept in memory only - never in localStorage (docs/api-conventions.md section 1). */
  getAccessToken: () => string | null;
  /** Refreshes the session through the HttpOnly cookie; resolves null when it is gone. */
  refreshAccessToken: () => Promise<string | null>;
}

let authAccessor: AuthAccessor | null = null;

/** Called by `AuthProvider` so the interceptor can read and refresh the access token. */
export function configureAuth(accessor: AuthAccessor | null): void {
  authAccessor = accessor;
}

/**
 * Authenticated request: attaches the current access token and, on a single
 * 401, refreshes the session once and retries (T118 token refresh interceptor).
 */
export async function apiFetchAuth<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null): Promise<Response> =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      credentials: 'include',
    });

  let response = await send(authAccessor?.getAccessToken() ?? null);

  if (response.status === 401 && authAccessor) {
    const refreshed = await authAccessor.refreshAccessToken();
    if (refreshed) {
      response = await send(refreshed);
    }
  }

  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
