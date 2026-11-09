import type { RequestHandler } from 'express';
import type { Logger } from './logger';
import { getRequestContext } from './request-context';

export function createRequestLoggerMiddleware(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const context = getRequestContext();
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info(
        {
          requestId: context?.requestId ?? request.requestId,
          method: request.method,
          route: request.originalUrl.split('?')[0],
          status: response.statusCode,
          latencyMs: Math.round(durationMs * 10) / 10,
          userId: context?.userId,
          orgId: context?.orgId,
        },
        'request completed',
      );
    });

    next();
  };
}
