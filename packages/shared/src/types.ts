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
