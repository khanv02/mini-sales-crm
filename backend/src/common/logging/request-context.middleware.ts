import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { REQUEST_ID_HEADER } from '@pulse/shared';
import { runWithRequestContext } from './request-context';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function createRequestContextMiddleware(): RequestHandler {
  return (request, response, next) => {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    runWithRequestContext({ requestId }, () => {
      next();
    });
  };
}
