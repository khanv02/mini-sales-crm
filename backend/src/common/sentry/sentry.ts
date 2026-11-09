import * as Sentry from '@sentry/node';
import type { Env } from '../config/env';

let initialized = false;

export interface SentryContext {
  requestId: string;
  route?: string;
  orgId?: string;
}

export function initSentry(env: Env): boolean {
  if (env.NODE_ENV === 'test' || !env.SENTRY_DSN) {
    initialized = false;
    return false;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  initialized = true;
  return true;
}

export function captureException(error: unknown, context: SentryContext): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('requestId', context.requestId);
    if (context.route) {
      scope.setTag('route', context.route);
    }
    if (context.orgId) {
      scope.setTag('orgId', context.orgId);
    }
    Sentry.captureException(error);
  });
}

export function isSentryInitialized(): boolean {
  return initialized;
}
