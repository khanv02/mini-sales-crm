import type { Logger } from 'pino';
import { DEFAULT_JOB_OPTIONS, redisConnectionFromUrl } from '../../src/common/queue/queue.config';
import { QueueService } from '../../src/common/queue/queue.service';
import { buildTestEnv } from '../support/test-env';

const logger = { warn: jest.fn(), info: jest.fn() } as unknown as Logger;

describe('queue configuration', () => {
  it('uses bounded retries with exponential backoff', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 1_000 });
  });

  it('parses a Redis URL including credentials, database and TLS', () => {
    expect(redisConnectionFromUrl('redis://:s%40cret@example.test:6380/2')).toMatchObject({
      host: 'example.test',
      port: 6380,
      password: 's@cret',
      db: 2,
      tls: undefined,
    });

    expect(redisConnectionFromUrl('rediss://cache.example.test')).toMatchObject({
      host: 'cache.example.test',
      port: 6379,
      db: 0,
      tls: {},
    });
  });

  it('exposes the default job options without opening a connection', async () => {
    const service = new QueueService(buildTestEnv(), logger);
    expect(service.getDefaultJobOptions()).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
