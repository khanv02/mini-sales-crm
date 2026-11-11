import { Injectable } from '@nestjs/common';
import type { AuthUser, UserCreateRequest, UserListQuery, UserListResponse, UserUpdateRequest } from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrincipalService } from '../../common/auth/principal.service';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { isUniqueConstraintViolation } from '../../common/errors/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { toAuthUser, userAuditSnapshot } from './user.mapper';
import { UsersRepository } from './users.repository';

export interface UserMutationMeta {
  ip?: string;
}

/** Member management (FR-02). Admin-only access is enforced by the controller guards. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalService,
  ) {}

  async list(orgId: string, query: UserListQuery): Promise<UserListResponse> {
    const page = await this.repository.list(orgId, {
      role: query.role,
      active: query.active,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: page.rows.map(toAuthUser),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async create(
    actor: AuthenticatedUser,
    input: UserCreateRequest,
    meta: UserMutationMeta = {},
  ): Promise<AuthUser> {
    const passwordHash = await this.passwords.hash(input.password);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await this.repository.create(tx, {
          orgId: actor.orgId,
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role,
        });

        await this.audit.record(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entity: 'User',
          entityId: user.id,
          action: 'CREATE',
          after: userAuditSnapshot(user),
          ip: meta.ip ?? null,
        });

        return user;
      });

      return toAuthUser(created);
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'email')) {
        throw new AppError(ERROR_CODES.EMAIL_TAKEN, 409, 'This email is already registered.');
      }
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    targetId: string,
    input: UserUpdateRequest,
    meta: UserMutationMeta = {},
  ): Promise<AuthUser> {
    const target = await this.repository.findByOrgAndId(actor.orgId, targetId);
    if (!target) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'The requested resource was not found.');
    }

    const deactivating = input.active === false;
    if (deactivating && target.id === actor.userId) {
      throw new AppError(ERROR_CODES.CANNOT_DEACTIVATE_SELF, 409, 'You cannot deactivate your own account.');
    }

    const demoting = input.role !== undefined && input.role !== 'ADMIN';
    const removesAnAdmin = target.role === 'ADMIN' && target.active && (deactivating || demoting);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removesAnAdmin) {
        const activeAdmins = await this.repository.lockActiveAdmins(tx, actor.orgId);
        if (activeAdmins <= 1) {
          throw new AppError(
            ERROR_CODES.LAST_ADMIN,
            409,
            'The last admin cannot be demoted or deactivated.',
          );
        }
      }

      const user = await this.repository.update(tx, actor.orgId, target.id, input);

      await this.audit.record(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entity: 'User',
        entityId: user.id,
        action: 'UPDATE',
        before: userAuditSnapshot(target),
        after: userAuditSnapshot(user),
        ip: meta.ip ?? null,
      });

      return user;
    });

    // Role/active changes apply from the next request (AC-FR02.4).
    this.principals.invalidate(updated.id);
    return toAuthUser(updated);
  }
}
