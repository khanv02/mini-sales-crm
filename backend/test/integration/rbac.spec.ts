import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createOrg,
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';

describe('RBAC and tenant isolation (integration)', () => {
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

  async function seededOrg(name: string): Promise<{
    orgId: string;
    admin: { authorization: string; id: string };
    manager: { authorization: string; id: string };
    sales: { authorization: string; id: string };
  }> {
    const org = await createOrg({ name });
    const admin = await createUser({ orgId: org.id, role: UserRole.ADMIN, email: `admin@${name}.test` });
    const manager = await createUser({ orgId: org.id, role: UserRole.MANAGER, email: `manager@${name}.test` });
    const sales = await createUser({ orgId: org.id, role: UserRole.SALES, email: `sales@${name}.test` });

    return {
      orgId: org.id,
      admin: { id: admin.id, authorization: loginAs(admin).authorization },
      manager: { id: manager.id, authorization: loginAs(manager).authorization },
      sales: { id: sales.id, authorization: loginAs(sales).authorization },
    };
  }

  it('allows only Admin to reach /users (role matrix, AC-FR02-03)', async () => {
    const acme = await seededOrg('acme');

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', acme.admin.authorization);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data).toHaveLength(3);

    for (const actor of [acme.manager, acme.sales]) {
      const list = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', actor.authorization);
      expect(list.status).toBe(403);
      expect(list.body.code).toBe('FORBIDDEN');

      const create = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', actor.authorization)
        .send({
          email: `blocked-${randomUUID().slice(0, 8)}@acme.test`,
          name: 'Blocked',
          password: 'Password123!',
          role: 'SALES',
        });
      expect(create.status).toBe(403);

      const update = await request(app.getHttpServer())
        .patch(`/api/v1/users/${acme.sales.id}`)
        .set('Authorization', actor.authorization)
        .send({ name: 'Hacked' });
      expect(update.status).toBe(403);
    }
  });

  it('hides users of another org behind 404 (tenant matrix, AC-NFR02-04)', async () => {
    const acme = await seededOrg('acme');
    const globex = await seededOrg('globex');

    const list = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', globex.admin.authorization);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(acme.sales.id);

    const crossTenantPatch = await request(app.getHttpServer())
      .patch(`/api/v1/users/${acme.sales.id}`)
      .set('Authorization', globex.admin.authorization)
      .send({ role: 'ADMIN' });
    expect(crossTenantPatch.status).toBe(404);
    expect(crossTenantPatch.body.code).toBe('NOT_FOUND');

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: acme.sales.id } });
    expect(unchanged.role).toBe('SALES');
  });

  it('rejects missing, malformed and foreign-signed access tokens', async () => {
    const acme = await seededOrg('acme');

    const missing = await request(app.getHttpServer()).get('/api/v1/users');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHENTICATED');

    const malformed = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', 'Bearer nonsense');
    expect(malformed.status).toBe(401);
    expect(malformed.body.code).toBe('TOKEN_INVALID');

    const foreignToken = jwt.sign(
      { sub: acme.admin.id, orgId: acme.orgId, role: 'ADMIN', active: true, jti: randomUUID() },
      'a'.repeat(40),
      { expiresIn: 900 },
    );
    const foreign = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${foreignToken}`);
    expect(foreign.status).toBe(401);
    expect(foreign.body.code).toBe('TOKEN_INVALID');
  });

  it('stops a deactivated admin from using an existing access token (AC-FR01-10)', async () => {
    const acme = await seededOrg('acme');

    const before = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', acme.admin.authorization);
    expect(before.status).toBe(200);

    await prisma.user.update({ where: { id: acme.admin.id }, data: { active: false } });
    // The guard reads the live row (30s cache); the update invalidates it in-process.
    app.get(PrincipalService).invalidate(acme.admin.id);

    const after = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', acme.admin.authorization);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('USER_INACTIVE');
  });

  it('returns 401 for an expired access token', async () => {
    const acme = await seededOrg('acme');
    const expired = jwt.sign(
      {
        sub: acme.manager.id,
        orgId: acme.orgId,
        role: 'MANAGER',
        active: true,
        jti: randomUUID(),
        iat: Math.floor(Date.now() / 1_000) - 3_600,
        exp: Math.floor(Date.now() / 1_000) - 60,
      },
      loadEnv().JWT_ACCESS_SECRET,
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${expired}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TOKEN_EXPIRED');
  });
});
