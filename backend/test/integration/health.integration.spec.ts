import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/common/config/env';

describe('health endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 while the process is alive', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready checks PostgreSQL and Redis', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('echoes a supplied X-Request-Id and generates one when absent', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'integration-request-1');
    expect(echoed.headers['x-request-id']).toBe('integration-request-1');

    const generated = await request(app.getHttpServer()).get('/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('applies helmet headers and keeps health outside the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    const prefixed = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(prefixed.status).toBe(404);
  });

  it('returns the uniform error shape for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(response.body.stack).toBeUndefined();
  });

  it('returns 503 naming Redis when it is unavailable, without leaking the URL', async () => {
    const badEnv = loadEnv({ ...process.env, REDIS_URL: 'redis://127.0.0.1:6390' });
    const badApp = await createApp(badEnv);
    await badApp.init();

    try {
      const response = await request(badApp.getHttpServer()).get('/health/ready');
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body.details.checks).toEqual({ database: 'up', redis: 'down' });
      expect(JSON.stringify(response.body)).not.toContain('6390');
    } finally {
      await badApp.close();
    }
  });
});
