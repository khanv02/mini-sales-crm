import 'reflect-metadata';
import { createApp } from './app';
import { loadEnv, loadEnvFile } from './common/config/env';
import { createLogger } from './common/logging/logger';
import { initSentry } from './common/sentry/sentry';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  initSentry(env);

  const logger = createLogger(env);
  const app = await createApp(env);
  await app.listen(env.PORT);

  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      docs: env.NODE_ENV === 'production' ? undefined : '/api/docs',
    },
    'Pulse CRM API started',
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(`Pulse CRM API failed to start:\n${message}`);
  process.exit(1);
});
