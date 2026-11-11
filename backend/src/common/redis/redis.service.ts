import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV_TOKEN } from '../config/env.module';
import type { Env } from '../config/env';
import { LOGGER_TOKEN, type Logger } from '../logging/logging.module';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: Redis;
  private connectionErrorLogged = false;

  constructor(
    @Inject(ENV_TOKEN) env: Env,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
    });

    this.client.on('error', (error: Error) => {
      if (!this.connectionErrorLogged) {
        this.connectionErrorLogged = true;
        this.logger.warn({ err: error.message }, 'redis connection is not ready');
      }
    });
    this.client.on('ready', () => {
      this.connectionErrorLogged = false;
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch {
      // Readiness keeps reporting the failure; the API must still start.
    }
  }

  async ping(): Promise<string> {
    if (this.client.status !== 'ready') {
      try {
        await this.client.connect();
      } catch {
        // Fall through to ping, which rejects with the current connection error.
      }
    }
    return this.client.ping();
  }

  /**
   * Raw client for callers that need commands beyond `ping` (rate-limit counters,
   * short-lived caches). Callers that make a security decision must handle a
   * rejection as "dependency unavailable" and fail closed.
   */
  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    this.client.disconnect();
  }
}
