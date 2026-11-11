import type { UserRole } from '@prisma/client';

/**
 * Tenant context of the caller. Built from the access token and refreshed from
 * the database by `PrincipalService`; it is never read from the request body.
 */
export interface AuthenticatedUser {
  userId: string;
  orgId: string;
  role: UserRole;
  active: boolean;
}
