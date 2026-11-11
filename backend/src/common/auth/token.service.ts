import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { ENV_TOKEN } from '../config/env.module';
import type { Env } from '../config/env';
import { AppError, ERROR_CODES } from '../errors/app-error';

const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  orgId: string;
  role: UserRole;
  active: boolean;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
  jti: string;
  expiresAt: Date;
}

/** Parses `15m`, `7d`, `3600s`, `2h` into seconds (defaults to 0 when malformed). */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3_600 : 86_400;
  return amount * multiplier;
}

/**
 * Access + refresh token mechanics (FR-01.3, FR-01.4).
 *
 * - Access: HS256 JWT with `sub`, `orgId`, `role`, `active`, `jti`.
 * - Refresh: opaque 32-byte token, never stored in the clear; the database keeps
 *   `HMAC-SHA256(token, pepper)` and the service compares hashes in constant time.
 */
@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {
    this.accessTtlSeconds = parseDurationSeconds(env.JWT_ACCESS_TTL) || 900;
    this.refreshTtlSeconds = parseDurationSeconds(env.JWT_REFRESH_TTL) || 604_800;
  }

  get accessTokenTtlSeconds(): number {
    return this.accessTtlSeconds;
  }

  get refreshTokenTtlSeconds(): number {
    return this.refreshTtlSeconds;
  }

  signAccessToken(
    user: { id: string; orgId: string; role: UserRole; active: boolean },
    options: { jti?: string; now?: Date } = {},
  ): IssuedAccessToken {
    const jti = options.jti ?? randomUUID();
    const issuedAt = options.now ?? new Date();
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1_000);
    const expiresAt = new Date(issuedAt.getTime() + this.accessTtlSeconds * 1_000);

    // `iat` is part of the payload so a fake clock (tests) shifts `exp` too.
    const payload: Omit<AccessTokenClaims, 'exp'> = {
      sub: user.id,
      orgId: user.orgId,
      role: user.role,
      active: user.active,
      jti,
      iat: issuedAtSeconds,
    };

    const signOptions: SignOptions = {
      expiresIn: this.accessTtlSeconds,
    };

    const token = jwt.sign(payload, this.env.JWT_ACCESS_SECRET, signOptions);
    return { token, expiresIn: this.accessTtlSeconds, jti, expiresAt };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const claims = jwt.verify(token, this.env.JWT_ACCESS_SECRET);
      if (typeof claims === 'string' || !claims.sub) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID, 401, 'The token is not valid.');
      }
      return claims as AccessTokenClaims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 401, 'The token has expired.');
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(ERROR_CODES.TOKEN_INVALID, 401, 'The token is not valid.');
    }
  }

  issueRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.env.JWT_REFRESH_PEPPER).update(token).digest('hex');
  }

  /** Constant-time comparison of two refresh-token hashes (constitution C: security). */
  refreshTokenMatches(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  refreshTokenExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + this.refreshTtlSeconds * 1_000);
  }
}
