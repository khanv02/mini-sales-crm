import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import type { Request, Response } from 'express';
import { AppError, isAppError } from './app-error';
import { fromAppError, fromHttpStatus, PRISMA_MAPPINGS, type NormalizedError } from './error-mappings';
import { getRequestContext } from '../logging/request-context';
import { captureException } from '../sentry/sentry';

export function normalizeException(exception: unknown): NormalizedError {
  if (isAppError(exception)) {
    return fromAppError(exception);
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_MAPPINGS[exception.code];
    if (mapped) {
      return mapped;
    }
    return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
  }

  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (status === HttpStatus.BAD_REQUEST && typeof response === 'object' && response !== null) {
      const message = (response as { message?: unknown }).message;
      if (Array.isArray(message)) {
        return {
          status,
          code: 'VALIDATION_ERROR',
          message: 'Invalid data.',
          details: { messages: message.map(String) },
        };
      }
    }
    return fromHttpStatus(status);
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const normalized = normalizeException(exception);
    const context = getRequestContext();
    const requestId = request.requestId ?? context?.requestId ?? randomUUID();
    const route = request.originalUrl?.split('?')[0] ?? request.url;

    if (!response.headersSent) {
      response.setHeader('X-Request-Id', requestId);
    }

    if (normalized.status >= 500) {
      this.logger.error(
        { err: exception, requestId, route, status: normalized.status },
        'request failed with a server error',
      );
      captureException(exception, {
        requestId,
        route,
        orgId: context?.orgId,
      });
    } else {
      this.logger.warn(
        { requestId, route, status: normalized.status, code: normalized.code },
        'request rejected',
      );
    }

    if (response.headersSent) {
      return;
    }

    const body: Record<string, unknown> = {
      code: normalized.code,
      message: normalized.message,
      requestId,
    };
    if (normalized.details) {
      body.details = normalized.details;
    }

    // 429 carries Retry-After (docs/api-conventions.md section 7); the service
    // puts the remaining window in `details.retryAfter`.
    const retryAfter = normalized.details?.retryAfter;
    if (normalized.status === 429 && typeof retryAfter === 'number' && retryAfter > 0) {
      response.setHeader('Retry-After', String(Math.ceil(retryAfter)));
    }

    response.status(normalized.status).json(body);
  }
}

export { AppError };
