import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Env } from './common/config/env';

export function setupSwagger(app: INestApplication, env: Env): void {
  const config = new DocumentBuilder()
    .setTitle('Pulse CRM API')
    .setDescription('REST API for Pulse CRM. Contract: docs/api/openapi.yaml.')
    .setVersion(env.APP_VERSION)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
