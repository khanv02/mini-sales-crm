import type { User } from '@prisma/client';
import type { AuthUser, UserRole as SharedUserRole } from '@pulse/shared';

/** API projection of a user row - never carries `passwordHash`. */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role as SharedUserRole,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Audit snapshot (FR-02.6): email/name/role/active only, no PII payloads. */
export function userAuditSnapshot(user: Pick<User, 'email' | 'name' | 'role' | 'active'>): Record<string, unknown> {
  return { email: user.email, name: user.name, role: user.role, active: user.active };
}
