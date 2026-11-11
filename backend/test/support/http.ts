import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function api(app: INestApplication): request.Agent {
  return request(app.getHttpServer());
}

/** First `Set-Cookie` header of a response (throws when the response sets none). */
export function setCookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  if (!first) {
    throw new Error('expected a Set-Cookie header');
  }
  return first;
}

export function cookieValue(setCookie: string): string {
  const [pair] = setCookie.split(';');
  return decodeURIComponent(pair?.split('=')[1] ?? '');
}

/** The `Cookie` header a browser would send back for the given Set-Cookie value. */
export function cookieHeader(setCookie: string): string {
  const [pair] = setCookie.split(';');
  return pair ?? '';
}
