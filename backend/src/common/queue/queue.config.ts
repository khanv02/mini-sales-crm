import type { DefaultJobOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export const SYSTEM_QUEUE = 'system';

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1_000,
  },
  removeOnComplete: {
    age: 3_600,
    count: 1_000,
  },
  removeOnFail: {
    age: 86_400,
    count: 1_000,
  },
};

export function redisConnectionFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const database = parsed.pathname.replace('/', '');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: database ? Number(database) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: 1,
  };
}
