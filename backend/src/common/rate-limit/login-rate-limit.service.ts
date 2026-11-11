import { Injectable } from '@nestjs/common';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { RedisService } from '../redis/redis.service';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_SECONDS = 900;

export interface LoginAttemptKey {
  email: string;
  ip: string;
}

/**
 * Login lockout (FR-01.5, AC-FR01-07): 5 failed attempts inside 15 minutes per
 * `(email, IP)`; the 6th attempt is rejected with 429 + `Retry-After`, even when
 * the password is correct.
 *
 * Redis is a *dependency of the security decision*, so an outage fails closed:
 * the login is refused with 503 instead of skipping the counter.
 */
@Injectable()
export class LoginRateLimitService {
  constructor(private readonly redis: RedisService) {}

  private key({ email, ip }: LoginAttemptKey): string {
    return `auth:login:fail:${email.toLowerCase()}:${ip}`;
  }

  async assertAllowed(key: LoginAttemptKey): Promise<void> {
    const client = this.redis.getClient();
    let failures: number;
    let ttl: number;

    try {
      const [count, remaining] = await Promise.all([
        client.get(this.key(key)),
        client.ttl(this.key(key)),
      ]);
      failures = count ? Number(count) : 0;
      ttl = remaining && remaining > 0 ? remaining : LOGIN_WINDOW_SECONDS;
    } catch {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        503,
        'Security checks are temporarily unavailable. Please try again.',
      );
    }

    if (failures >= LOGIN_MAX_FAILURES) {
      throw new AppError(ERROR_CODES.TOO_MANY_ATTEMPTS, 429, 'Too many failed attempts. Try again later.', {
        retryAfter: ttl,
        limit: LOGIN_MAX_FAILURES,
        windowSeconds: LOGIN_WINDOW_SECONDS,
      });
    }
  }

  async recordFailure(key: LoginAttemptKey): Promise<void> {
    const client = this.redis.getClient();
    try {
      const storageKey = this.key(key);
      const failures = await client.incr(storageKey);
      if (failures === 1) {
        await client.expire(storageKey, LOGIN_WINDOW_SECONDS);
      }
    } catch {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        503,
        'Security checks are temporarily unavailable. Please try again.',
      );
    }
  }

  /** A successful login clears the window for that `(email, IP)` pair. */
  async reset(key: LoginAttemptKey): Promise<void> {
    try {
      await this.redis.getClient().del(this.key(key));
    } catch {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        503,
        'Security checks are temporarily unavailable. Please try again.',
      );
    }
  }
}
