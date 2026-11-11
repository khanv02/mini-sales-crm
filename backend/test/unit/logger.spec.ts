import type { Request, Response } from 'express';
import type { DestinationStream } from 'pino';
import { createLogger } from '../../src/common/logging/logger';
import { createRequestContextMiddleware } from '../../src/common/logging/request-context.middleware';
import { getRequestContext } from '../../src/common/logging/request-context';
import { buildTestEnv } from '../support/test-env';

function createDestination(): { destination: DestinationStream; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    destination: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  };
}

describe('logger', () => {
  it('writes one-line JSON with service metadata', () => {
    const { destination, lines } = createDestination();
    const logger = createLogger(buildTestEnv({ NODE_ENV: 'development', LOG_LEVEL: 'info' }), destination);

    logger.info({ requestId: 'req-1', route: '/health/live' }, 'request completed');

    const record = JSON.parse(lines.join('')) as Record<string, unknown>;
    expect(record).toMatchObject({
      service: 'pulse-api',
      env: 'development',
      requestId: 'req-1',
      route: '/health/live',
      msg: 'request completed',
    });
    expect(typeof record.time).toBe('string');
  });

  it('redacts credentials and secrets at the top level and one level deep', () => {
    const { destination, lines } = createDestination();
    const logger = createLogger(buildTestEnv({ NODE_ENV: 'development', LOG_LEVEL: 'info' }), destination);

    logger.info(
      {
        password: 'plain-password',
        token: 'access-token',
        secret: 'webhook-secret',
        authorization: 'Bearer abc',
        cookie: 'refresh=abc',
        nested: { token: 'nested-token', password: 'nested-password' },
      },
      'sensitive payload',
    );

    const serialized = lines.join('');
    expect(serialized).not.toContain('plain-password');
    expect(serialized).not.toContain('access-token');
    expect(serialized).not.toContain('webhook-secret');
    expect(serialized).not.toContain('nested-token');
    expect(serialized).toContain('[REDACTED]');
  });
});

describe('request context middleware', () => {
  it('keeps a valid X-Request-Id and exposes it through AsyncLocalStorage', () => {
    const middleware = createRequestContextMiddleware();
    const setHeader = jest.fn();
    const request = { header: () => 'client-request-1' } as unknown as Request;
    const response = { setHeader } as unknown as Response;

    let captured: string | undefined;
    middleware(request, response, () => {
      captured = getRequestContext()?.requestId;
    });

    expect(captured).toBe('client-request-1');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request-1');
  });

  it('generates a request id when the header is missing or invalid', () => {
    const middleware = createRequestContextMiddleware();
    const setHeader = jest.fn();
    const request = { header: () => 'invalid id with spaces' } as unknown as Request;
    const response = { setHeader } as unknown as Response;

    let captured: string | undefined;
    middleware(request, response, () => {
      captured = getRequestContext()?.requestId;
    });

    expect(captured).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', captured);
  });
});
