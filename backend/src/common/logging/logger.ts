import pino, { type DestinationStream, type Logger } from 'pino';
import type { Env } from '../config/env';

export type { Logger };

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'cookie',
  'authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.cookie',
  '*.authorization',
];

export function createLogger(env: Env, destination?: DestinationStream): Logger {
  return pino(
    {
      level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
      base: {
        service: 'pulse-api',
        env: env.NODE_ENV,
        release: env.APP_VERSION,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    destination,
  );
}
