import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import { disconnect, prisma, resetDatabase, resetRateLimits, TEST_PASSWORD } from '../factories';

describe('user management (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv());
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetRateLimits();
    app.get(PrincipalService).clear();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
    await app.close();
  });

  async function registerAdmin(): Promise<{ orgId: string; userId: string; authorization: string }> {
    const email = `admin-${randomUUID().slice(0, 8)}@acme.test`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ orgName: 'Acme', name: 'Admin Acme', email, password: TEST_PASSWORD });

    return {
      orgId: response.body.user.orgId as string,
      userId: response.body.user.id as string,
      authorization: `Bearer ${response.body.accessToken}`,
    };
  }

  function userPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      email: `member-${randomUUID().slice(0, 8)}@acme.test`,
      name: 'Member Acme',
      password: TEST_PASSWORD,
      role: 'SALES',
      ...overrides,
    };
  }

  it('POST /users creates a member inside the org and audits it (AC-FR02-01)', async () => {
    const admin = await registerAdmin();
    const payload = userPayload({ role: 'MANAGER' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: payload.email,
      role: 'MANAGER',
      active: true,
      orgId: admin.orgId,
    });
    expect(response.body.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD);

    const created = await prisma.user.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(created.orgId).toBe(admin.orgId);
    expect(created.passwordHash.startsWith('$argon2id$')).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'User', entityId: created.id, action: 'CREATE' },
    });
    expect(audit?.orgId).toBe(admin.orgId);
    expect(audit?.actorId).toBe(admin.userId);
    expect(audit?.after).toMatchObject({ role: 'MANAGER', active: true });
    expect(JSON.stringify(audit?.after)).not.toContain('password');
  });

  it('rejects a duplicate email and an invalid payload', async () => {
    const admin = await registerAdmin();
    const payload = userPayload();

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(payload);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('EMAIL_TAKEN');

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(userPayload({ role: 'SUPER_ADMIN', password: 'too-short' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.details.fields.role).toEqual(expect.any(Array));
    expect(invalid.body.details.fields.password).toEqual(expect.any(Array));
  });

  it('GET /users lists only the caller org with filters and cursor pagination (AC-FR02.3)', async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin();

    for (let index = 0; index < 2; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', admin.authorization)
        .send(userPayload({ role: 'SALES' }));
    }
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(userPayload({ role: 'MANAGER' }));

    const all = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', admin.authorization);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(4);
    expect(new Set(all.body.data.map((row: { orgId: string }) => row.orgId))).toEqual(
      new Set([admin.orgId]),
    );

    const filtered = await request(app.getHttpServer())
      .get('/api/v1/users?role=MANAGER')
      .set('Authorization', admin.authorization);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].role).toBe('MANAGER');

    const firstPage = await request(app.getHttpServer())
      .get('/api/v1/users?limit=2')
      .set('Authorization', admin.authorization);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.hasMore).toBe(true);
    expect(typeof firstPage.body.nextCursor).toBe('string');

    const secondPage = await request(app.getHttpServer())
      .get(`/api/v1/users?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`)
      .set('Authorization', admin.authorization);
    expect(secondPage.body.data).toHaveLength(2);
    expect(secondPage.body.data.map((row: { id: string }) => row.id)).not.toContain(
      firstPage.body.data[0].id,
    );

    const otherOrg = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', other.authorization);
    expect(otherOrg.body.data.map((row: { id: string }) => row.id)).not.toContain(admin.userId);

    const badCursor = await request(app.getHttpServer())
      .get('/api/v1/users?cursor=not-a-cursor')
      .set('Authorization', admin.authorization);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('PATCH /users/:id updates role/active/name and audits before/after', async () => {
    const admin = await registerAdmin();
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(userPayload({ role: 'SALES' }));

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/users/${created.body.id as string}`)
      .set('Authorization', admin.authorization)
      .send({ role: 'MANAGER', name: 'Renamed Member' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: 'MANAGER', name: 'Renamed Member', active: true });

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'User', entityId: created.body.id as string, action: 'UPDATE' },
    });
    expect(audit?.before).toMatchObject({ role: 'SALES', name: 'Member Acme' });
    expect(audit?.after).toMatchObject({ role: 'MANAGER', name: 'Renamed Member' });
    expect(audit?.actorId).toBe(admin.userId);
  });

  it('refuses to deactivate the last admin or the caller itself (AC-FR02-02)', async () => {
    const admin = await registerAdmin();

    const selfDeactivate = await request(app.getHttpServer())
      .patch(`/api/v1/users/${admin.userId}`)
      .set('Authorization', admin.authorization)
      .send({ active: false });
    expect(selfDeactivate.status).toBe(409);
    expect(selfDeactivate.body.code).toBe('CANNOT_DEACTIVATE_SELF');

    const demoteSelf = await request(app.getHttpServer())
      .patch(`/api/v1/users/${admin.userId}`)
      .set('Authorization', admin.authorization)
      .send({ role: 'MANAGER' });
    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.code).toBe('LAST_ADMIN');

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(unchanged).toMatchObject({ role: 'ADMIN', active: true });
    await expect(prisma.auditLog.count({ where: { action: 'UPDATE' } })).resolves.toBe(0);
  });

  it('applies a role change on the next request and allows it when another admin exists (AC-FR02-04)', async () => {
    const admin = await registerAdmin();
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(userPayload({ role: 'ADMIN' }));

    const demoted = await request(app.getHttpServer())
      .patch(`/api/v1/users/${admin.userId}`)
      .set('Authorization', admin.authorization)
      .send({ role: 'MANAGER' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.role).toBe('MANAGER');

    const afterDemotion = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', admin.authorization);
    expect(afterDemotion.status).toBe(403);
    expect(afterDemotion.body.code).toBe('FORBIDDEN');
  });

  it('deactivates a member so their session stops working', async () => {
    const admin = await registerAdmin();
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', admin.authorization)
      .send(userPayload({ role: 'SALES' }));

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: created.body.email as string, password: TEST_PASSWORD });
    const memberAuthorization = `Bearer ${login.body.accessToken as string}`;

    const meBefore = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', memberAuthorization);
    expect(meBefore.status).toBe(200);

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/v1/users/${created.body.id as string}`)
      .set('Authorization', admin.authorization)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);

    const meAfter = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', memberAuthorization);
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.code).toBe('USER_INACTIVE');
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const admin = await registerAdmin();

    const missing = await request(app.getHttpServer())
      .patch(`/api/v1/users/${randomUUID()}`)
      .set('Authorization', admin.authorization)
      .send({ name: 'Ghost' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const malformed = await request(app.getHttpServer())
      .patch('/api/v1/users/not-a-uuid')
      .set('Authorization', admin.authorization)
      .send({ name: 'Ghost' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');
  });
});
