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

const DEALS = '/api/v1/deals';
const ACTIVITIES = '/api/v1/activities';

interface Fixture {
  orgId: string;
  otherOrgId: string;
  sales: { id: string; authorization: string };
  otherAdmin: { id: string; authorization: string };
  dealId: string;
  otherDealId: string;
}

describe('activities validation (integration)', () => {
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

  async function seedFixture(): Promise<Fixture> {
    const org = await createOrg({ name: 'Acme' });
    const otherOrg = await createOrg({ name: 'Globex' });

    const salesUser = await createUser({ orgId: org.id, role: UserRole.SALES });
    const otherAdminUser = await createUser({ orgId: otherOrg.id, role: UserRole.ADMIN });

    async function deal(orgId: string, ownerId: string): Promise<string> {
      const contact = await createContact({ orgId, ownerId });
      const pipeline = await createPipeline({ orgId, stages: [{ name: 'New' }] });
      const created = await createDeal({
        orgId,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        ownerId,
      });
      return created.id;
    }

    return {
      orgId: org.id,
      otherOrgId: otherOrg.id,
      sales: { id: salesUser.id, authorization: loginAs(salesUser).authorization },
      otherAdmin: { id: otherAdminUser.id, authorization: loginAs(otherAdminUser).authorization },
      dealId: await deal(org.id, salesUser.id),
      otherDealId: await deal(otherOrg.id, otherAdminUser.id),
    };
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

  it('rejects empty, blank and oversized content (AC-FR07-01, FR-07.1)', async () => {
    const fixture = await seedFixture();

    for (const content of ['', '   ', 'a'.repeat(10_001)]) {
      const response = await createActivityRequest(fixture.sales.authorization, fixture.dealId, {
        type: 'NOTE',
        content,
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.requestId).toBeTruthy();
    }

    await expect(prisma.activity.count()).resolves.toBe(0);
  });

  it('rejects a missing payload field and an unknown type', async () => {
    const fixture = await seedFixture();

    const noContent = await createActivityRequest(fixture.sales.authorization, fixture.dealId, {
      type: 'NOTE',
    });
    expect(noContent.status).toBe(400);
    expect(noContent.body.code).toBe('VALIDATION_ERROR');

    const noType = await createActivityRequest(fixture.sales.authorization, fixture.dealId, {
      content: 'Missing type',
    });
    expect(noType.status).toBe(400);
    expect(noType.body.code).toBe('VALIDATION_ERROR');

    const wrongType = await createActivityRequest(fixture.sales.authorization, fixture.dealId, {
      type: 'FAX',
      content: 'Unsupported channel',
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.code).toBe('VALIDATION_ERROR');

    await expect(prisma.activity.count()).resolves.toBe(0);
  });

  it('returns 404 for an unknown deal and for a deal of another org', async () => {
    const fixture = await seedFixture();

    const unknown = await createActivityRequest(
      fixture.sales.authorization,
      '00000000-0000-4000-8000-000000000999',
      { type: 'NOTE', content: 'Ghost deal' },
    );
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('DEAL_NOT_FOUND');

    const crossTenant = await createActivityRequest(fixture.otherAdmin.authorization, fixture.dealId, {
      type: 'NOTE',
      content: 'Cross tenant',
    });
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.code).toBe('DEAL_NOT_FOUND');

    await expect(prisma.activity.count()).resolves.toBe(0);
  });

  it('rejects an empty PATCH body and a malformed activity id', async () => {
    const fixture = await seedFixture();
    const activity = await createActivity({
      orgId: fixture.orgId,
      dealId: fixture.dealId,
      createdBy: fixture.sales.id,
      content: 'Keep me',
    });

    const empty = await patchActivityRequest(fixture.sales.authorization, activity.id, {});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');

    const badId = await patchActivityRequest(fixture.sales.authorization, 'not-a-uuid', {
      content: 'Whatever',
    });
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_ERROR');

    const blankContent = await patchActivityRequest(fixture.sales.authorization, activity.id, {
      content: '   ',
    });
    expect(blankContent.status).toBe(400);
    expect(blankContent.body.code).toBe('VALIDATION_ERROR');

    const unchanged = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(unchanged.content).toBe('Keep me');
  });

  it('returns 404 when patching an activity of another org', async () => {
    const fixture = await seedFixture();
    const otherActivity = await createActivity({
      orgId: fixture.otherOrgId,
      dealId: fixture.otherDealId,
      createdBy: fixture.otherAdmin.id,
      content: 'Globex entry',
    });

    const response = await patchActivityRequest(fixture.sales.authorization, otherActivity.id, {
      content: 'Hijack',
    });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ACTIVITY_NOT_FOUND');
    await expect(
      prisma.activity.findUniqueOrThrow({ where: { id: otherActivity.id } }),
    ).resolves.toMatchObject({ content: 'Globex entry' });
  });
});
