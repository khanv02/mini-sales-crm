import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { API_PREFIX, HEALTH_LIVE_PATH, HEALTH_READY_PATH } from '@pulse/shared';
import { AppModule } from './app.module';
import type { Env } from './common/config/env';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { createLogger } from './common/logging/logger';
import { createRequestContextMiddleware } from './common/logging/request-context.middleware';
import { createRequestLoggerMiddleware } from './common/logging/request-logger.middleware';
import { setupSwagger } from './swagger';

export async function createApp(env: Env): Promise<INestApplication> {
  const logger = createLogger(env);

  const app = await NestFactory.create(AppModule.forRoot(env), {
    logger: false,
    bodyParser: false,
  });

  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false }));
  app.enableCors({
    origin: env.WEB_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    credentials: true,
  });

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(createRequestContextMiddleware());
  app.use(createRequestLoggerMiddleware(logger));

  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: HEALTH_LIVE_PATH, method: RequestMethod.GET },
      { path: HEALTH_READY_PATH, method: RequestMethod.GET },
    ],
  });

  if (env.NODE_ENV !== 'production') {
    setupSwagger(app, env);
  }

  app.enableShutdownHooks();
  return app;
}
