import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENV_TOKEN } from '../config/env.module';
import type { Env } from '../config/env';
import { LOGGER_TOKEN, type Logger } from '../logging/logging.module';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(ENV_TOKEN) env: Env,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {
    super({
      datasourceUrl: env.DATABASE_URL,
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      // Readiness reports the dependency; the process still starts so /health/live works.
      this.logger.warn({ err: error }, 'database connection is not ready at startup');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
