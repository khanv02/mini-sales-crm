import { Injectable } from '@nestjs/common';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { RedisService } from '../redis/redis.service';

/** Per `(email, IP)` pair: 5 failures inside 15 minutes. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_SECONDS = 900;

/**
 * Per email across all IPs: 20 failures inside 15 minutes. This is the counter an attacker
 * cannot reset by rotating IPs, and it is deliberately looser than the pair limit so a shared
 * office IP does not lock a whole team out.
 */
export const LOGIN_EMAIL_MAX_FAILURES = 20;

/**
 * Per IP across all emails: 50 failures inside 15 minutes. Caps credential stuffing from a
 * single host without punishing a legitimate user whose email is being attacked.
 */
export const LOGIN_IP_MAX_FAILURES = 50;

export interface LoginAttemptKey {
  email: string;
  ip: string;
}

interface Counter {
  key: string;
  limit: number;
}

/**
 * Login lockout (FR-01.5, AC-FR01-07).
 *
 * Three counters are checked, cheapest first:
 *
 * 1. `(email, IP)` — 5 failures / 15 min. The primary limit from the spec.
 * 2. `email` — 20 failures / 15 min. Closes the "rotate the IP" bypass (G6).
 * 3. `ip` — 50 failures / 15 min. Caps credential stuffing from one host.
 *
 * Redis is a *dependency of the security decision*, so an outage fails closed: the login is
 * refused with 503 instead of skipping the counter.
 */
@Injectable()
export class LoginRateLimitService {
  constructor(private readonly redis: RedisService) {}

  private pairKey({ email, ip }: LoginAttemptKey): string {
    return `auth:login:fail:${email.toLowerCase()}:${ip}`;
  }

  private emailKey({ email }: LoginAttemptKey): string {
    return `auth:login:fail:email:${email.toLowerCase()}`;
  }

  private ipKey({ ip }: LoginAttemptKey): string {
    return `auth:login:fail:ip:${ip}`;
  }

  private counters(key: LoginAttemptKey): Counter[] {
    return [
      { key: this.pairKey(key), limit: LOGIN_MAX_FAILURES },
      { key: this.emailKey(key), limit: LOGIN_EMAIL_MAX_FAILURES },
      { key: this.ipKey(key), limit: LOGIN_IP_MAX_FAILURES },
    ];
  }

  private unavailable(): AppError {
    return new AppError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      503,
      'Security checks are temporarily unavailable. Please try again.',
    );
  }

  async assertAllowed(key: LoginAttemptKey): Promise<void> {
    const client = this.redis.getClient();
    const counters = this.counters(key);

    let readings: Array<{ failures: number; ttl: number }>;
    try {
      readings = await Promise.all(
        counters.map(async (counter) => {
          const [count, remaining] = await Promise.all([
            client.get(counter.key),
            client.ttl(counter.key),
          ]);
          return {
            failures: count ? Number(count) : 0,
            ttl: remaining && remaining > 0 ? remaining : LOGIN_WINDOW_SECONDS,
          };
        }),
      );
    } catch {
      throw this.unavailable();
    }

    for (const [index, counter] of counters.entries()) {
      const reading = readings[index];
      if (reading && reading.failures >= counter.limit) {
        throw new AppError(ERROR_CODES.TOO_MANY_ATTEMPTS, 429, 'Too many failed attempts. Try again later.', {
          retryAfter: reading.ttl,
          limit: counter.limit,
          windowSeconds: LOGIN_WINDOW_SECONDS,
        });
      }
    }
  }

  async recordFailure(key: LoginAttemptKey): Promise<void> {
    const client = this.redis.getClient();
    try {
      await Promise.all(
        this.counters(key).map(async (counter) => {
          const failures = await client.incr(counter.key);
          if (failures === 1) {
            await client.expire(counter.key, LOGIN_WINDOW_SECONDS);
          }
        }),
      );
    } catch {
      throw this.unavailable();
    }
  }

  /**
   * A successful login clears the `(email, IP)` window. The per-email and per-IP counters are
   * left alone on purpose: clearing them would let an attacker reset the abuse counters by
   * succeeding once on any account they own.
   */
  async reset(key: LoginAttemptKey): Promise<void> {
    try {
      await this.redis.getClient().del(this.pairKey(key));
    } catch {
      throw this.unavailable();
    }
  }
}
