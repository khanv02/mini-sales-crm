import type { ErrorCode } from './constants';

export type UserRole = 'ADMIN' | 'MANAGER' | 'SALES';

export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HealthReport {
  status: 'ok' | 'error';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

/** User as exposed by the API (never carries the password hash). */
export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

/** `POST /auth/register|login|refresh` response body (ADR-015: refresh token stays in the cookie). */
export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export interface UserListResponse {
  data: AuthUser[];
  nextCursor: string | null;
  hasMore: boolean;
}

