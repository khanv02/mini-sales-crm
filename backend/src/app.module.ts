import { DynamicModule, Module } from '@nestjs/common';
import { EnvModule } from './common/config/env.module';
import type { Env } from './common/config/env';
import { HealthModule } from './common/health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './common/queue/queue.module';
import { RedisModule } from './common/redis/redis.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        LoggingModule.forRoot(env),
        PrismaModule,
        RedisModule,
        QueueModule,
        HealthModule,
      ],
    };
  }
}
