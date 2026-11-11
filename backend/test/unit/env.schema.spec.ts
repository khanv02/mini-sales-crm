import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvValidationError, loadEnv, loadEnvFile } from '../../src/common/config/env';
import { buildTestEnv } from '../support/test-env';

function minimalSource(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: buildTestEnv().DATABASE_URL,
    REDIS_URL: buildTestEnv().REDIS_URL,
    JWT_ACCESS_SECRET: buildTestEnv().JWT_ACCESS_SECRET,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    JWT_REFRESH_PEPPER: buildTestEnv().JWT_REFRESH_PEPPER,
    WEBHOOK_SECRET_ENC_KEY: buildTestEnv().WEBHOOK_SECRET_ENC_KEY,
    MAIL_FROM: 'Pulse CRM <no-reply@pulse.test>',
  };
}

describe('env schema', () => {
  it('parses a complete environment and applies documented defaults', () => {
    const env = loadEnv(minimalSource());

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173');
    expect(env.AI_PROVIDER).toBe('mock');
    expect(env.ALLOW_SEED).toBe(false);
    expect(env.SEED_PERF).toBe(false);
  });

  it('coerces numbers and booleans from strings', () => {
    const env = loadEnv({
      ...minimalSource(),
      PORT: '4000',
      MAIL_PORT: '2525',
      ALLOW_SEED: 'true',
      SEED_PERF: '1',
    });

    expect(env.PORT).toBe(4000);
    expect(env.MAIL_PORT).toBe(2525);
    expect(env.ALLOW_SEED).toBe(true);
    expect(env.SEED_PERF).toBe(true);
  });

  it('fails fast listing missing keys without echoing values', () => {
    const source = minimalSource();
    delete source.DATABASE_URL;
    delete source.JWT_ACCESS_SECRET;

    expect.assertions(4);
    try {
      loadEnv(source);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const envError = error as EnvValidationError;
      expect(envError.issues.join(' ')).toContain('DATABASE_URL');
      expect(envError.issues.join(' ')).toContain('JWT_ACCESS_SECRET');
      expect(envError.message).not.toContain(buildTestEnv().JWT_ACCESS_SECRET);
    }
  });

  it('rejects a webhook encryption key that is not 32 bytes', () => {
    expect(() => loadEnv({ ...minimalSource(), WEBHOOK_SECRET_ENC_KEY: 'too-short' })).toThrow(
      /WEBHOOK_SECRET_ENC_KEY/,
    );
  });

  it('accepts a base64 webhook encryption key of 32 bytes', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const env = loadEnv({ ...minimalSource(), WEBHOOK_SECRET_ENC_KEY: key });
    expect(env.WEBHOOK_SECRET_ENC_KEY).toBe(key);
  });

  it('treats an empty Sentry DSN as disabled', () => {
    const env = loadEnv({ ...minimalSource(), SENTRY_DSN: '' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('rejects malformed values instead of running half-configured', () => {
    const invalidCases: NodeJS.ProcessEnv[] = [
      { ...minimalSource(), NODE_ENV: 'staging' },
      { ...minimalSource(), LOG_LEVEL: 'verbose' },
      { ...minimalSource(), DATABASE_URL: 'mysql://localhost/pulse' },
      { ...minimalSource(), REDIS_URL: 'http://localhost:6379' },
      { ...minimalSource(), JWT_ACCESS_SECRET: 'short' },
      { ...minimalSource(), JWT_ACCESS_TTL: '15 minutes' },
      { ...minimalSource(), JWT_REFRESH_TTL: 'seven-days' },
      { ...minimalSource(), JWT_REFRESH_PEPPER: 'short' },
      { ...minimalSource(), SENTRY_DSN: 'not-a-url' },
      { ...minimalSource(), AI_PROVIDER: 'anthropic' },
      { ...minimalSource(), ALLOW_SEED: 'yes' },
    ];

    for (const source of invalidCases) {
      expect(() => loadEnv(source)).toThrow(EnvValidationError);
    }
  });

  it('loads the nearest .env file without overriding existing variables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-env-'));
    const envFile = join(directory, '.env');
    writeFileSync(envFile, 'PULSE_ENV_FILE_TEST=loaded\n', 'utf8');

    try {
      process.env.PULSE_ENV_FILE_TEST = 'already-set';
      expect(loadEnvFile(directory)).toBe(envFile);
      expect(process.env.PULSE_ENV_FILE_TEST).toBe('already-set');
    } finally {
      delete process.env.PULSE_ENV_FILE_TEST;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns undefined when no .env exists in the parent chain', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-env-empty-'));
    try {
      expect(loadEnvFile(directory)).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
