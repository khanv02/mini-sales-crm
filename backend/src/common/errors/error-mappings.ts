import type { AppError } from './app-error';

export interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface HttpMapping {
  code: string;
  message: string;
}

const HTTP_MAPPINGS: Record<number, HttpMapping> = {
  400: { code: 'VALIDATION_ERROR', message: 'Invalid data.' },
  401: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
  404: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  409: { code: 'CONFLICT', message: 'The request conflicts with the current state.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The payload is too large.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  500: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
};

export const PRISMA_MAPPINGS: Record<string, NormalizedError> = {
  P2002: { status: 409, code: 'CONFLICT', message: 'The resource already exists.' },
  P2003: { status: 400, code: 'VALIDATION_ERROR', message: 'A referenced resource is invalid.' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  P2034: { status: 409, code: 'CONFLICT', message: 'The request conflicts with the current state.' },
  P1001: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable.' },
  P1002: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable.' },
  P1008: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable.' },
  P1017: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable.' },
  P2024: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable.' },
};

function fromAppError(error: AppError): NormalizedError {
  return {
    status: error.status,
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

function fromHttpStatus(status: number): NormalizedError {
  const mapped = HTTP_MAPPINGS[status];
  if (mapped) {
    return { status, ...mapped };
  }
  if (status >= 500) {
    return { status: 500, ...HTTP_MAPPINGS[500]! };
  }
  return { status, code: 'VALIDATION_ERROR', message: 'The request is invalid.' };
}

export { fromAppError, fromHttpStatus };
