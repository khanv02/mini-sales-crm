import { AppError } from '../../src/common/errors/app-error';
import {
  LOGIN_EMAIL_MAX_FAILURES,
  LOGIN_IP_MAX_FAILURES,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
  LoginRateLimitService,
} from '../../src/common/rate-limit/login-rate-limit.service';
import type { RedisService } from '../../src/common/redis/redis.service';

interface FakeRedis {
  store: Map<string, string>;
  ttls: Map<string, number>;
  failures: Map<string, string>;
  get: jest.Mock;
  ttl: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
}

function createFakeRedis(behaviour: { broken?: boolean } = {}): FakeRedis {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const failures = new Map<string, string>();

  const guard = <T>(value: T): T => {
    if (behaviour.broken) {
      throw new Error('redis is unavailable');
    }
    return value;
  };

  return {
    store,
    ttls,
    failures,
    get: jest.fn((key: string) => Promise.resolve(guard(store.get(key) ?? null))),
    ttl: jest.fn((key: string) => Promise.resolve(guard(ttls.get(key) ?? -2))),
    incr: jest.fn((key: string) => {
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return Promise.resolve(guard(next));
    }),
    expire: jest.fn((key: string, seconds: number) => {
      ttls.set(key, seconds);
      return Promise.resolve(guard(1));
    }),
    del: jest.fn((key: string) => {
      const existed = store.delete(key);
      return Promise.resolve(guard(existed ? 1 : 0));
    }),
  };
}

function createService(behaviour: { broken?: boolean } = {}): {
  service: LoginRateLimitService;
  redis: FakeRedis;
} {
  const redis = createFakeRedis(behaviour);
  const redisService = { getClient: () => redis } as unknown as RedisService;
  return { service: new LoginRateLimitService(redisService), redis };
}

const attempt = { email: 'Sales@Acme.test', ip: '127.0.0.1' };

describe('LoginRateLimitService', () => {
  it('allows an attempt when nothing was recorded yet', async () => {
    const { service } = createService();
    await expect(service.assertAllowed(attempt)).resolves.toBeUndefined();
  });

  it('records failures with a 15 minute window and normalises the email key', async () => {
    const { service, redis } = createService();
    await service.recordFailure(attempt);

    expect(redis.incr).toHaveBeenCalledWith('auth:login:fail:sales@acme.test:127.0.0.1');
    expect(redis.expire).toHaveBeenCalledWith('auth:login:fail:sales@acme.test:127.0.0.1', LOGIN_WINDOW_SECONDS);
  });

  it('sets the window only on the first failure of each counter', async () => {
    const { service, redis } = createService();
    await service.recordFailure(attempt);
    await service.recordFailure(attempt);

    // Three counters (pair, email, IP); each sets its TTL once, on its first increment.
    expect(redis.expire).toHaveBeenCalledTimes(3);
  });

  it('blocks the 6th attempt with 429 and Retry-After', async () => {
    const { service } = createService();
    for (let index = 0; index < LOGIN_MAX_FAILURES; index += 1) {
      await service.recordFailure(attempt);
    }

    expect.assertions(4);
    try {
      await service.assertAllowed(attempt);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.status).toBe(429);
      expect(appError.code).toBe('TOO_MANY_ATTEMPTS');
      expect(appError.details).toMatchObject({ retryAfter: LOGIN_WINDOW_SECONDS, limit: LOGIN_MAX_FAILURES });
    }
  });

  it('clears the counter after a successful login', async () => {
    const { service, redis } = createService();
    await service.recordFailure(attempt);
    await service.reset(attempt);

    expect(redis.del).toHaveBeenCalledWith('auth:login:fail:sales@acme.test:127.0.0.1');
    await expect(service.assertAllowed(attempt)).resolves.toBeUndefined();
  });

  it('fails closed when Redis is unavailable', async () => {
    const { service } = createService({ broken: true });

    await expect(service.assertAllowed(attempt)).rejects.toMatchObject({ status: 503 });
    await expect(service.recordFailure(attempt)).rejects.toMatchObject({ status: 503 });
    await expect(service.reset(attempt)).rejects.toMatchObject({ status: 503 });
  });

  it('blocks an email across rotating IPs once the per-email cap is reached (G6)', async () => {
    const { service } = createService();

    // Five failures per IP never trips the pair limit, but the email counter keeps climbing.
    for (let index = 0; index < LOGIN_EMAIL_MAX_FAILURES; index += 1) {
      await service.recordFailure({ email: attempt.email, ip: `10.0.0.${index}` });
    }

    await expect(
      service.assertAllowed({ email: attempt.email, ip: '10.0.0.250' }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      details: { limit: LOGIN_EMAIL_MAX_FAILURES },
    });
  });

  it('caps failures from one IP across many emails (G6)', async () => {
    const { service } = createService();

    for (let index = 0; index < LOGIN_IP_MAX_FAILURES; index += 1) {
      await service.recordFailure({ email: `victim-${index}@acme.test`, ip: attempt.ip });
    }

    await expect(
      service.assertAllowed({ email: 'someone-else@acme.test', ip: attempt.ip }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      details: { limit: LOGIN_IP_MAX_FAILURES },
    });
  });

  it('keeps the per-email and per-IP counters after a successful login (G6)', async () => {
    const { service } = createService();
    await service.recordFailure(attempt);
    await service.reset(attempt);

    // The pair counter is cleared, so the next attempt is allowed...
    await expect(service.assertAllowed(attempt)).resolves.toBeUndefined();

    // ...but the abuse counters still hold the earlier failure.
    const { service: fresh, redis } = createService();
    await fresh.recordFailure(attempt);
    await fresh.reset(attempt);
    expect(redis.store.get('auth:login:fail:email:sales@acme.test')).toBe('1');
    expect(redis.store.get(`auth:login:fail:ip:${attempt.ip}`)).toBe('1');
  });
});
