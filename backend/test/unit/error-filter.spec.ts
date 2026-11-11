import { BadRequestException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../src/common/errors/app-error';
import { GlobalExceptionFilter, normalizeException } from '../../src/common/errors/global-exception.filter';

function createLoggerMock(): Logger {
  return {
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;
}

function createHost() {
  const json = jest.fn();
  const response = {
    headersSent: false,
    setHeader: jest.fn(),
    status: jest.fn(),
    json,
  };
  response.status.mockReturnValue(response);
  const request = { originalUrl: '/api/v1/unknown?x=1', url: '/api/v1/unknown' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response, json };
}

describe('normalizeException', () => {
  it('keeps AppError status, code and safe details', () => {
    const result = normalizeException(
      new AppError('DEAL_VERSION_CONFLICT', 409, 'Please reload.', { currentVersion: 8 }),
    );
    expect(result).toEqual({
      status: 409,
      code: 'DEAL_VERSION_CONFLICT',
      message: 'Please reload.',
      details: { currentVersion: 8 },
    });
  });

  it('maps HttpException statuses to stable API codes', () => {
    expect(normalizeException(new NotFoundException())).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('maps validation message arrays to VALIDATION_ERROR details', () => {
    const result = normalizeException(new BadRequestException(['email must be an email']));
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.details).toEqual({ messages: ['email must be an email'] });
  });

  it('maps Prisma unique violations without leaking constraint details', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['users_email_key'] },
    });
    const result = normalizeException(error);
    expect(result).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'The resource already exists.',
    });
    expect(JSON.stringify(result)).not.toContain('users_email_key');
  });

  it('maps Prisma connection failures to 503', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Can not reach database', {
      code: 'P1001',
      clientVersion: 'test',
    });
    expect(normalizeException(error)).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('never exposes an unknown error message or stack', () => {
    const result = normalizeException(new Error('secret SQL detail'));
    expect(result).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
  });
});

describe('GlobalExceptionFilter', () => {
  it('returns the uniform error shape with requestId', () => {
    const logger = createLoggerMock();
    const filter = new GlobalExceptionFilter(logger);
    const { host, response, json } = createHost();

    filter.catch(new AppError('NOT_FOUND', 404, 'Missing.'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Missing.' });
    expect(typeof body.requestId).toBe('string');
    expect(body.stack).toBeUndefined();
  });

  it('logs 5xx errors but returns only the generic contract', () => {
    const logger = createLoggerMock();
    const filter = new GlobalExceptionFilter(logger);
    const { host, response, json } = createHost();

    filter.catch(new Error('database password leaked here'), host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain('password leaked');
  });
});
