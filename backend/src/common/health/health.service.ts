import { Injectable } from '@nestjs/common';
import type { HealthReport } from '@pulse/shared';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const READINESS_TIMEOUT_MS = 1_000;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dependency check timed out')), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('dependency check failed'));
      },
    );
  });
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthReport> {
    const [database, redis] = await Promise.allSettled([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS),
      withTimeout(this.redis.ping(), READINESS_TIMEOUT_MS),
    ]);

    const checks: HealthReport['checks'] = {
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };

    if (checks.database === 'down' || checks.redis === 'down') {
      throw new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service dependencies are not ready.', {
        checks,
      });
    }

    return { status: 'ok', checks };
  }
}
