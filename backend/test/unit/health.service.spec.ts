import { AppError } from '../../src/common/errors/app-error';
import { HealthService } from '../../src/common/health/health.service';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import type { RedisService } from '../../src/common/redis/redis.service';

function createService(options: { databaseFails?: boolean; redisFails?: boolean } = {}): HealthService {
  const prisma = {
    $queryRaw: options.databaseFails
      ? jest.fn().mockRejectedValue(new Error('database down'))
      : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  } as unknown as PrismaService;
  const redis = {
    ping: options.redisFails
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue('PONG'),
  } as unknown as RedisService;

  return new HealthService(prisma, redis);
}

describe('HealthService', () => {
  it('reports live without touching dependencies', () => {
    expect(createService().live()).toEqual({ status: 'ok' });
  });

  it('reports ready when the database and Redis both respond', async () => {
    await expect(createService().ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('returns 503 naming the database when it fails', async () => {
    await expect(createService({ databaseFails: true }).ready()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      details: { checks: { database: 'down', redis: 'up' } },
    });
  });

  it('returns 503 naming Redis when it fails', async () => {
    expect.assertions(2);
    try {
      await createService({ redisFails: true }).ready();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details).toEqual({
        checks: { database: 'up', redis: 'down' },
      });
    }
  });

  it('does not leak dependency error messages', async () => {
    expect.assertions(2);
    try {
      await createService({ databaseFails: true, redisFails: true }).ready();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).not.toContain('database down');
    }
  });
});
