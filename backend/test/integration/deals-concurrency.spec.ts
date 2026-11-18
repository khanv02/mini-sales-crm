import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createContact,
  createOrg,
  createPipeline,
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';

const DEALS = '/api/v1/deals';

interface Actor {
  id: string;
  authorization: string;
}

describe('deal move concurrency (integration)', () => {
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

  async function actor(orgId: string, role: UserRole): Promise<Actor> {
    const user = await createUser({ orgId, role });
    return { id: user.id, authorization: loginAs(user).authorization };
  }

  it('lets exactly one of two parallel moves with the same version win (AC-FR05-04)', async () => {
    const org = await createOrg({ name: 'Acme' });
    const manager = await actor(org.id, UserRole.MANAGER);
    const sales = await actor(org.id, UserRole.SALES);
    const pipeline = await createPipeline({
      orgId: org.id,
      name: 'Sales Pipeline',
      stages: [{ name: 'New' }, { name: 'Qualified' }, { name: 'Proposal' }],
    });
    const [fresh, qualified, proposal] = pipeline.stages;
    const contact = await createContact({ orgId: org.id, ownerId: sales.id });
    const created = await request(app.getHttpServer())
      .post(DEALS)
      .set('Authorization', sales.authorization)
      .send({
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: fresh!.id,
        title: 'Contended',
        value: 500,
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const move = (stageId: string, authorization: string) =>
      request(app.getHttpServer())
        .patch(`${DEALS}/${id}/move`)
        .set('Authorization', authorization)
        .send({ stageId, position: 0, version: 1 });

    const [first, second] = await Promise.all([
      move(qualified!.id, sales.authorization),
      move(proposal!.id, manager.authorization),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.code).toBe('DEAL_VERSION_CONFLICT');
    expect(conflict.body.details.currentVersion).toBe(2);

    const stored = await prisma.deal.findUniqueOrThrow({ where: { id } });
    expect(stored.version).toBe(2);
    expect([qualified!.id, proposal!.id]).toContain(stored.stageId);
    expect(stored.stageId).toBe(first.status === 200 ? qualified!.id : proposal!.id);

    await expect(
      prisma.auditLog.count({ where: { entity: 'Deal', entityId: id, action: 'DEAL_MOVED' } }),
    ).resolves.toBe(1);

    const board = await request(app.getHttpServer())
      .get(`${DEALS}?pipelineId=${pipeline.id}`)
      .set('Authorization', manager.authorization);
    expect(board.status).toBe(200);
    expect(board.body.data).toHaveLength(1);
    expect(board.body.data[0]).toMatchObject({ id, version: 2, stageId: stored.stageId });
  });

  it('keeps the audit single when one of two parallel updates loses the version race (AC-FR05-04)', async () => {
    const org = await createOrg({ name: 'Acme' });
    const sales = await actor(org.id, UserRole.SALES);
    const pipeline = await createPipeline({ orgId: org.id, name: 'Pipeline', stages: [{ name: 'New' }] });
    const contact = await createContact({ orgId: org.id, ownerId: sales.id });
    const created = await request(app.getHttpServer())
      .post(DEALS)
      .set('Authorization', sales.authorization)
      .send({
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        title: 'Contended update',
        value: 100,
      });
    const id = created.body.id as string;

    const patch = (title: string) =>
      request(app.getHttpServer())
        .patch(`${DEALS}/${id}`)
        .set('Authorization', sales.authorization)
        .send({ title, version: 1 });

    const [first, second] = await Promise.all([patch('First writer'), patch('Second writer')]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    await expect(
      prisma.auditLog.count({ where: { entity: 'Deal', entityId: id, action: 'DEAL_UPDATED' } }),
    ).resolves.toBe(1);
    await expect(prisma.deal.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ version: 2 });
  });
});
