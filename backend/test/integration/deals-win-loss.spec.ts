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

describe('deal win/loss lifecycle (integration)', () => {
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

  async function seedDeal(): Promise<{
    orgId: string;
    sales: Actor;
    dealId: string;
    stages: { new: string; won: string; lost: string };
  }> {
    const org = await createOrg({ name: 'Acme' });
    const salesUser = await createUser({ orgId: org.id, role: UserRole.SALES });
    const sales = { id: salesUser.id, authorization: loginAs(salesUser).authorization };
    const pipeline = await createPipeline({
      orgId: org.id,
      name: 'Sales Pipeline',
      stages: [{ name: 'New' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }],
    });
    const [fresh, won, lost] = pipeline.stages;
    const contact = await createContact({ orgId: org.id, ownerId: sales.id });

    const created = await request(app.getHttpServer())
      .post(DEALS)
      .set('Authorization', sales.authorization)
      .send({
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: fresh!.id,
        title: 'Lifecycle',
        value: 1_000,
      });
    expect(created.status).toBe(201);

    return {
      orgId: org.id,
      sales,
      dealId: created.body.id as string,
      stages: { new: fresh!.id, won: won!.id, lost: lost!.id },
    };
  }

  function move(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).patch(`${DEALS}/${id}/move`).set('Authorization', authorization).send(body);
  }

  it('closes a deal as won with closed_at and clears the lost reason (AC-FR06-01)', async () => {
    const seeded = await seedDeal();

    const response = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.won,
      position: 0,
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      stageId: seeded.stages.won,
      status: 'WON',
      lostReason: null,
      version: 2,
    });
    expect(response.body.closedAt).toEqual(expect.any(String));

    const stored = await prisma.deal.findUniqueOrThrow({ where: { id: seeded.dealId } });
    expect(stored.status).toBe('WON');
    expect(stored.closedAt).toBeInstanceOf(Date);
    expect(stored.lostReason).toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entity: 'Deal', entityId: seeded.dealId, action: { in: ['DEAL_WON', 'DEAL_MOVED'] } },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('DEAL_WON');
    expect(audit[0]?.after).toMatchObject({ status: 'WON', stageId: seeded.stages.won });

    const listing = await request(app.getHttpServer())
      .get(`${DEALS}?status=WON`)
      .set('Authorization', seeded.sales.authorization);
    expect(listing.body.data.map((deal: { id: string }) => deal.id)).toEqual([seeded.dealId]);
  });

  it('rejects a loss without a reason and leaves the deal unchanged (AC-FR06-02)', async () => {
    const seeded = await seedDeal();

    const response = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.lost,
      position: 0,
      version: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('LOST_REASON_REQUIRED');

    const stored = await prisma.deal.findUniqueOrThrow({ where: { id: seeded.dealId } });
    expect(stored).toMatchObject({ stageId: seeded.stages.new, status: 'OPEN', version: 1, lostReason: null });
    expect(stored.closedAt).toBeNull();
    await expect(
      prisma.auditLog.count({
        where: { entity: 'Deal', entityId: seeded.dealId, action: { in: ['DEAL_LOST', 'DEAL_MOVED'] } },
      }),
    ).resolves.toBe(0);

    const blankReason = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.lost,
      position: 0,
      version: 1,
      lostReason: '   ',
    });
    expect(blankReason.status).toBe(400);
    expect(blankReason.body.code).toBe('VALIDATION_ERROR');
  });

  it('stores the lost reason, closed_at and audit when a deal is lost (AC-FR06-03)', async () => {
    const seeded = await seedDeal();

    const response = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.lost,
      position: 0,
      version: 1,
      lostReason: '  Price too high  ',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      stageId: seeded.stages.lost,
      status: 'LOST',
      lostReason: 'Price too high',
      version: 2,
    });
    expect(response.body.closedAt).toEqual(expect.any(String));

    const stored = await prisma.deal.findUniqueOrThrow({ where: { id: seeded.dealId } });
    expect(stored.status).toBe('LOST');
    expect(stored.lostReason).toBe('Price too high');
    expect(stored.closedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Deal', entityId: seeded.dealId, action: 'DEAL_LOST' },
    });
    expect(audit?.before).toMatchObject({ status: 'OPEN', lostReason: null });
    expect(audit?.after).toMatchObject({ status: 'LOST', lostReason: 'Price too high' });
  });

  it('reopens a closed deal and clears closed_at and the lost reason (AC-FR06-04)', async () => {
    const seeded = await seedDeal();
    const lost = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.lost,
      position: 0,
      version: 1,
      lostReason: 'Budget cut',
    });
    expect(lost.status).toBe(200);

    const reopened = await move(seeded.sales.authorization, seeded.dealId, {
      stageId: seeded.stages.new,
      position: 0,
      version: 2,
    });

    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({
      stageId: seeded.stages.new,
      status: 'OPEN',
      lostReason: null,
      closedAt: null,
      version: 3,
    });

    const stored = await prisma.deal.findUniqueOrThrow({ where: { id: seeded.dealId } });
    expect(stored).toMatchObject({ status: 'OPEN', lostReason: null, closedAt: null });

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Deal', entityId: seeded.dealId, action: 'DEAL_REOPENED' },
    });
    expect(audit?.before).toMatchObject({ status: 'LOST', lostReason: 'Budget cut' });
    expect(audit?.after).toMatchObject({ status: 'OPEN', lostReason: null });

    const consistency = await prisma.deal.findMany({
      where: { orgId: seeded.orgId },
      select: { status: true, closedAt: true },
    });
    for (const deal of consistency) {
      expect(deal.status === 'OPEN').toBe(deal.closedAt === null);
    }
  });

  it('refuses to create a deal directly in the lost stage (FR-06.1)', async () => {
    const seeded = await seedDeal();
    const detail = await prisma.deal.findUniqueOrThrow({ where: { id: seeded.dealId } });

    const response = await request(app.getHttpServer())
      .post(DEALS)
      .set('Authorization', seeded.sales.authorization)
      .send({
        contactId: detail.contactId,
        pipelineId: detail.pipelineId,
        stageId: seeded.stages.lost,
        title: 'Born lost',
        value: 1,
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('LOST_REASON_REQUIRED');
    await expect(prisma.deal.count({ where: { title: 'Born lost' } })).resolves.toBe(0);
  });
});
