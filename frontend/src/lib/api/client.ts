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
    let body: ApiClientErrorBody = {};
    try {
      body = (await response.json()) as ApiClientErrorBody;
    } catch {
      body = {};
    }
    throw new ApiClientError(
      response.status,
      body.code ?? 'INTERNAL_ERROR',
      body.message ?? 'Yêu cầu không thành công.',
      body.requestId,
      body.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
