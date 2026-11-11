import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { Env } from '../../src/common/config/env';

export const REPO_ROOT = resolve(__dirname, '../../..');

const TEST_DEFAULTS: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://pulse:pulse@localhost:5432/pulse?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters',
  WEBHOOK_SECRET_ENC_KEY: '0'.repeat(64),
  MAIL_FROM: 'Pulse CRM <no-reply@pulse.test>',
};

/**
 * Prepare the test process: load the nearest `.env`, then fill only the
 * variables that are still missing with safe local/test defaults.
 */
export function prepareTestEnvironment(): void {
  const envFile = join(REPO_ROOT, '.env');
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile });
  }

  process.env.NODE_ENV = 'test';
  for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function buildTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    WEB_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    APP_VERSION: '0.1.0',
    DATABASE_URL: TEST_DEFAULTS.DATABASE_URL!,
    REDIS_URL: TEST_DEFAULTS.REDIS_URL!,
    JWT_ACCESS_SECRET: TEST_DEFAULTS.JWT_ACCESS_SECRET!,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    JWT_REFRESH_PEPPER: TEST_DEFAULTS.JWT_REFRESH_PEPPER!,
    WEBHOOK_SECRET_ENC_KEY: TEST_DEFAULTS.WEBHOOK_SECRET_ENC_KEY!,
    MAIL_HOST: 'localhost',
    MAIL_PORT: 1025,
    MAIL_FROM: TEST_DEFAULTS.MAIL_FROM!,
    SENTRY_DSN: undefined,
    AI_PROVIDER: 'mock',
    AI_MODEL: undefined,
    AI_ORG_DAILY_TOKEN_LIMIT: 200_000,
    AI_USER_DAILY_TOKEN_LIMIT: 50_000,
    ALLOW_SEED: false,
    SEED_PERF: false,
    ...overrides,
  };
}

export function findEnvFile(startDir: string = process.cwd()): string | undefined {
  let current = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}
