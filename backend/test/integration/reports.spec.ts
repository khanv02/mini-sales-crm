import type { INestApplication } from '@nestjs/common';
import { UserRole, type Deal } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createContact,
  createDeal,
  createOrg,
  createPipeline,
  createUser,
  disconnect,
  loginAs,
  resetDatabase,
  resetRateLimits,
} from '../factories';

const REPORTS = '/api/v1/reports/summary';

const IN_RANGE = new Date('2026-11-15T03:00:00.000Z');
const BEFORE_RANGE = new Date('2026-10-31T16:59:59.000Z');
const CLOSED_IN_RANGE = new Date('2026-11-10T03:00:00.000Z');
const CLOSED_BEFORE_RANGE = new Date('2026-10-30T03:00:00.000Z');

interface Actor {
  id: string;
  authorization: string;
}

interface Team {
  orgId: string;
  otherOrgId: string;
  admin: Actor;
  manager: Actor;
  salesA: Actor;
  salesB: Actor;
  otherAdmin: Actor;
  pipeline: { id: string; new: string; qualified: string; won: string; lost: string };
  otherPipeline: { id: string; new: string };
}

interface DealInput {
  orgId?: string;
  ownerId: string;
  pipelineId?: string;
  stageId?: string;
  value?: number;
  status?: 'OPEN' | 'WON' | 'LOST';
  createdAt?: Date;
  closedAt?: Date | null;
  expectedClose?: Date | null;
}

describe('reports summary (integration)', () => {
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

  async function seedTeam(): Promise<Team> {
    const org = await createOrg({ name: 'Acme' });
    const otherOrg = await createOrg({ name: 'Globex' });

    async function actor(orgId: string, role: UserRole): Promise<Actor> {
      const user = await createUser({ orgId, role });
      return { id: user.id, authorization: loginAs(user).authorization };
    }

    const pipeline = await createPipeline({
      orgId: org.id,
      name: 'Sales',
      stages: [
        { name: 'New', position: 1 },
        { name: 'Qualified', position: 2 },
        { name: 'Won', position: 3, isWon: true },
        { name: 'Lost', position: 4, isLost: true },
      ],
    });
    const otherPipeline = await createPipeline({
      orgId: org.id,
      name: 'Renewals',
      stages: [{ name: 'New', position: 1 }],
    });

    return {
      orgId: org.id,
      otherOrgId: otherOrg.id,
      admin: await actor(org.id, UserRole.ADMIN),
      manager: await actor(org.id, UserRole.MANAGER),
      salesA: await actor(org.id, UserRole.SALES),
      salesB: await actor(org.id, UserRole.SALES),
      otherAdmin: await actor(otherOrg.id, UserRole.ADMIN),
      pipeline: {
        id: pipeline.id,
        new: pipeline.stages[0]!.id,
        qualified: pipeline.stages[1]!.id,
        won: pipeline.stages[2]!.id,
        lost: pipeline.stages[3]!.id,
      },
      otherPipeline: { id: otherPipeline.id, new: otherPipeline.stages[0]!.id },
    };
  }

  /**
   * Deal contacts are dated far outside every range, so they never change `newLeads`; tests that assert
   * `newLeads` create their contacts explicitly.
   */
  async function makeDeal(team: Team, input: DealInput): Promise<Deal> {
    const orgId = input.orgId ?? team.orgId;
    const contact = await createContact({
      orgId,
      ownerId: input.ownerId,
      name: `Contact ${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const belongsToOrg = orgId === team.orgId;
    const pipelineId = input.pipelineId ?? (belongsToOrg ? team.pipeline.id : undefined);
    const stageId =
      input.stageId ??
      (belongsToOrg ? team.pipeline.new : (await createPipelineFor(team, orgId)).new);

    return createDeal({
      orgId,
      contactId: contact.id,
      ownerId: input.ownerId,
      pipelineId: pipelineId ?? (await createPipelineFor(team, orgId)).id,
      stageId,
      value: input.value ?? 0,
      status: input.status ?? 'OPEN',
      createdAt: input.createdAt ?? IN_RANGE,
      closedAt:
        input.status && input.status !== 'OPEN'
          ? (input.closedAt ?? CLOSED_IN_RANGE)
          : (input.closedAt ?? null),
      expectedClose: input.expectedClose ?? null,
      ...(input.status === 'LOST' ? { lostReason: 'Price' } : {}),
    });
  }

  const foreignPipelines = new Map<string, { id: string; new: string }>();
  async function createPipelineFor(_team: Team, orgId: string): Promise<{ id: string; new: string }> {
    const existing = foreignPipelines.get(orgId);
    if (existing) {
      return existing;
    }
    const pipeline = await createPipeline({
      orgId,
      name: 'Other org pipeline',
      stages: [{ name: 'New', position: 1 }],
    });
    const created = { id: pipeline.id, new: pipeline.stages[0]!.id };
    foreignPipelines.set(orgId, created);
    return created;
  }

  function summary(query = '', authorization?: string) {
    const call = request(app.getHttpServer()).get(`${REPORTS}${query}`);
    return authorization ? call.set('Authorization', authorization) : call;
  }

  it('counts new leads, open deals by stage and pipeline value within the range (AC-FR08-01..03)', async () => {
    const team = await seedTeam();

    await createContact({ orgId: team.orgId, ownerId: team.salesA.id, createdAt: IN_RANGE });
    await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      createdAt: IN_RANGE,
      deletedAt: new Date('2026-11-16T03:00:00.000Z'),
    });
    await createContact({ orgId: team.orgId, ownerId: team.salesA.id, createdAt: BEFORE_RANGE });
    await createContact({ orgId: team.otherOrgId, ownerId: team.otherAdmin.id, createdAt: IN_RANGE });

    await makeDeal(team, { ownerId: team.salesA.id, value: 100 });
    await makeDeal(team, { ownerId: team.salesA.id, value: 200 });
    await makeDeal(team, { ownerId: team.salesA.id, stageId: team.pipeline.qualified, value: 500 });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      stageId: team.pipeline.won,
      value: 999,
      status: 'WON',
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      stageId: team.pipeline.lost,
      value: 888,
      status: 'LOST',
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      stageId: team.pipeline.qualified,
      value: 700,
      createdAt: BEFORE_RANGE,
    });

    const response = await summary('?from=2026-11-01&to=2026-11-30', team.manager.authorization);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      range: { from: '2026-11-01', to: '2026-11-30', timezone: 'Asia/Ho_Chi_Minh' },
      newLeads: 1,
      pipelineValue: 800,
      dealsByStage: [
        { stageId: team.pipeline.new, stageName: 'New', count: 2, value: 300 },
        { stageId: team.pipeline.qualified, stageName: 'Qualified', count: 1, value: 500 },
      ],
    });
    expect(response.body.generatedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.body.generatedAt))).toBe(false);
    expect(response.body.cached).toBe(false);
  });

  it('computes the win rate from closed_at and forecasts six months from the range start (AC-FR08-04/05)', async () => {
    const team = await seedTeam();

    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'WON',
      closedAt: new Date('2026-11-05T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'WON',
      closedAt: new Date('2026-11-20T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'WON',
      closedAt: new Date('2026-11-25T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'LOST',
      closedAt: new Date('2026-11-08T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'WON',
      closedAt: CLOSED_BEFORE_RANGE,
    });

    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 1000,
      expectedClose: new Date('2026-11-15T00:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 500,
      expectedClose: new Date('2026-11-30T00:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 2000,
      expectedClose: new Date('2026-12-01T00:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 750,
      createdAt: BEFORE_RANGE,
      expectedClose: new Date('2026-12-15T00:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 3000,
      expectedClose: new Date('2027-03-01T00:00:00.000Z'),
    });
    // Exactly six months after the range start is exclusive.
    await makeDeal(team, {
      ownerId: team.salesA.id,
      value: 4000,
      expectedClose: new Date('2027-05-01T00:00:00.000Z'),
    });
    // No expected close date: skipped by the forecast.
    await makeDeal(team, { ownerId: team.salesA.id, value: 600 });

    const response = await summary('?from=2026-11-01&to=2026-11-30', team.manager.authorization);
    expect(response.status).toBe(200);
    expect(response.body.winRate).toBe(0.75);
    expect(response.body.forecastByMonth).toEqual([
      { month: '2026-11', value: 1500 },
      { month: '2026-12', value: 2750 },
      { month: '2027-03', value: 3000 },
    ]);
  });

  it('applies the owner, pipeline and combined filters to every figure (AC-FR08-06)', async () => {
    const team = await seedTeam();

    await createContact({ orgId: team.orgId, ownerId: team.salesA.id, createdAt: IN_RANGE });
    await createContact({ orgId: team.orgId, ownerId: team.salesB.id, createdAt: IN_RANGE });

    await makeDeal(team, { ownerId: team.salesA.id, value: 100 });
    await makeDeal(team, { ownerId: team.salesB.id, value: 200 });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      pipelineId: team.otherPipeline.id,
      stageId: team.otherPipeline.new,
      value: 300,
    });
    await makeDeal(team, {
      ownerId: team.salesB.id,
      pipelineId: team.otherPipeline.id,
      stageId: team.otherPipeline.new,
      value: 400,
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'WON',
      stageId: team.pipeline.won,
      closedAt: new Date('2026-11-12T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesA.id,
      status: 'LOST',
      stageId: team.pipeline.lost,
      closedAt: new Date('2026-11-13T03:00:00.000Z'),
    });
    await makeDeal(team, {
      ownerId: team.salesB.id,
      status: 'WON',
      pipelineId: team.otherPipeline.id,
      stageId: team.otherPipeline.new,
      closedAt: new Date('2026-11-14T03:00:00.000Z'),
    });

    const byOwner = await summary(
      `?from=2026-11-01&to=2026-11-30&ownerId=${team.salesA.id}`,
      team.manager.authorization,
    );
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.newLeads).toBe(1);
    expect(byOwner.body.pipelineValue).toBe(400);
    // `dealsByStage` is ordered by stage position; both pipelines start at position 1, so the
    // response order between them is not contractual and the assertion is order-insensitive.
    expect(byOwner.body.dealsByStage).toHaveLength(2);
    expect(byOwner.body.dealsByStage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stageId: team.pipeline.new, count: 1, value: 100 }),
        expect.objectContaining({ stageId: team.otherPipeline.new, count: 1, value: 300 }),
      ]),
    );

    const byPipeline = await summary(
      `?from=2026-11-01&to=2026-11-30&pipelineId=${team.otherPipeline.id}`,
      team.manager.authorization,
    );
    expect(byPipeline.body.newLeads).toBe(2);
    expect(byPipeline.body.pipelineValue).toBe(700);
    expect(byPipeline.body.dealsByStage).toEqual([
      expect.objectContaining({ stageId: team.otherPipeline.new, count: 2, value: 700 }),
    ]);
    expect(byPipeline.body.winRate).toBe(1);

    const combined = await summary(
      `?from=2026-11-01&to=2026-11-30&pipelineId=${team.otherPipeline.id}&ownerId=${team.salesA.id}`,
      team.manager.authorization,
    );
    expect(combined.body.pipelineValue).toBe(300);
  });

  it('forces Sales to their own figures and lets Manager/Admin choose the owner (AC-FR08-07)', async () => {
    const team = await seedTeam();

    await createContact({ orgId: team.orgId, ownerId: team.salesA.id, createdAt: IN_RANGE });
    await createContact({ orgId: team.orgId, ownerId: team.salesB.id, createdAt: IN_RANGE });
    await makeDeal(team, { ownerId: team.salesA.id, value: 100 });
    await makeDeal(team, { ownerId: team.salesB.id, value: 900 });

    const salesOverride = await summary(
      `?from=2026-11-01&to=2026-11-30&ownerId=${team.salesB.id}`,
      team.salesA.authorization,
    );
    expect(salesOverride.status).toBe(200);
    expect(salesOverride.body.newLeads).toBe(1);
    expect(salesOverride.body.pipelineValue).toBe(100);

    const managerAll = await summary('?from=2026-11-01&to=2026-11-30', team.manager.authorization);
    expect(managerAll.body.newLeads).toBe(2);
    expect(managerAll.body.pipelineValue).toBe(1000);

    const managerFiltered = await summary(
      `?from=2026-11-01&to=2026-11-30&ownerId=${team.salesB.id}`,
      team.manager.authorization,
    );
    expect(managerFiltered.body.newLeads).toBe(1);
    expect(managerFiltered.body.pipelineValue).toBe(900);
  });

  it('returns zeros and empty arrays for an empty org (AC-FR08-08)', async () => {
    const team = await seedTeam();
    const emptyOrg = await createOrg({ name: 'Empty' });
    const emptyAdmin = await createUser({ orgId: emptyOrg.id, role: UserRole.ADMIN });

    const response = await summary(
      '?from=2026-11-01&to=2026-11-30',
      loginAs(emptyAdmin).authorization,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      newLeads: 0,
      dealsByStage: [],
      pipelineValue: 0,
      winRate: 0,
      forecastByMonth: [],
      range: { timezone: 'Asia/Ho_Chi_Minh' },
    });
    expect(team.orgId).not.toBe(emptyOrg.id);
  });

  it('never leaks another organization into the summary (AC-FR08-08)', async () => {
    const team = await seedTeam();

    await createContact({ orgId: team.orgId, ownerId: team.salesA.id, createdAt: IN_RANGE });
    await makeDeal(team, { ownerId: team.salesA.id, value: 100 });

    await createContact({ orgId: team.otherOrgId, ownerId: team.otherAdmin.id, createdAt: IN_RANGE });
    await makeDeal(team, {
      orgId: team.otherOrgId,
      ownerId: team.otherAdmin.id,
      value: 200,
    });

    const otherOrg = await summary(
      '?from=2026-11-01&to=2026-11-30',
      team.otherAdmin.authorization,
    );
    expect(otherOrg.status).toBe(200);
    expect(otherOrg.body.newLeads).toBe(1);
    expect(otherOrg.body.pipelineValue).toBe(200);
    expect(otherOrg.body.dealsByStage).toHaveLength(1);

    const orgA = await summary('?from=2026-11-01&to=2026-11-30', team.admin.authorization);
    expect(orgA.body.newLeads).toBe(1);
    expect(orgA.body.pipelineValue).toBe(100);
  });

  it('validates the date range and requires authentication (AC-FR08-06)', async () => {
    const team = await seedTeam();

    const inverted = await summary('?from=2026-12-01&to=2026-11-01', team.admin.authorization);
    expect(inverted.status).toBe(400);
    expect(inverted.body.code).toBe('INVALID_DATE_RANGE');

    const tooLarge = await summary('?from=2024-01-01&to=2026-11-01', team.admin.authorization);
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.code).toBe('REPORT_RANGE_TOO_LARGE');

    const malformed = await summary('?from=2026-13-01', team.admin.authorization);
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');

    // 366 inclusive days are allowed.
    const boundary = await summary('?from=2025-12-01&to=2026-12-01', team.admin.authorization);
    expect(boundary.status).toBe(200);

    const anonymous = await summary();
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('UNAUTHENTICATED');
  });

  it('defaults to the current month in the organization timezone (AC-FR08-04)', async () => {
    const team = await seedTeam();

    await createContact({ orgId: team.orgId, ownerId: team.salesA.id });
    await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      createdAt: new Date(Date.now() - 60 * 86_400_000),
    });

    const response = await summary('', team.admin.authorization);
    expect(response.status).toBe(200);
    expect(response.body.newLeads).toBe(1);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    expect(response.body.range).toEqual({
      from: `${today.slice(0, 7)}-01`,
      to: today,
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });
});
