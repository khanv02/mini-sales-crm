import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createActivity,
  createContact,
  createDeal,
  createOrg,
  createPipeline,
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';
import { countAudits, requireAudit } from '../support/audit';

const DEALS = '/api/v1/deals';
const ACTIVITIES = '/api/v1/activities';

interface Actor {
  id: string;
  authorization: string;
}

interface Workspace {
  orgId: string;
  otherOrgId: string;
  admin: Actor;
  manager: Actor;
  sales: Actor;
  salesTwo: Actor;
  otherAdmin: Actor;
  /** Deal owned by `sales`. */
  dealId: string;
  /** Deal of the second organization, invisible to the first one. */
  otherDealId: string;
}

describe('activities (integration)', () => {
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

  async function seedWorkspace(): Promise<Workspace> {
    const org = await createOrg({ name: 'Acme' });
    const otherOrg = await createOrg({ name: 'Globex' });

    async function actor(orgId: string, role: UserRole): Promise<Actor> {
      const user = await createUser({ orgId, role });
      return { id: user.id, authorization: loginAs(user).authorization };
    }

    const admin = await actor(org.id, UserRole.ADMIN);
    const manager = await actor(org.id, UserRole.MANAGER);
    const sales = await actor(org.id, UserRole.SALES);
    const salesTwo = await actor(org.id, UserRole.SALES);
    const otherAdmin = await actor(otherOrg.id, UserRole.ADMIN);

    async function deal(orgId: string, ownerId: string, title: string): Promise<string> {
      const contact = await createContact({ orgId, ownerId, name: `${title} contact` });
      const pipeline = await createPipeline({ orgId, stages: [{ name: 'New' }, { name: 'Won', isWon: true }] });
      const created = await createDeal({
        orgId,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        ownerId,
        title,
      });
      return created.id;
    }

    return {
      orgId: org.id,
      otherOrgId: otherOrg.id,
      admin,
      manager,
      sales,
      salesTwo,
      otherAdmin,
      dealId: await deal(org.id, sales.id, 'Acme renewal'),
      otherDealId: await deal(otherOrg.id, otherAdmin.id, 'Globex renewal'),
    };
  }

  function listActivities(authorization: string, dealId: string, query = '') {
    return request(app.getHttpServer())
      .get(`${DEALS}/${dealId}/activities${query}`)
      .set('Authorization', authorization);
  }

  function createActivityRequest(authorization: string, dealId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${DEALS}/${dealId}/activities`)
      .set('Authorization', authorization)
      .send(body);
  }

  function patchActivityRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`${ACTIVITIES}/${id}`)
      .set('Authorization', authorization)
      .send(body);
  }

  it('creates notes, calls and emails with the author from the token and writes audit (AC-FR07-01)', async () => {
    const ws = await seedWorkspace();

    const note = await createActivityRequest(ws.sales.authorization, ws.dealId, {
      type: 'NOTE',
      content: '  Called the buyer  ',
    });
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({
      orgId: ws.orgId,
      dealId: ws.dealId,
      type: 'NOTE',
      content: 'Called the buyer',
      dueAt: null,
      doneAt: null,
      assigneeId: null,
      createdBy: ws.sales.id,
    });
    expect(typeof note.body.createdAt).toBe('string');

    const audit = await requireAudit({
      entity: 'Activity',
      entityId: note.body.id as string,
      action: 'ACTIVITY_CREATED',
    });
    expect(audit.orgId).toBe(ws.orgId);
    expect(audit.actorId).toBe(ws.sales.id);
    expect(audit.after).toMatchObject({ type: 'NOTE', content: 'Called the buyer' });

    for (const type of ['CALL', 'EMAIL']) {
      const created = await createActivityRequest(ws.sales.authorization, ws.dealId, {
        type,
        content: `${type} follow-up`,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ type, createdBy: ws.sales.id });
    }

    await expect(countAudits({ entity: 'Activity', action: 'ACTIVITY_CREATED' })).resolves.toBe(3);
  });

  it('lists the timeline newest first with cursor pagination and a type filter (AC-FR07-03)', async () => {
    const ws = await seedWorkspace();
    const base = Date.UTC(2026, 10, 1, 8, 0, 0);

    const seeded = [];
    for (let index = 0; index < 5; index += 1) {
      seeded.push(
        await createActivity({
          orgId: ws.orgId,
          dealId: ws.dealId,
          createdBy: ws.sales.id,
          type: index === 0 ? 'CALL' : 'NOTE',
          content: `Entry ${index}`,
          createdAt: new Date(base + index * 60_000),
        }),
      );
    }
    // Another org's activity must never leak into this timeline.
    await createActivity({
      orgId: ws.otherOrgId,
      dealId: ws.otherDealId,
      createdBy: ws.otherAdmin.id,
      content: 'Globex entry',
    });

    const firstPage = await listActivities(ws.manager.authorization, ws.dealId, '?limit=2');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.map((row: { id: string }) => row.id)).toEqual([
      seeded[4]!.id,
      seeded[3]!.id,
    ]);
    expect(firstPage.body.hasMore).toBe(true);
    expect(typeof firstPage.body.nextCursor).toBe('string');

    const secondPage = await listActivities(
      ws.manager.authorization,
      ws.dealId,
      `?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`,
    );
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.map((row: { id: string }) => row.id)).toEqual([
      seeded[2]!.id,
      seeded[1]!.id,
    ]);

    const thirdPage = await listActivities(
      ws.manager.authorization,
      ws.dealId,
      `?limit=2&cursor=${encodeURIComponent(secondPage.body.nextCursor as string)}`,
    );
    expect(thirdPage.body.data.map((row: { id: string }) => row.id)).toEqual([seeded[0]!.id]);
    expect(thirdPage.body.hasMore).toBe(false);
    expect(thirdPage.body.nextCursor).toBeNull();

    const onlyCalls = await listActivities(ws.manager.authorization, ws.dealId, '?type=CALL');
    expect(onlyCalls.status).toBe(200);
    expect(onlyCalls.body.data.map((row: { id: string }) => row.id)).toEqual([seeded[0]!.id]);
  });

  it('updates the content of an own activity with before/after audit (AC-FR07-04)', async () => {
    const ws = await seedWorkspace();
    const created = await createActivityRequest(ws.sales.authorization, ws.dealId, {
      type: 'NOTE',
      content: 'First draft',
    });

    const updated = await patchActivityRequest(ws.sales.authorization, created.body.id as string, {
      content: 'Final notes',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: created.body.id, content: 'Final notes', type: 'NOTE' });

    const audit = await requireAudit({
      entity: 'Activity',
      entityId: created.body.id as string,
      action: 'ACTIVITY_UPDATED',
    });
    expect(audit.actorId).toBe(ws.sales.id);
    expect(audit.before).toMatchObject({ content: 'First draft' });
    expect(audit.after).toMatchObject({ content: 'Final notes' });
  });

  it('hides the timeline and creation from Sales who do not own the deal (AC-FR07-02)', async () => {
    const ws = await seedWorkspace();
    await createActivity({
      orgId: ws.orgId,
      dealId: ws.dealId,
      createdBy: ws.sales.id,
      content: 'Private entry',
    });

    await expect(listActivities(ws.salesTwo.authorization, ws.dealId)).resolves.toMatchObject({
      status: 404,
      body: { code: 'DEAL_NOT_FOUND' },
    });
    const created = await createActivityRequest(ws.salesTwo.authorization, ws.dealId, {
      type: 'NOTE',
      content: 'Trying to write',
    });
    expect(created.status).toBe(404);
    expect(created.body.code).toBe('DEAL_NOT_FOUND');
    await expect(countAudits({ entity: 'Activity' })).resolves.toBe(0);
  });

  it('lets Manager and Admin read and write any deal in the org (AC-FR07-02, permissions matrix)', async () => {
    const ws = await seedWorkspace();
    await createActivity({
      orgId: ws.orgId,
      dealId: ws.dealId,
      createdBy: ws.sales.id,
      content: 'Sales entry',
    });

    for (const actor of [ws.manager, ws.admin]) {
      const timeline = await listActivities(actor.authorization, ws.dealId);
      expect(timeline.status).toBe(200);
      expect(timeline.body.data.map((row: { content: string }) => row.content)).toContain('Sales entry');

      const created = await createActivityRequest(actor.authorization, ws.dealId, {
        type: 'CALL',
        content: `By ${actor.id}`,
      });
      expect(created.status).toBe(201);
      expect(created.body.createdBy).toBe(actor.id);
    }

    const activity = await prisma.activity.findFirstOrThrow({ where: { content: 'Sales entry' } });
    const managerEdit = await patchActivityRequest(ws.manager.authorization, activity.id, {
      content: 'Manager edit',
    });
    expect(managerEdit.status).toBe(200);
    expect(managerEdit.body.content).toBe('Manager edit');
  });

  it('returns 404 and writes nothing for another org (AC-FR07-10)', async () => {
    const ws = await seedWorkspace();
    const activity = await createActivity({
      orgId: ws.orgId,
      dealId: ws.dealId,
      createdBy: ws.sales.id,
      content: 'Org A entry',
    });

    await expect(listActivities(ws.otherAdmin.authorization, ws.dealId)).resolves.toMatchObject({
      status: 404,
      body: { code: 'DEAL_NOT_FOUND' },
    });

    const created = await createActivityRequest(ws.otherAdmin.authorization, ws.dealId, {
      type: 'NOTE',
      content: 'Cross tenant write',
    });
    expect(created.status).toBe(404);

    const patched = await patchActivityRequest(ws.otherAdmin.authorization, activity.id, {
      content: 'Cross tenant edit',
    });
    expect(patched.status).toBe(404);
    expect(patched.body.code).toBe('ACTIVITY_NOT_FOUND');

    const unchanged = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(unchanged.content).toBe('Org A entry');
    await expect(prisma.activity.count()).resolves.toBe(1);
    await expect(countAudits({ entity: 'Activity', action: 'ACTIVITY_UPDATED' })).resolves.toBe(0);
  });
});
