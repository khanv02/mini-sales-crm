import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createContact,
  createDeal,
  createOrg,
  createPipeline,
  createTask,
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';
import { requireAudit } from '../support/audit';

const TASKS = '/api/v1/tasks';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  /** Deal owned by `salesTwo`. */
  secondDealId: string;
  /** Deal of the second organization. */
  otherDealId: string;
}

describe('tasks (integration)', () => {
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
      secondDealId: await deal(org.id, salesTwo.id, 'Acme expansion'),
      otherDealId: await deal(otherOrg.id, otherAdmin.id, 'Globex renewal'),
    };
  }

  function listTasks(authorization: string, query = '') {
    return request(app.getHttpServer()).get(`${TASKS}${query}`).set('Authorization', authorization);
  }

  function patchTask(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`${TASKS}/${id}`)
      .set('Authorization', authorization)
      .send(body);
  }

  it('lists tasks from the activity projection and hides non-task rows (T308)', async () => {
    const team = await seedWorkspace();
    const task = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      assigneeId: team.sales.id,
      content: 'Call the buyer',
    });
    await prisma.activity.create({
      data: {
        orgId: team.orgId,
        dealId: team.dealId,
        createdBy: team.sales.id,
        type: 'NOTE',
        content: 'Just a note',
      },
    });

    const response = await listTasks(team.sales.authorization);
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([task.id]);
    expect(response.body.data[0]).toMatchObject({ type: 'TASK', content: 'Call the buyer' });
    expect(response.body).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('splits open, overdue and done, and keeps the three buckets disjoint (T306)', async () => {
    const team = await seedWorkspace();
    const now = Date.now();

    const open = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      dueAt: new Date(now + DAY_MS),
      content: 'Future task',
    });
    const overdue = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      dueAt: new Date(now - DAY_MS),
      content: 'Late task',
    });
    const done = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      dueAt: new Date(now - 2 * DAY_MS),
      doneAt: new Date(now - DAY_MS),
      content: 'Finished task',
    });

    const openList = await listTasks(team.sales.authorization, '?status=open');
    expect(openList.body.data.map((row: { id: string }) => row.id)).toEqual([open.id]);

    const overdueList = await listTasks(team.sales.authorization, '?status=overdue');
    expect(overdueList.body.data.map((row: { id: string }) => row.id)).toEqual([overdue.id]);

    const doneList = await listTasks(team.sales.authorization, '?status=done');
    expect(doneList.body.data.map((row: { id: string }) => row.id)).toEqual([done.id]);

    // A done task is never overdue, even though its deadline has passed.
    expect(overdueList.body.data.map((row: { id: string }) => row.id)).not.toContain(done.id);
  });

  it('scopes Sales to their own tasks while Manager/Admin see the org (T306)', async () => {
    const team = await seedWorkspace();
    const mine = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      assigneeId: team.sales.id,
    });
    const theirs = await createTask({
      orgId: team.orgId,
      dealId: team.secondDealId,
      createdBy: team.salesTwo.id,
      assigneeId: team.salesTwo.id,
    });

    const salesList = await listTasks(team.sales.authorization);
    expect(salesList.body.data.map((row: { id: string }) => row.id)).toEqual([mine.id]);

    const managerList = await listTasks(team.manager.authorization);
    expect(new Set(managerList.body.data.map((row: { id: string }) => row.id))).toEqual(
      new Set([mine.id, theirs.id]),
    );

    const filtered = await listTasks(team.manager.authorization, `?assigneeId=${team.salesTwo.id}`);
    expect(filtered.body.data.map((row: { id: string }) => row.id)).toEqual([theirs.id]);
  });

  it('marks a task done idempotently and audits the transition (T306)', async () => {
    const team = await seedWorkspace();
    const task = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      assigneeId: team.sales.id,
    });

    const first = await patchTask(team.sales.authorization, task.id, { done: true });
    expect(first.status).toBe(200);
    expect(first.body.doneAt).toEqual(expect.any(String));

    const second = await patchTask(team.sales.authorization, task.id, { done: true });
    expect(second.status).toBe(200);
    expect(second.body.doneAt).toBe(first.body.doneAt);

    const audit = await requireAudit({
      orgId: team.orgId,
      entity: 'Activity',
      entityId: task.id,
      action: 'ACTIVITY_UPDATED',
    });
    expect(audit.after).toMatchObject({ doneAt: expect.any(String) });

    const reopened = await patchTask(team.sales.authorization, task.id, { done: false });
    expect(reopened.status).toBe(200);
    expect(reopened.body.doneAt).toBeNull();
  });

  it('rejects a task without a deadline or an assignee and hides other orgs (T306)', async () => {
    const team = await seedWorkspace();

    const noDue = await request(app.getHttpServer())
      .post(`/api/v1/deals/${team.dealId}/activities`)
      .set('Authorization', team.sales.authorization)
      .send({ type: 'TASK', content: 'No deadline', assigneeId: team.sales.id });
    expect(noDue.status).toBe(400);
    expect(noDue.body.code).toBe('TASK_DUE_REQUIRED');

    const noAssignee = await request(app.getHttpServer())
      .post(`/api/v1/deals/${team.dealId}/activities`)
      .set('Authorization', team.sales.authorization)
      .send({ type: 'TASK', content: 'Nobody', dueAt: new Date(Date.now() + HOUR_MS).toISOString() });
    expect(noAssignee.status).toBe(400);
    expect(noAssignee.body.code).toBe('TASK_ASSIGNEE_REQUIRED');

    const foreignTask = await createTask({
      orgId: team.otherOrgId,
      dealId: team.otherDealId,
      createdBy: team.otherAdmin.id,
      assigneeId: team.otherAdmin.id,
    });
    const foreignPatch = await patchTask(team.admin.authorization, foreignTask.id, { done: true });
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body.code).toBe('ACTIVITY_NOT_FOUND');

    const otherOrgList = await listTasks(team.admin.authorization);
    expect(otherOrgList.body.data.map((row: { id: string }) => row.id)).not.toContain(foreignTask.id);
  });

  it('filters by due range and paginates with a cursor (T306)', async () => {
    const team = await seedWorkspace();
    const now = Date.now();

    const early = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      dueAt: new Date(now + DAY_MS),
    });
    const late = await createTask({
      orgId: team.orgId,
      dealId: team.dealId,
      createdBy: team.sales.id,
      dueAt: new Date(now + 10 * DAY_MS),
    });

    const from = new Date(now + 5 * DAY_MS).toISOString().slice(0, 10);
    const ranged = await listTasks(team.sales.authorization, `?dueFrom=${from}`);
    expect(ranged.body.data.map((row: { id: string }) => row.id)).toEqual([late.id]);

    const firstPage = await listTasks(team.sales.authorization, '?limit=1');
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.data).toHaveLength(1);

    const secondPage = await listTasks(
      team.sales.authorization,
      `?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`,
    );
    expect(secondPage.body.data).toHaveLength(1);
    const seen = new Set([
      ...firstPage.body.data.map((row: { id: string }) => row.id),
      ...secondPage.body.data.map((row: { id: string }) => row.id),
    ]);
    expect(seen).toEqual(new Set([early.id, late.id]));
  });
});
