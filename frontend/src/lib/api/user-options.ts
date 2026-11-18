import type { AuthUser, UserListResponse } from '@pulse/shared';
import { apiFetchAuth } from './client';

/** Active members of the org; `GET /users` is Admin-only (permissions matrix). */
export function fetchUserOptions(): Promise<AuthUser[]> {
  return apiFetchAuth<UserListResponse>('/api/v1/users?limit=100&active=true').then(
    (response) => response.data,
  );
}
