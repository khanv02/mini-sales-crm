import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { TokenService } from '../../common/auth/token.service';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { isUniqueConstraintViolation } from '../../common/errors/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginRateLimitService } from '../../common/rate-limit/login-rate-limit.service';
import { PasswordService } from '../../common/security/password.service';
import { toAuthUser, userAuditSnapshot } from '../users/user.mapper';
import { AuthRepository } from './auth.repository';

export interface RequestMeta {
  ip: string;
  userAgent?: string;
}

export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
}

/**
 * Authentication flows (FR-01): register, login with lockout, refresh rotation
 * with reuse detection, logout. Every mutation is audited in the same
 * transaction as the business change (C4).
 */
@Injectable()
export class AuthService {
  private dummyHashPromise?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly limiter: LoginRateLimitService,
    private readonly audit: AuditService,
  ) {}

  private isEmailTaken(error: unknown): boolean {
    return isUniqueConstraintViolation(error, 'email');
  }

  /** Verifying against a real hash keeps a missing email indistinguishable by timing. */
  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.passwords.hash('pulse-crm-dummy-password');
    return this.dummyHashPromise;
  }

  async register(input: RegisterRequest, meta: RequestMeta): Promise<IssuedSession> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: User;

    try {
      user = await this.prisma.$transaction(async (tx) => {
        const organization = await this.repository.createOrganization(tx, input.orgName);
        const admin = await this.repository.createUser(tx, {
          orgId: organization.id,
          email: input.email,
          passwordHash,
          name: input.name,
          role: 'ADMIN',
        });

        await this.audit.record(tx, {
          orgId: organization.id,
          actorId: admin.id,
          entity: 'Organization',
          entityId: organization.id,
          action: 'CREATE',
          after: {
            name: organization.name,
            currency: organization.currency,
            timezone: organization.timezone,
          },
          ip: meta.ip,
        });
        await this.audit.record(tx, {
          orgId: organization.id,
          actorId: admin.id,
          entity: 'User',
          entityId: admin.id,
          action: 'CREATE',
          after: userAuditSnapshot(admin),
          ip: meta.ip,
        });

        return admin;
      });
    } catch (error) {
      if (this.isEmailTaken(error)) {
        throw new AppError(ERROR_CODES.EMAIL_TAKEN, 409, 'This email is already registered.');
      }
      throw error;
    }

    return this.issueSession(user, randomUUID(), meta);
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<IssuedSession> {
    const attempt = { email: input.email, ip: meta.ip };
    await this.limiter.assertAllowed(attempt);

    const user = await this.repository.findByEmail(input.email);
    const passwordMatches = await this.passwords.matches(
      user?.passwordHash ?? (await this.dummyHash()),
      input.password,
    );

    if (!user || !passwordMatches) {
      await this.limiter.recordFailure(attempt);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Email or password is incorrect.');
    }
    if (!user.active) {
      throw new AppError(ERROR_CODES.USER_INACTIVE, 401, 'This account has been deactivated.');
    }

    await this.limiter.reset(attempt);
    return this.issueSession(user, randomUUID(), meta);
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<IssuedSession> {
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const existing = await this.repository.findRefreshTokenByHash(tokenHash);

    if (!existing || !this.tokens.refreshTokenMatches(existing.tokenHash, tokenHash)) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID, 401, 'The token is not valid.');
    }

    if (existing.revokedAt) {
      if (existing.replacedById) {
        // Reuse of a rotated token: assume theft and revoke the whole family.
        await this.repository.revokeFamily(existing.familyId);
        throw new AppError(
          ERROR_CODES.TOKEN_REUSED,
          401,
          'This session was already rotated. Please sign in again.',
        );
      }
      throw new AppError(ERROR_CODES.REFRESH_TOKEN_REVOKED, 401, 'This session has been signed out.');
    }

    const now = new Date();
    if (existing.expiresAt <= now) {
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 401, 'The token has expired.');
    }
    if (!existing.user.active) {
      throw new AppError(ERROR_CODES.USER_INACTIVE, 401, 'This account has been deactivated.');
    }

    const nextToken = this.tokens.issueRefreshToken();
    await this.repository.rotateRefreshToken(this.prisma, {
      previousTokenId: existing.id,
      userId: existing.userId,
      familyId: existing.familyId,
      tokenHash: this.tokens.hashRefreshToken(nextToken),
      expiresAt: this.tokens.refreshTokenExpiry(now),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });

    const access = this.tokens.signAccessToken(existing.user);
    return {
      response: {
        accessToken: access.token,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
        user: toAuthUser(existing.user),
      },
      refreshToken: nextToken,
    };
  }

  /** Idempotent: an unknown or already revoked token still logs out cleanly (FR-01.6). */
  async logout(rawToken: string): Promise<void> {
    const existing = await this.repository.findRefreshTokenByHash(this.tokens.hashRefreshToken(rawToken));
    if (!existing) {
      return;
    }
    await this.repository.revokeFamily(existing.familyId);
  }

  async me(principal: AuthenticatedUser): Promise<AuthUser> {
    const user = await this.repository.findProfile(principal.orgId, principal.userId);
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }
    return toAuthUser(user);
  }

  private async issueSession(user: User, familyId: string, meta: RequestMeta): Promise<IssuedSession> {
    const access = this.tokens.signAccessToken(user);
    const refreshToken = this.tokens.issueRefreshToken();

    await this.repository.createRefreshToken(this.prisma, {
      userId: user.id,
      tokenHash: this.tokens.hashRefreshToken(refreshToken),
      familyId,
      expiresAt: this.tokens.refreshTokenExpiry(),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });

    return {
      response: {
        accessToken: access.token,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
        user: toAuthUser(user),
      },
      refreshToken,
    };
  }
}
