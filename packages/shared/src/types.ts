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

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

/** Contact as exposed by the API (soft-deleted rows are never returned). */
export interface Contact {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  ownerId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListResponse {
  data: Contact[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Stage {
  id: string;
  orgId: string;
  pipelineId: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Pipeline {
  id: string;
  orgId: string;
  name: string;
  stages: Stage[];
}

/** Deal as exposed by the API; `position` is the fractional kanban position. */
export interface Deal {
  id: string;
  orgId: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  currency: string;
  ownerId: string;
  expectedClose: string | null;
  status: DealStatus;
  lostReason: string | null;
  position: number;
  version: number;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealListResponse {
  data: Deal[];
  nextCursor: string | null;
  hasMore: boolean;
}

