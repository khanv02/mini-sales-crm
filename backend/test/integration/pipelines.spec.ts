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
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';

const PIPELINES = '/api/v1/pipelines';
const STAGES = '/api/v1/stages';

interface Actor {
  id: string;
  authorization: string;
}

describe('pipelines (integration)', () => {
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
    otherAdmin: Actor;
  }> {
    const org = await createOrg({ name: 'Acme' });
    const other = await createOrg({ name: 'Globex' });

    async function actor(orgId: string, role: UserRole): Promise<Actor> {
      const user = await createUser({ orgId, role });
      return { id: user.id, authorization: loginAs(user).authorization };
    }

    return {
      orgId: org.id,
      admin: await actor(org.id, UserRole.ADMIN),
      manager: await actor(org.id, UserRole.MANAGER),
      sales: await actor(org.id, UserRole.SALES),
      otherAdmin: await actor(other.id, UserRole.ADMIN),
    };
  }

  function createPipelineRequest(authorization: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(PIPELINES).set('Authorization', authorization).send(body);
  }

  function updatePipelineRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`${PIPELINES}/${id}`)
      .set('Authorization', authorization)
      .send(body);
  }

  function createStageRequest(authorization: string, pipelineId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${PIPELINES}/${pipelineId}/stages`)
      .set('Authorization', authorization)
      .send(body);
  }

  function updateStageRequest(authorization: string, id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).patch(`${STAGES}/${id}`).set('Authorization', authorization).send(body);
  }

  function deleteStageRequest(authorization: string, id: string) {
    return request(app.getHttpServer()).delete(`${STAGES}/${id}`).set('Authorization', authorization);
  }

  function deletePipelineRequest(authorization: string, id: string) {
    return request(app.getHttpServer()).delete(`${PIPELINES}/${id}`).set('Authorization', authorization);
  }

  it('creates a pipeline with increasing stage positions and audits it (AC-FR04-01)', async () => {
    const team = await seedTeam();

    const response = await createPipelineRequest(team.admin.authorization, {
      name: 'Sales Funnel',
      stages: [
        { name: 'New' },
        { name: 'Qualified' },
        { name: 'Won', isWon: true },
        { name: 'Lost', isLost: true },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ orgId: team.orgId, name: 'Sales Funnel' });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.stages.map((stage: { name: string; position: number }) => [stage.name, stage.position])).toEqual([
      ['New', 1],
      ['Qualified', 2],
      ['Won', 3],
      ['Lost', 4],
    ]);
    for (const stage of response.body.stages as Array<{ orgId: string; pipelineId: string; isWon: boolean }>) {
      expect(stage.orgId).toBe(team.orgId);
      expect(stage.pipelineId).toBe(response.body.id);
    }

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Pipeline', entityId: response.body.id as string, action: 'PIPELINE_CREATED' },
    });
    expect(audit?.orgId).toBe(team.orgId);
    expect(audit?.actorId).toBe(team.admin.id);
    expect(audit?.after).toMatchObject({ name: 'Sales Funnel' });

    const appended = await createStageRequest(team.admin.authorization, response.body.id as string, {
      name: 'Negotiation',
    });
    expect(appended.status).toBe(201);
    expect(appended.body).toMatchObject({ position: 5, isWon: false, isLost: false, orgId: team.orgId });

    const stageAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Stage', entityId: appended.body.id as string, action: 'STAGE_CREATED' },
    });
    expect(stageAudit?.actorId).toBe(team.admin.id);
    expect(stageAudit?.after).toMatchObject({ name: 'Negotiation', position: 5 });

    const listed = await request(app.getHttpServer())
      .get(PIPELINES)
      .set('Authorization', team.sales.authorization);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].stages.map((stage: { name: string }) => stage.name)).toEqual([
      'New',
      'Qualified',
      'Won',
      'Lost',
      'Negotiation',
    ]);
  });

  it('renames and repositions stages and pipelines with before/after audit (AC-FR04-02)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipelineRequest(team.admin.authorization, {
      name: 'Pipeline',
      stages: [
        { name: 'First' },
        { name: 'Second' },
        { name: 'Third' },
        { name: 'Won', isWon: true },
        { name: 'Lost', isLost: true },
      ],
    });
    const [, second, third] = pipeline.body.stages as Array<{ id: string; name: string }>;

    const reordered = await updateStageRequest(team.admin.authorization, second.id, { position: 0.5 });
    expect(reordered.status).toBe(200);
    expect(reordered.body).toMatchObject({ id: second.id, position: 0.5 });

    const listed = await request(app.getHttpServer())
      .get(PIPELINES)
      .set('Authorization', team.admin.authorization);
    expect(listed.body[0].stages.map((stage: { name: string }) => stage.name)).toEqual([
      'Second',
      'First',
      'Third',
      'Won',
      'Lost',
    ]);

    const reorderAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Stage', entityId: second.id, action: 'STAGE_UPDATED' },
    });
    expect(reorderAudit?.before).toMatchObject({ name: 'Second', position: 2 });
    expect(reorderAudit?.after).toMatchObject({ name: 'Second', position: 0.5 });

    const renamed = await updateStageRequest(team.admin.authorization, third.id, { name: 'Closed' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Closed');

    const renameAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Stage', entityId: third.id, action: 'STAGE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(renameAudit?.before).toMatchObject({ name: 'Third' });
    expect(renameAudit?.after).toMatchObject({ name: 'Closed' });

    const pipelineRenamed = await updatePipelineRequest(
      team.admin.authorization,
      pipeline.body.id as string,
      { name: 'Renamed Pipeline' },
    );
    expect(pipelineRenamed.status).toBe(200);
    expect(pipelineRenamed.body.name).toBe('Renamed Pipeline');
    const pipelineAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Pipeline', entityId: pipeline.body.id as string, action: 'PIPELINE_UPDATED' },
    });
    expect(pipelineAudit?.before).toMatchObject({ name: 'Pipeline' });
    expect(pipelineAudit?.after).toMatchObject({ name: 'Renamed Pipeline' });

    const emptyPatch = await updateStageRequest(team.admin.authorization, third.id, {});
    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body.code).toBe('VALIDATION_ERROR');

    const bothFlags = await updateStageRequest(team.admin.authorization, third.id, {
      isWon: true,
      isLost: true,
    });
    expect(bothFlags.status).toBe(400);
    expect(bothFlags.body.code).toBe('VALIDATION_ERROR');
  });

  it('keeps at most one won and one lost stage per pipeline and never removes them (AC-FR04-02, AC-FR04-04)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipelineRequest(team.admin.authorization, {
      name: 'Lifecycle',
      stages: [
        { name: 'Open' },
        { name: 'Archived' },
        { name: 'Won', isWon: true },
        { name: 'Lost', isLost: true },
      ],
    });
    expect(pipeline.status).toBe(201);
    const [open, archived, won, lost] = pipeline.body.stages as Array<{ id: string }>;

    const secondWon = await updateStageRequest(team.admin.authorization, archived.id, { isWon: true });
    expect(secondWon.status).toBe(409);
    expect(secondWon.body.code).toBe('WON_STAGE_REQUIRED');

    const unsetWon = await updateStageRequest(team.admin.authorization, won.id, { isWon: false });
    expect(unsetWon.status).toBe(409);
    expect(unsetWon.body.code).toBe('WON_STAGE_REQUIRED');
    await expect(prisma.stage.findUniqueOrThrow({ where: { id: won.id } })).resolves.toMatchObject({
      isWon: true,
    });

    const secondLost = await updateStageRequest(team.admin.authorization, open.id, { isLost: true });
    expect(secondLost.status).toBe(409);
    expect(secondLost.body.code).toBe('LOST_STAGE_REQUIRED');

    const unsetLost = await updateStageRequest(team.admin.authorization, lost.id, { isLost: false });
    expect(unsetLost.status).toBe(409);
    expect(unsetLost.body.code).toBe('LOST_STAGE_REQUIRED');

    const createdWon = await createStageRequest(team.admin.authorization, pipeline.body.id as string, {
      name: 'Duplicate Won',
      isWon: true,
    });
    expect(createdWon.status).toBe(409);
    expect(createdWon.body.code).toBe('WON_STAGE_REQUIRED');

    const createdBoth = await createStageRequest(team.admin.authorization, pipeline.body.id as string, {
      name: 'Confused',
      isWon: true,
      isLost: true,
    });
    expect(createdBoth.status).toBe(400);
    expect(createdBoth.body.code).toBe('VALIDATION_ERROR');
  });

  it('blocks deleting a stage that still has deals and leaves it intact (AC-FR04-03)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipeline({ orgId: team.orgId, 
      name: 'With Deals',
      stages: [{ name: 'Open' }, { name: 'Negotiation' }],
    });
    const stage = pipeline.stages[1];
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    const deal = await createDeal({
      orgId: team.orgId,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: team.sales.id,
    });

    const response = await deleteStageRequest(team.admin.authorization, stage.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STAGE_HAS_DEALS');

    await expect(prisma.stage.findUnique({ where: { id: stage.id } })).resolves.not.toBeNull();
    await expect(prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).resolves.toMatchObject({
      stageId: stage.id,
    });
    await expect(
      prisma.auditLog.count({ where: { entity: 'Stage', entityId: stage.id, action: 'STAGE_DELETED' } }),
    ).resolves.toBe(0);
  });

  it('guards the last stage and the won/lost stages on delete (AC-FR04-04)', async () => {
    const team = await seedTeam();
    const single = await createPipeline({ orgId: team.orgId,  name: 'Single', stages: [{ name: 'Only' }] });

    const lastStage = await deleteStageRequest(team.admin.authorization, single.stages[0].id);
    expect(lastStage.status).toBe(409);
    expect(lastStage.body.code).toBe('LAST_STAGE');

    const pipeline = await createPipeline({ orgId: team.orgId, 
      name: 'Terminal',
      stages: [{ name: 'Open' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }],
    });
    const won = pipeline.stages.find((stage) => stage.isWon);
    const lost = pipeline.stages.find((stage) => stage.isLost);

    const deleteWon = await deleteStageRequest(team.admin.authorization, won?.id as string);
    expect(deleteWon.status).toBe(409);
    expect(deleteWon.body.code).toBe('WON_STAGE_REQUIRED');

    const deleteLost = await deleteStageRequest(team.admin.authorization, lost?.id as string);
    expect(deleteLost.status).toBe(409);
    expect(deleteLost.body.code).toBe('LOST_STAGE_REQUIRED');

    const open = pipeline.stages.find((stage) => !stage.isWon && !stage.isLost);
    const deleted = await deleteStageRequest(team.admin.authorization, open?.id as string);
    expect(deleted.status).toBe(204);
  });

  it('blocks deleting a pipeline that still has deals but deletes an empty one (AC-FR04-05)', async () => {
    const team = await seedTeam();
    const busy = await createPipeline({ orgId: team.orgId, 
      name: 'Busy',
      stages: [{ name: 'Open' }],
    });
    const contact = await createContact({ orgId: team.orgId, ownerId: team.sales.id });
    await createDeal({
      orgId: team.orgId,
      contactId: contact.id,
      pipelineId: busy.id,
      stageId: busy.stages[0].id,
      ownerId: team.sales.id,
    });

    const blocked = await deletePipelineRequest(team.admin.authorization, busy.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('PIPELINE_HAS_DEALS');
    await expect(prisma.pipeline.findUnique({ where: { id: busy.id } })).resolves.not.toBeNull();

    const empty = await createPipeline({ orgId: team.orgId,  name: 'Empty', stages: [{ name: 'Open' }] });
    const deleted = await deletePipelineRequest(team.admin.authorization, empty.id);
    expect(deleted.status).toBe(204);
    await expect(prisma.pipeline.findUnique({ where: { id: empty.id } })).resolves.toBeNull();
    await expect(prisma.stage.count({ where: { pipelineId: empty.id } })).resolves.toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Pipeline', entityId: empty.id, action: 'PIPELINE_DELETED' },
    });
    expect(audit?.actorId).toBe(team.admin.id);
  });

  it('restricts writes to Admin while Manager/Sales keep read access (AC-FR04-06)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipeline({ orgId: team.orgId,  name: 'Read Only', stages: [{ name: 'Open' }] });

    const managerCreate = await createPipelineRequest(team.manager.authorization, { name: 'Manager Pipeline' });
    expect(managerCreate.status).toBe(403);
    expect(managerCreate.body.code).toBe('FORBIDDEN');

    const managerStage = await createStageRequest(team.manager.authorization, pipeline.id, { name: 'Manager Stage' });
    expect(managerStage.status).toBe(403);

    const salesUpdate = await updateStageRequest(team.sales.authorization, pipeline.stages[0].id, {
      name: 'Sales Stage',
    });
    expect(salesUpdate.status).toBe(403);

    const salesDelete = await deletePipelineRequest(team.sales.authorization, pipeline.id);
    expect(salesDelete.status).toBe(403);

    const salesRead = await request(app.getHttpServer())
      .get(PIPELINES)
      .set('Authorization', team.sales.authorization);
    expect(salesRead.status).toBe(200);
    expect(salesRead.body.map((row: { id: string }) => row.id)).toEqual([pipeline.id]);

    const managerRead = await request(app.getHttpServer())
      .get(PIPELINES)
      .set('Authorization', team.manager.authorization);
    expect(managerRead.status).toBe(200);
  });

  it('hides another org pipeline and stage as 404 without touching the DB (AC-FR04-07)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipeline({ orgId: team.orgId,  name: 'Private', stages: [{ name: 'Open' }] });
    const stage = pipeline.stages[0];

    const foreignPatchPipeline = await updatePipelineRequest(team.otherAdmin.authorization, pipeline.id, {
      name: 'Hijacked',
    });
    expect(foreignPatchPipeline.status).toBe(404);
    expect(foreignPatchPipeline.body.code).toBe('PIPELINE_NOT_FOUND');

    const foreignDeletePipeline = await deletePipelineRequest(team.otherAdmin.authorization, pipeline.id);
    expect(foreignDeletePipeline.status).toBe(404);

    const foreignStage = await createStageRequest(team.otherAdmin.authorization, pipeline.id, { name: 'Foreign' });
    expect(foreignStage.status).toBe(404);
    expect(foreignStage.body.code).toBe('PIPELINE_NOT_FOUND');

    const foreignPatchStage = await updateStageRequest(team.otherAdmin.authorization, stage.id, {
      name: 'Hijacked',
    });
    expect(foreignPatchStage.status).toBe(404);
    expect(foreignPatchStage.body.code).toBe('STAGE_NOT_FOUND');

    const foreignDeleteStage = await deleteStageRequest(team.otherAdmin.authorization, stage.id);
    expect(foreignDeleteStage.status).toBe(404);

    const unchanged = await prisma.pipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: { stages: true },
    });
    expect(unchanged.name).toBe('Private');
    expect(unchanged.stages).toHaveLength(1);
    expect(unchanged.stages[0]?.name).toBe('Open');
    await expect(prisma.auditLog.count({ where: { entityId: pipeline.id } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { entityId: stage.id } })).resolves.toBe(0);
  });

  it('requires a won and a lost stage when a pipeline is created (G4)', async () => {
    const team = await seedTeam();

    const noTerminal = await createPipelineRequest(team.admin.authorization, {
      name: 'No Terminal',
      stages: [{ name: 'Open' }, { name: 'Qualified' }],
    });
    expect(noTerminal.status).toBe(409);
    expect(noTerminal.body.code).toBe('WON_STAGE_REQUIRED');
    await expect(prisma.pipeline.count({ where: { name: 'No Terminal' } })).resolves.toBe(0);

    const noLost = await createPipelineRequest(team.admin.authorization, {
      name: 'No Lost',
      stages: [{ name: 'Open' }, { name: 'Won', isWon: true }],
    });
    expect(noLost.status).toBe(409);
    expect(noLost.body.code).toBe('LOST_STAGE_REQUIRED');
    await expect(prisma.pipeline.count({ where: { name: 'No Lost' } })).resolves.toBe(0);

    const noStages = await createPipelineRequest(team.admin.authorization, { name: 'Bare' });
    expect(noStages.status).toBe(409);
    expect(noStages.body.code).toBe('WON_STAGE_REQUIRED');

    const complete = await createPipelineRequest(team.admin.authorization, {
      name: 'Complete',
      stages: [{ name: 'Open' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }],
    });
    expect(complete.status).toBe(201);
  });

  it('maps duplicate pipeline and stage names to 409 case-insensitively (AC-FR04-01, AC-FR04-02)', async () => {
    const team = await seedTeam();
    const pipeline = await createPipelineRequest(team.admin.authorization, {
      name: 'Duplicates',
      stages: [{ name: 'Open' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }],
    });
    expect(pipeline.status).toBe(201);

    const duplicatePipeline = await createPipelineRequest(team.admin.authorization, {
      name: 'duplicates',
      stages: [{ name: 'Open' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }],
    });
    expect(duplicatePipeline.status).toBe(409);
    expect(duplicatePipeline.body.code).toBe('PIPELINE_NAME_DUPLICATED');

    const duplicateStage = await createStageRequest(team.admin.authorization, pipeline.body.id as string, {
      name: 'OPEN',
    });
    expect(duplicateStage.status).toBe(409);
    expect(duplicateStage.body.code).toBe('STAGE_NAME_DUPLICATED');

    const duplicateInPayload = await createPipelineRequest(team.admin.authorization, {
      name: 'Payload Duplicates',
      stages: [
        { name: 'Same' },
        { name: 'same' },
        { name: 'Won', isWon: true },
        { name: 'Lost', isLost: true },
      ],
    });
    expect(duplicateInPayload.status).toBe(409);
    expect(duplicateInPayload.body.code).toBe('STAGE_NAME_DUPLICATED');
    await expect(prisma.pipeline.count({ where: { name: 'Payload Duplicates' } })).resolves.toBe(0);

    const otherPipeline = await createPipeline({ orgId: team.orgId,  name: 'Other', stages: [{ name: 'Open' }] });
    expect(otherPipeline.stages[0].name).toBe('Open');
  });

  it('validates payloads, ids and authentication', async () => {
    const team = await seedTeam();
    const pipeline = await createPipeline({ orgId: team.orgId,  name: 'Validation', stages: [{ name: 'Open' }] });

    const emptyName = await createPipelineRequest(team.admin.authorization, { name: '   ' });
    expect(emptyName.status).toBe(400);
    expect(emptyName.body.code).toBe('VALIDATION_ERROR');
    expect(emptyName.body.details.fields.name).toEqual(expect.any(Array));

    const negativePosition = await updateStageRequest(team.admin.authorization, pipeline.stages[0].id, {
      position: -1,
    });
    expect(negativePosition.status).toBe(400);
    expect(negativePosition.body.code).toBe('VALIDATION_ERROR');

    const malformedId = await request(app.getHttpServer())
      .patch(`${STAGES}/not-a-uuid`)
      .set('Authorization', team.admin.authorization)
      .send({ name: 'Nope' });
    expect(malformedId.status).toBe(400);
    expect(malformedId.body.code).toBe('VALIDATION_ERROR');

    const missingPipeline = await createStageRequest(
      team.admin.authorization,
      '00000000-0000-4000-8000-000000000000',
      { name: 'Ghost' },
    );
    expect(missingPipeline.status).toBe(404);
    expect(missingPipeline.body.code).toBe('PIPELINE_NOT_FOUND');

    const missingStage = await updateStageRequest(
      team.admin.authorization,
      '00000000-0000-4000-8000-000000000000',
      { name: 'Ghost' },
    );
    expect(missingStage.status).toBe(404);
    expect(missingStage.body.code).toBe('STAGE_NOT_FOUND');

    const unauthenticated = await request(app.getHttpServer()).get(PIPELINES);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe('UNAUTHENTICATED');

    const unauthenticatedStage = await createStageRequest('', pipeline.id, {
      name: 'No Token',
    });
    expect(unauthenticatedStage.status).toBe(401);
  });
});
