import { Injectable } from '@nestjs/common';
import { Prisma, type Organization, type RefreshToken, type User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A Prisma client or an interactive transaction client. */
export type PrismaLike = Prisma.TransactionClient | PrismaService;

export type RefreshTokenWithUser = RefreshToken & { user: User };

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

export interface RotateRefreshTokenInput extends NewRefreshToken {
  previousTokenId: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(client?: PrismaLike): PrismaLike {
    return client ?? this.prisma;
  }

  /**
   * Email uniqueness is enforced by the database on `lower(email)`, an
   * expression index Prisma cannot describe, so the lookup uses `findFirst` on
   * the already-normalised address.
   */
  findByEmail(email: string, client?: PrismaLike): Promise<User | null> {
    return this.client(client).user.findFirst({ where: { email } });
  }

  /** Org-scoped profile read for `GET /auth/me` (existence is never leaked across tenants). */
  findProfile(orgId: string, userId: string, client?: PrismaLike): Promise<User | null> {
    return this.client(client).user.findFirst({ where: { id: userId, orgId } });
  }

  createOrganization(client: PrismaLike, name: string): Promise<Organization> {
    return client.organization.create({ data: { name } });
  }

  createUser(
    client: PrismaLike,
    data: { orgId: string; email: string; passwordHash: string; name: string; role?: 'ADMIN' | 'MANAGER' | 'SALES' },
    ): Promise<User> {
    return client.user.create({ data });
  }

  findRefreshTokenByHash(tokenHash: string, client?: PrismaLike): Promise<RefreshTokenWithUser | null> {
    return this.client(client).refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  createRefreshToken(client: PrismaLike, input: NewRefreshToken): Promise<RefreshToken> {
    return client.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
      },
    });
  }

  /**
   * Rotation (FR-01.4): the replacement is inserted and the previous token is
   * revoked with `replacedBy` pointing at it, so a later reuse of the old token
   * is detectable as "already rotated".
   */
  async rotateRefreshToken(client: PrismaLike, input: RotateRefreshTokenInput): Promise<RefreshToken> {
    const created = await this.createRefreshToken(client, input);
    await client.refreshToken.update({
      where: { id: input.previousTokenId },
      data: { revokedAt: new Date(), replacedById: created.id },
    });
    return created;
  }

  /** Revokes every live token of a family; returns how many rows changed. */
  async revokeFamily(familyId: string, client?: PrismaLike): Promise<number> {
    const result = await this.client(client).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
