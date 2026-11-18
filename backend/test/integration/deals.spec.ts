import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import { DomainEventBus, type DomainEvent } from '../../src/common/events/domain-event-bus';
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

interface Board {
  pipelineId: string;
  stages: {
    new: string;
    qualified: string;
    won: string;
    lost: string;
  };
}

describe('deals (integration)', () => {
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

  async function seedTeam(): Promise<{
    orgId: string;
    admin: Actor;
    manager: Actor;
    sales: Actor;
    salesTwo: Actor;
    otherAdmin: Actor;
  }> {
    const org = await createOrg({ name: 'Acme', currency: 'VND' });
    const other = await createOrg({ name: 'Globex', currency: 'USD' });

    async function actor(orgId: string, role: UserRole): Promise<Actor> {
      const user = await createUser({ orgId, role });
      return { id: user.id, authorization: loginAs(user).authorization };
    }

    return {
      orgId: org.id,
      admin: await actor(org.id, UserRole.ADMIN),
      manager: await actor(org.id, UserRole.MANAGER),
      sales: await actor(org.id, UserRole.SALES),
      salesTwo: await actor(org.id, UserRole.SALES),
      otherAdmin: await actor(other.id, UserRole.ADMIN),
    };
  }

  async function seedBoard(orgId: string): Promise<Board> {
    const pipeline = await createPipeline({
      orgId,
      name: 'Sales Pipeline',
      stages: [
        { name: 'New' },
        { name: 'Qualified' },
        { name: 'Won', isWon: true },
        { name: 'Lost', isLost: true },
      ],
    });
    const [fresh, qualified, won, lost] = pipeline.stages;
    return {
      pipelineId: pipeline.id,
      stages: { new: fresh!.id, qualified: qualified!.id, won: won!.id, lost: lost!.id },
    };
  }

  function createDealRequest(authorization: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(DEALS).set('Authorization', authorization).send(body);
  }

  function patchDealRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).patch(`${DEALS}/${id}`).set('Authorization', authorization).send(body);
  }

  function moveDealRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`${DEALS}/${id}/move`)
      .set('Authorization', authorization)
      .send(body);
  }

  function assignDealRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`${DEALS}/${id}/assign`)
      .set('Authorization', authorization)
      .send(body);
  }

  function listDeals(authorization: string, query = '') {
    return request(app.getHttpServer()).get(`${DEALS}${query}`).set('Authorization', authorization);
  }

  it('creates a deal at the end of the stage with server-owned fields and audit (AC-FR05-01)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });

    const first = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Acme renewal',
      value: 1_500_000,
      expectedClose: '2026-12-31',
    });

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      orgId: team.orgId,
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Acme renewal',
      value: 1_500_000,
      currency: 'VND',
      ownerId: team.sales.id,
      status: 'OPEN',
      lostReason: null,
      position: 1,
      version: 1,
      closedAt: null,
      expectedClose: '2026-12-31',
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Deal', entityId: first.body.id as string, action: 'DEAL_CREATED' },
    });
    expect(audit?.orgId).toBe(team.orgId);
    expect(audit?.actorId).toBe(team.sales.id);
    expect(audit?.after).toMatchObject({ title: 'Acme renewal', status: 'OPEN', version: 1, position: 1 });

    const second = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Second deal',
      value: 10,
      currency: 'vnd',
    });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ currency: 'VND', position: 2, ownerId: team.sales.id });

    const assigned = await createDealRequest(team.manager.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Assigned deal',
      value: 25.5,
      ownerId: team.sales.id,
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.ownerId).toBe(team.sales.id);
  });

  it('returns the board ordered by stage and position with role scoping and filters (AC-FR05-02)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const otherContact = await createContact({ orgId: team.orgId, ownerId: team.salesTwo.id });

    async function create(authorization: string, contactId: string, stageId: string, title: string) {
      const response = await createDealRequest(authorization, {
        contactId,
        pipelineId: board.pipelineId,
        stageId,
        title,
        value: 100,
      });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    const firstNew = await create(team.sales.authorization, contact.id, board.stages.new, 'First New');
    const secondNew = await create(team.sales.authorization, contact.id, board.stages.new, 'Second New');
    const qualified = await create(team.sales.authorization, contact.id, board.stages.qualified, 'Qualified');
    const foreign = await create(team.salesTwo.authorization, otherContact.id, board.stages.new, 'Foreign');

    const salesBoard = await listDeals(team.sales.authorization, `?pipelineId=${board.pipelineId}`);
    expect(salesBoard.status).toBe(200);
    expect(salesBoard.body.data.map((deal: { id: string }) => deal.id)).toEqual([
      firstNew,
      secondNew,
      qualified,
    ]);
    expect(salesBoard.body.hasMore).toBe(false);
    expect(salesBoard.body.nextCursor).toBeNull();

    const managerBoard = await listDeals(team.manager.authorization, `?pipelineId=${board.pipelineId}`);
    expect(managerBoard.body.data.map((deal: { id: string }) => deal.id)).toEqual([
      firstNew,
      secondNew,
      foreign,
      qualified,
    ]);

    const scoped = await listDeals(team.manager.authorization, `?pipelineId=${board.pipelineId}&ownerId=${team.salesTwo.id}`);
    expect(scoped.body.data.map((deal: { id: string }) => deal.id)).toEqual([foreign]);

    const byStage = await listDeals(
      team.manager.authorization,
      `?pipelineId=${board.pipelineId}&stageId=${board.stages.qualified}`,
    );
    expect(byStage.body.data.map((deal: { id: string }) => deal.id)).toEqual([qualified]);

    const filtered = await listDeals(
      team.sales.authorization,
      `?pipelineId=${board.pipelineId}&sort=-createdAt&limit=1`,
    );
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.hasMore).toBe(true);
    const next = await listDeals(
      team.sales.authorization,
      `?pipelineId=${board.pipelineId}&sort=-createdAt&limit=1&cursor=${filtered.body.nextCursor as string}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.data).toHaveLength(1);
    expect(next.body.data[0].id).not.toBe(filtered.body.data[0].id);

    const salesFilteredByOwner = await listDeals(
      team.sales.authorization,
      `?pipelineId=${board.pipelineId}&ownerId=${team.salesTwo.id}`,
    );
    expect(salesFilteredByOwner.body.data.every((deal: { ownerId: string }) => deal.ownerId === team.sales.id)).toBe(
      true,
    );

    const invalidCursor = await listDeals(team.sales.authorization, '?cursor=not-a-cursor');
    expect(invalidCursor.status).toBe(400);
    expect(invalidCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('reads and updates a deal with the optimistic lock and before/after audit (AC-FR05-05)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const created = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Draft',
      value: 100,
    });
    const id = created.body.id as string;

    const fetched = await request(app.getHttpServer())
      .get(`${DEALS}/${id}`)
      .set('Authorization', team.sales.authorization);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ id, title: 'Draft', version: 1 });

    const updated = await patchDealRequest(team.sales.authorization, id, {
      title: 'Renewed',
      value: 250.75,
      expectedClose: null,
      ownerId: team.salesTwo.id,
      version: 1,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id,
      title: 'Renewed',
      value: 250.75,
      ownerId: team.sales.id,
      version: 2,
      expectedClose: null,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Deal', entityId: id, action: 'DEAL_UPDATED' },
    });
    expect(audit?.before).toMatchObject({ title: 'Draft', value: 100, version: 1 });
    expect(audit?.after).toMatchObject({ title: 'Renewed', value: 250.75, version: 2 });

    const stale = await patchDealRequest(team.sales.authorization, id, { title: 'Stale', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('DEAL_VERSION_CONFLICT');
    expect(stale.body.details.currentVersion).toBe(2);
    await expect(prisma.deal.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      title: 'Renewed',
      version: 2,
    });

    const emptyBody = await patchDealRequest(team.sales.authorization, id, { version: 2 });
    expect(emptyBody.status).toBe(200);
    expect(emptyBody.body.version).toBe(3);
  });

  it('moves a deal between stages, assigns it and emits the domain events (AC-FR05-03, AC-FR05-07)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const created = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Move me',
      value: 100,
    });
    const id = created.body.id as string;

    const events: DomainEvent[] = [];
    const unsubscribeMoved = app.get(DomainEventBus).subscribe('deal.moved', (event) => {
      events.push(event);
    });
    const unsubscribeAssigned = app.get(DomainEventBus).subscribe('deal.assigned', (event) => {
      events.push(event);
    });

    try {
      const moved = await moveDealRequest(team.sales.authorization, id, {
        stageId: board.stages.qualified,
        position: 0,
        version: 1,
      });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ stageId: board.stages.qualified, status: 'OPEN', version: 2, position: 1 });

      const movedAudit = await prisma.auditLog.findMany({
        where: { entity: 'Deal', entityId: id, action: 'DEAL_MOVED' },
      });
      expect(movedAudit).toHaveLength(1);
      expect(movedAudit[0]?.before).toMatchObject({ stageId: board.stages.new, version: 1 });
      expect(movedAudit[0]?.after).toMatchObject({ stageId: board.stages.qualified, version: 2 });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'deal.moved',
        orgId: team.orgId,
        payload: {
          dealId: id,
          fromStageId: board.stages.new,
          toStageId: board.stages.qualified,
          version: 2,
          ownerId: team.sales.id,
          actorId: team.sales.id,
        },
      });
      expect((events[0]?.payload as { position: string }).position).toBe('1.0000000000');

      const assigned = await assignDealRequest(team.manager.authorization, id, {
        ownerId: team.salesTwo.id,
        version: 2,
      });
      expect(assigned.status).toBe(200);
      expect(assigned.body).toMatchObject({ ownerId: team.salesTwo.id, version: 3 });

      const assignedAudit = await prisma.auditLog.findFirst({
        where: { entity: 'Deal', entityId: id, action: 'DEAL_ASSIGNED' },
      });
      expect(assignedAudit?.before).toMatchObject({ ownerId: team.sales.id });
      expect(assignedAudit?.after).toMatchObject({ ownerId: team.salesTwo.id });
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        type: 'deal.assigned',
        payload: {
          dealId: id,
          fromOwnerId: team.sales.id,
          toOwnerId: team.salesTwo.id,
          version: 3,
          actorId: team.manager.id,
        },
      });

      const staleAssign = await assignDealRequest(team.manager.authorization, id, {
        ownerId: team.sales.id,
        version: 2,
      });
      expect(staleAssign.status).toBe(409);
      expect(staleAssign.body.code).toBe('DEAL_VERSION_CONFLICT');
      expect(staleAssign.body.details.currentVersion).toBe(3);

      const salesAssign = await assignDealRequest(team.sales.authorization, id, {
        ownerId: team.salesTwo.id,
        version: 3,
      });
      expect(salesAssign.status).toBe(403);
      expect(salesAssign.body.code).toBe('FORBIDDEN');

      const inactive = await createUser({ orgId: team.orgId, active: false });
      const inactiveAssign = await assignDealRequest(team.manager.authorization, id, {
        ownerId: inactive.id,
        version: 3,
      });
      expect(inactiveAssign.status).toBe(400);
      expect(inactiveAssign.body.code).toBe('INVALID_OWNER');

      const foreignAssign = await assignDealRequest(team.manager.authorization, id, {
        ownerId: team.otherAdmin.id,
        version: 3,
      });
      expect(foreignAssign.status).toBe(400);
      expect(foreignAssign.body.code).toBe('INVALID_OWNER');
    } finally {
      unsubscribeMoved();
      unsubscribeAssigned();
    }
  });

  it('places a moved card at the requested index inside the target stage (AC-FR05-03)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });

    async function create(title: string) {
      const response = await createDealRequest(team.sales.authorization, {
        contactId: contact.id,
        pipelineId: board.pipelineId,
        stageId: board.stages.new,
        title,
        value: 100,
      });
      return response.body.id as string;
    }

    const first = await create('First');
    const second = await create('Second');
    const third = await create('Third');

    const head = await moveDealRequest(team.sales.authorization, third, {
      stageId: board.stages.new,
      position: 0,
      version: 1,
    });
    expect(head.status).toBe(200);

    const boardAfterHead = await listDeals(team.sales.authorization, `?pipelineId=${board.pipelineId}`);
    expect(boardAfterHead.body.data.map((deal: { id: string }) => deal.id)).toEqual([third, first, second]);

    const tail = await moveDealRequest(team.sales.authorization, third, {
      stageId: board.stages.new,
      position: 99,
      version: 2,
    });
    expect(tail.status).toBe(200);

    const boardAfterTail = await listDeals(team.sales.authorization, `?pipelineId=${board.pipelineId}`);
    expect(boardAfterTail.body.data.map((deal: { id: string }) => deal.id)).toEqual([first, second, third]);
  });

  it('validates the payload, the stage, the contact and the org currency without writing (AC-FR05-08)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const foreignContact = await createContact({ orgId: team.orgId, ownerId: team.salesTwo.id });
    const deletedContact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    await prisma.contact.update({ where: { id: deletedContact.id }, data: { deletedAt: new Date() } });
    const otherPipeline = await createPipeline({ orgId: team.orgId, name: 'Other', stages: [{ name: 'Open' }] });

    const base = {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Valid',
      value: 100,
    };

    const negative = await createDealRequest(team.sales.authorization, { ...base, value: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.code).toBe('VALIDATION_ERROR');
    expect(negative.body.details.fields.value).toEqual(expect.any(Array));

    const missingTitle = await createDealRequest(team.sales.authorization, { ...base, title: undefined });
    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.code).toBe('VALIDATION_ERROR');

    const currency = await createDealRequest(team.sales.authorization, { ...base, currency: 'USD' });
    expect(currency.status).toBe(400);
    expect(currency.body.code).toBe('CURRENCY_MISMATCH');

    const foreignStage = await createDealRequest(team.sales.authorization, {
      ...base,
      stageId: otherPipeline.stages[0]!.id,
    });
    expect(foreignStage.status).toBe(400);
    expect(foreignStage.body.code).toBe('INVALID_STAGE');

    const unknownPipeline = await createDealRequest(team.sales.authorization, {
      ...base,
      pipelineId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknownPipeline.status).toBe(404);
    expect(unknownPipeline.body.code).toBe('PIPELINE_NOT_FOUND');

    const unknownStage = await createDealRequest(team.sales.authorization, {
      ...base,
      stageId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknownStage.status).toBe(404);
    expect(unknownStage.body.code).toBe('STAGE_NOT_FOUND');

    const deleted = await createDealRequest(team.sales.authorization, { ...base, contactId: deletedContact.id });
    expect(deleted.status).toBe(400);
    expect(deleted.body.code).toBe('VALIDATION_ERROR');

    const foreign = await createDealRequest(team.sales.authorization, { ...base, contactId: foreignContact.id });
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('CONTACT_NOT_FOUND');

    const salesAssigns = await createDealRequest(team.sales.authorization, {
      ...base,
      ownerId: team.salesTwo.id,
    });
    expect(salesAssigns.status).toBe(403);
    expect(salesAssigns.body.code).toBe('FORBIDDEN');

    await expect(prisma.deal.count({ where: { orgId: team.orgId } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { entity: 'Deal' } })).resolves.toBe(0);
  });

  it('hides another owner or another org deal as 404 and keeps the DB unchanged (AC-FR05-06, AC-FR05-09)', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const created = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Private',
      value: 100,
    });
    const id = created.body.id as string;

    const otherSalesRead = await request(app.getHttpServer())
      .get(`${DEALS}/${id}`)
      .set('Authorization', team.salesTwo.authorization);
    expect(otherSalesRead.status).toBe(404);
    expect(otherSalesRead.body.code).toBe('DEAL_NOT_FOUND');

    const otherSalesUpdate = await patchDealRequest(team.salesTwo.authorization, id, { title: 'Hijacked', version: 1 });
    expect(otherSalesUpdate.status).toBe(404);

    const otherSalesMove = await moveDealRequest(team.salesTwo.authorization, id, {
      stageId: board.stages.qualified,
      position: 0,
      version: 1,
    });
    expect(otherSalesMove.status).toBe(404);

    const foreignOrgRead = await request(app.getHttpServer())
      .get(`${DEALS}/${id}`)
      .set('Authorization', team.otherAdmin.authorization);
    expect(foreignOrgRead.status).toBe(404);

    const foreignOrgMove = await moveDealRequest(team.otherAdmin.authorization, id, {
      stageId: board.stages.qualified,
      position: 0,
      version: 1,
    });
    expect(foreignOrgMove.status).toBe(404);

    const managerMove = await moveDealRequest(team.manager.authorization, id, {
      stageId: board.stages.qualified,
      position: 0,
      version: 1,
    });
    expect(managerMove.status).toBe(200);

    const unauthenticated = await request(app.getHttpServer()).get(DEALS);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe('UNAUTHENTICATED');

    const malformed = await request(app.getHttpServer())
      .get(`${DEALS}/not-a-uuid`)
      .set('Authorization', team.sales.authorization);
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the deal untouched when a foreign owner tries to change it', async () => {
    const team = await seedTeam();
    const board = await seedBoard(team.orgId);
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const created = await createDealRequest(team.sales.authorization, {
      contactId: contact.id,
      pipelineId: board.pipelineId,
      stageId: board.stages.new,
      title: 'Guarded',
      value: 100,
    });
    const id = created.body.id as string;

    await patchDealRequest(team.salesTwo.authorization, id, { title: 'Hijacked', value: 1, version: 1 });

    await expect(prisma.deal.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      title: 'Guarded',
      value: expect.anything(),
      version: 1,
    });
    await expect(prisma.auditLog.count({ where: { entityId: id, action: 'DEAL_UPDATED' } })).resolves.toBe(0);
  });
});
