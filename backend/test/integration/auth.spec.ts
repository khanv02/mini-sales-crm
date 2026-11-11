import { createHmac, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import { disconnect, prisma, resetDatabase, resetRateLimits, TEST_PASSWORD } from '../factories';
import { cookieHeader, cookieValue, setCookieHeader } from '../support/http';

/** Audits carry a BigInt id, so JSON.stringify needs a replacer. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

describe('auth endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv());
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetRateLimits();
    // The 30s principal cache is per process; clear it so each test starts clean.
    app.get(PrincipalService).clear();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
    await app.close();
  });

  function registerBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      orgName: 'Acme',
      name: 'Admin Acme',
      email: `admin-${randomUUID().slice(0, 8)}@acme.test`,
      password: TEST_PASSWORD,
      ...overrides,
    };
  }

  it('POST /auth/register creates the org + admin and returns tokens (AC-FR01-01, AC-FR01-04)', async () => {
    const body = registerBody();

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { email: body.email, name: 'Admin Acme', role: 'ADMIN', active: true },
    });
    expect(typeof response.body.accessToken).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD);
    expect(response.body.user.passwordHash).toBeUndefined();

    const cookie = setCookieHeader(response);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookieValue(cookie).length).toBeGreaterThanOrEqual(32);

    const organizations = await prisma.organization.findMany();
    expect(organizations).toHaveLength(1);
    expect(organizations[0]?.name).toBe('Acme');

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ role: 'ADMIN', active: true, orgId: organizations[0]?.id });
    expect(users[0]?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(users[0]?.passwordHash).not.toContain(TEST_PASSWORD);

    const audits = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(audits.map((row) => `${row.entity}:${row.action}`)).toEqual([
      'Organization:CREATE',
      'User:CREATE',
    ]);
    expect(audits[1]?.actorId).toBe(users[0]?.id);
    expect(serialize(audits)).not.toContain(TEST_PASSWORD);
    expect(serialize(audits)).not.toContain('passwordHash');
  });

  it('rejects a duplicate email in any case and creates no org (AC-FR01-02)', async () => {
    const email = `dupe-${randomUUID().slice(0, 8)}@acme.test`;
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(registerBody({ email }));
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(registerBody({ email: email.toUpperCase() }));

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerBody({ email }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_TAKEN');
    await expect(prisma.organization.count()).resolves.toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('rejects a weak password with field errors and no side effects (AC-FR01-03)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerBody({ password: 'short' }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.fields.password).toEqual(expect.any(Array));
    await expect(prisma.organization.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('creates exactly one org when the same email registers concurrently (T107)', async () => {
    const email = `race-${randomUUID().slice(0, 8)}@acme.test`;
    const body = registerBody({ email });

    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/register').send(body),
      request(app.getHttpServer()).post('/api/v1/auth/register').send(body),
    ]);

    expect(responses.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(responses.find((item) => item.status === 409)?.body.code).toBe('EMAIL_TAKEN');
    await expect(prisma.organization.count()).resolves.toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  async function registerAndLogin(overrides: Record<string, unknown> = {}): Promise<{
    email: string;
    accessToken: string;
    cookie: string;
    userId: string;
  }> {
    const body = registerBody(overrides);
    const registered = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);
    const email = String(body.email);
    const cookie = cookieHeader(setCookieHeader(registered));

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD });

    return {
      email,
      accessToken: login.body.accessToken as string,
      cookie: cookieHeader(setCookieHeader(login)) || cookie,
      userId: registered.body.user.id as string,
    };
  }

  it('POST /auth/login returns a usable access token and a refresh cookie (AC-FR01-05)', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.accessToken).toBe('string');
    expect(response.body.user.role).toBe('ADMIN');
    expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD);
    expect(setCookieHeader(response)).toContain('HttpOnly');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: body.email, role: 'ADMIN', active: true });
  });

  it('never reveals whether an email exists on login (AC-FR01-06)', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: 'WrongPassword123!' });
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `missing-${randomUUID().slice(0, 8)}@acme.test`, password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('locks the 6th attempt with 429 + Retry-After, even with the right password (AC-FR01-07)', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: 'WrongPassword123!' });
      expect(denied.status).toBe(401);
    }

    const locked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: TEST_PASSWORD });

    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(locked.body.details).toMatchObject({ limit: 5, windowSeconds: 900 });
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('clears the failure counter after a successful login (AC-FR01-07)', async () => {
    const body = registerBody();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: body.email, password: 'WrongPassword123!' });
    }

    const success = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: TEST_PASSWORD });
    expect(success.status).toBe(200);

    const afterReset = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: 'WrongPassword123!' });
    expect(afterReset.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family on reuse (AC-FR01-08)', async () => {
    const session = await registerAndLogin();

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie);
    expect(rotated.status).toBe(200);
    expect(typeof rotated.body.accessToken).toBe('string');

    const newCookie = cookieHeader(setCookieHeader(rotated));
    expect(cookieValue(newCookie)).not.toBe(cookieValue(session.cookie));

    const reused = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe('TOKEN_REUSED');

    const afterFamilyRevocation = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newCookie);
    expect(afterFamilyRevocation.status).toBe(401);
    expect(afterFamilyRevocation.body.code).toBe('REFRESH_TOKEN_REVOKED');
  });

  it('accepts a refresh token in the body for non-browser clients', async () => {
    const session = await registerAndLogin();
    const token = cookieValue(session.cookie);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(response.status).toBe(200);
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('stores refresh tokens hashed and rejects unknown tokens (AC-FR01-09)', async () => {
    const session = await registerAndLogin();
    const rawToken = cookieValue(session.cookie);
    const expectedHash = createHmac('sha256', loadEnv().JWT_REFRESH_PEPPER).update(rawToken).digest('hex');

    const stored = await prisma.refreshToken.findFirst({
      where: { userId: session.userId, tokenHash: expectedHash },
    });
    expect(stored).not.toBeNull();
    expect(serialize(stored)).not.toContain(rawToken);

    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'a-token-that-was-never-issued' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe('TOKEN_INVALID');
  });

  it('rejects an expired refresh token with TOKEN_EXPIRED (AC-FR01-09)', async () => {
    const expiredToken = `expired-${randomUUID()}`;
    const body = registerBody();
    const registered = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);
    const userId = registered.body.user.id as string;

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: createHmac('sha256', loadEnv().JWT_REFRESH_PEPPER).update(expiredToken).digest('hex'),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TOKEN_EXPIRED');
  });

  it('logout revokes the family, clears the cookie and is idempotent (AC-FR01-11)', async () => {
    const session = await registerAndLogin();

    const loggedOut = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', session.cookie);

    expect(loggedOut.status).toBe(204);
    expect(setCookieHeader(loggedOut)).toContain('Max-Age=0');

    const afterLogout = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.code).toBe('REFRESH_TOKEN_REVOKED');

    const again = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', session.cookie);
    expect(again.status).toBe(204);
  });

  it('rejects a logout without any refresh token', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/logout').send({});
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a deactivated user on refresh (AC-FR01-10)', async () => {
    const session = await registerAndLogin();
    await prisma.user.update({ where: { id: session.userId }, data: { active: false } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('USER_INACTIVE');
  });

  it('protects GET /auth/me against missing, malformed and expired tokens', async () => {
    const missing = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHENTICATED');

    const malformed = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(malformed.status).toBe(401);
    expect(malformed.body.code).toBe('TOKEN_INVALID');

    const session = await registerAndLogin();
    const expiredToken = jwt.sign(
      {
        sub: session.userId,
        orgId: (await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })).orgId,
        role: 'ADMIN',
        active: true,
        jti: randomUUID(),
        iat: Math.floor(Date.now() / 1_000) - 3_600,
        exp: Math.floor(Date.now() / 1_000) - 60,
      },
      loadEnv().JWT_ACCESS_SECRET,
    );

    const expired = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('TOKEN_EXPIRED');
  });
});
