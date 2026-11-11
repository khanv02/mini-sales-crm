import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../../src/common/config/env';
import { createOrg, createUser, disconnect, loginAs, prisma, resetDatabase } from '../factories';

describe('test harness and foundation schema (integration)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
  });

  it('creates isolated orgs and users and signs a usable access token', async () => {
    const orgA = await createOrg({ name: 'Alpha' });
    const orgB = await createOrg({ name: 'Beta' });
    const adminA = await createUser({
      orgId: orgA.id,
      email: 'admin@alpha.test',
      role: UserRole.ADMIN,
    });
    const userB = await createUser({ orgId: orgB.id, email: 'sales@beta.test' });

    expect(adminA.orgId).not.toBe(userB.orgId);

    const session = loginAs(adminA);
    const payload = jwt.verify(session.accessToken, loadEnv().JWT_ACCESS_SECRET) as jwt.JwtPayload;
    expect(payload).toMatchObject({
      sub: adminA.id,
      orgId: orgA.id,
      role: UserRole.ADMIN,
    });
  });

  it('enforces case-insensitive email uniqueness system-wide', async () => {
    const org = await createOrg();
    await createUser({ orgId: org.id, email: 'Duplicate@Example.test' });

    await expect(createUser({ orgId: org.id, email: 'duplicate@example.test' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects a user that references a non-existent organization', async () => {
    await expect(createUser({ orgId: '00000000-0000-4000-8000-000000000999' })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('rejects an audit row whose actor belongs to another org', async () => {
    const orgA = await createOrg({ name: 'Audit A' });
    const orgB = await createOrg({ name: 'Audit B' });
    const userA = await createUser({ orgId: orgA.id });
    const userB = await createUser({ orgId: orgB.id });

    await expect(
      prisma.auditLog.create({
        data: {
          orgId: orgA.id,
          actorId: userB.id,
          entity: 'User',
          entityId: userB.id,
          action: 'UPDATE',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const audit = await prisma.auditLog.create({
      data: {
        orgId: orgA.id,
        actorId: userA.id,
        entity: 'User',
        entityId: userA.id,
        action: 'UPDATE',
        before: { name: 'Before' },
        after: { name: 'After' },
      },
    });
    expect(audit.id).toBeGreaterThan(0n);
  });
});
