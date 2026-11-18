import { performance } from 'node:perf_hooks';
import os from 'node:os';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/app';
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
} from '../factories';

/**
 * T226 / AC-FR05-10 and AC-NFR01-02: deal board reads and moves with 5,000 deals.
 *
 * Seeds 5,000 deals across one three-stage pipeline, measures `GET /deals?pipelineId=...`
 * (p95 < 300ms) and `PATCH /deals/:id/move` (p95 < 500ms) over three runs, and logs the
 * `EXPLAIN (ANALYZE, BUFFERS)` plan. Manual/nightly suite: `pnpm test:perf`.
 */
const DEAL_COUNT = 5_000;
const RUNS = 3;
const WARMUP_REQUESTS = 5;
const MEASURED_REQUESTS = 50;
const READ_P95_BUDGET_MS = 300;
const WRITE_P95_BUDGET_MS = 500;

const DEAL_UUID_PREFIX = '5b3c9d21-2e4f-4a6b-8c1d-';

function percentile(samples: number[], ratio: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/** Fixed prefix + sequence keeps reruns stable without an extra dependency. */
function deterministicDealUuid(index: number): string {
  return `${DEAL_UUID_PREFIX}${index.toString(16).padStart(12, '0')}`;
}

async function seedDeals(input: {
  orgId: string;
  contactId: string;
  ownerId: string;
  pipelineId: string;
  stageIds: string[];
}): Promise<void> {
  const base = Date.UTC(2026, 0, 1, 9, 0, 0);

  for (let offset = 0; offset < DEAL_COUNT; offset += 1_000) {
    const batch = Array.from({ length: Math.min(1_000, DEAL_COUNT - offset) }, (_, index) => {
      const sequence = offset + index;
      const stageIndex = sequence % input.stageIds.length;
      return {
        id: deterministicDealUuid(sequence),
        orgId: input.orgId,
        contactId: input.contactId,
        pipelineId: input.pipelineId,
        stageId: input.stageIds[stageIndex]!,
        ownerId: input.ownerId,
        title: `Perf deal ${sequence}`,
        value: (sequence % 1_000) * 1_000,
        currency: 'VND',
        expectedClose: null,
        status: 'OPEN' as const,
        lostReason: null,
        position: Math.floor(sequence / input.stageIds.length) + 1,
        version: 1,
        closedAt: null,
        createdAt: new Date(base + sequence * 60_000),
        updatedAt: new Date(base + sequence * 60_000),
      };
    });

    await prisma.deal.createMany({ data: batch });
  }

  await prisma.$executeRawUnsafe('ANALYZE "deals"');
}

async function logQueryPlans(input: {
  orgId: string;
  pipelineId: string;
  stageId: string;
}): Promise<void> {
  const boardPlan = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT d."id", s."position", d."position"
     FROM "deals" d
     JOIN "stages" s ON s."org_id" = d."org_id" AND s."id" = d."stage_id"
     WHERE d."org_id" = '${input.orgId}'::uuid AND d."pipeline_id" = '${input.pipelineId}'::uuid
     ORDER BY s."position" ASC, d."position" ASC, d."id" ASC
     LIMIT 101`,
  );
  console.log('\nEXPLAIN board read:\n' + boardPlan.map((row) => Object.values(row)[0]).join('\n'));

  const stagePlan = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT "id", "position"
     FROM "deals"
     WHERE "org_id" = '${input.orgId}'::uuid AND "stage_id" = '${input.stageId}'::uuid
     ORDER BY "position" ASC, "id" ASC`,
  );
  console.log('\nEXPLAIN stage cards (move):\n' + stagePlan.map((row) => Object.values(row)[0]).join('\n'));
}

async function measureBoardRun(
  app: INestApplication,
  authorization: string,
  path: string,
): Promise<number[]> {
  for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
    await request(app.getHttpServer()).get(path).set('Authorization', authorization);
  }

  const samples: number[] = [];
  for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
    const startedAt = performance.now();
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', authorization);
    const elapsed = performance.now() - startedAt;
    if (response.status !== 200) {
      throw new Error(`board read returned ${response.status}: ${JSON.stringify(response.body)}`);
    }
    samples.push(elapsed);
  }
  return samples;
}

interface MoveState {
  version: number;
  toggle: number;
}

async function measureMoveRun(
  app: INestApplication,
  authorization: string,
  dealId: string,
  targetStageIds: [string, string],
  state: MoveState,
): Promise<number[]> {
  async function move(): Promise<number> {
    const stageId = targetStageIds[state.toggle % 2]!;
    state.toggle += 1;
    const startedAt = performance.now();
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', authorization)
      // A large index is clamped to the end of the stage, avoiding fractional rebalances.
      .send({ stageId, position: 1_000_000, version: state.version });
    const elapsed = performance.now() - startedAt;
    if (response.status !== 200) {
      throw new Error(`deal move returned ${response.status}: ${JSON.stringify(response.body)}`);
    }
    state.version = response.body.version as number;
    return elapsed;
  }

  for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
    await move();
  }

  const samples: number[] = [];
  for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
    samples.push(await move());
  }
  return samples;
}

describe('deals board performance (T226)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv());
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
    await app.close();
  });

  it(
    `lists and moves deals with 5,000 rows within budget`,
    async () => {
      await resetDatabase();
      const org = await createOrg({ name: 'Deals Perf Org' });
      const admin = await createUser({ orgId: org.id, role: 'ADMIN' });
      const authorization = loginAs(admin).authorization;
      const contact = await createContact({ orgId: org.id, ownerId: admin.id, name: 'Perf Contact' });
      const pipeline = await createPipeline({
        orgId: org.id,
        name: 'Perf Pipeline',
        stages: [{ name: 'New' }, { name: 'Qualified' }, { name: 'Proposal' }],
      });
      const stageIds = pipeline.stages.map((stage) => stage.id);

      console.log(`Seeding ${DEAL_COUNT.toLocaleString('en-US')} deals...`);
      const seedStartedAt = performance.now();
      await seedDeals({
        orgId: org.id,
        contactId: contact.id,
        ownerId: admin.id,
        pipelineId: pipeline.id,
        stageIds,
      });
      console.log(`Seeded in ${Math.round(performance.now() - seedStartedAt)}ms.`);

      await logQueryPlans({ orgId: org.id, pipelineId: pipeline.id, stageId: stageIds[0]! });

      console.log(
        `\nMachine: ${os.cpus()[0]?.model ?? 'unknown CPU'} | ${Math.round(os.totalmem() / 1024 / 1024)} MB RAM`,
      );
      console.log(`Runs: ${RUNS} x (${WARMUP_REQUESTS} warmup + ${MEASURED_REQUESTS} measured)\n`);

      const boardPath = `/api/v1/deals?pipelineId=${pipeline.id}&limit=100`;
      const readP95: number[] = [];
      const readP50: number[] = [];
      const readP99: number[] = [];

      for (let run = 0; run < RUNS; run += 1) {
        const samples = await measureBoardRun(app, authorization, boardPath);
        readP50.push(percentile(samples, 0.5));
        readP95.push(percentile(samples, 0.95));
        readP99.push(percentile(samples, 0.99));
      }

      const moveDealId = deterministicDealUuid(0);
      const moveState: MoveState = { version: 1, toggle: 0 };
      const moveP95: number[] = [];
      const moveP50: number[] = [];
      const moveP99: number[] = [];

      for (let run = 0; run < RUNS; run += 1) {
        const samples = await measureMoveRun(
          app,
          authorization,
          moveDealId,
          [stageIds[1]!, stageIds[2]!],
          moveState,
        );
        moveP50.push(percentile(samples, 0.5));
        moveP95.push(percentile(samples, 0.95));
        moveP99.push(percentile(samples, 0.99));
      }

      const rows = [
        { scenario: 'GET /deals?pipelineId (board)', p50: median(readP50), p95: median(readP95), p99: median(readP99) },
        { scenario: 'PATCH /deals/:id/move', p50: median(moveP50), p95: median(moveP95), p99: median(moveP99) },
      ];

      console.log('scenario'.padEnd(32), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8));
      for (const row of rows) {
        console.log(
          row.scenario.padEnd(32),
          `${row.p50.toFixed(1)}ms`.padStart(8),
          `${row.p95.toFixed(1)}ms`.padStart(8),
          `${row.p99.toFixed(1)}ms`.padStart(8),
        );
      }

      const failures: string[] = [];
      if (median(readP95) >= READ_P95_BUDGET_MS) {
        failures.push(`board read: p95 ${median(readP95).toFixed(1)}ms >= ${READ_P95_BUDGET_MS}ms`);
      }
      if (median(moveP95) >= WRITE_P95_BUDGET_MS) {
        failures.push(`move: p95 ${median(moveP95).toFixed(1)}ms >= ${WRITE_P95_BUDGET_MS}ms`);
      }
      if (failures.length > 0) {
        throw new Error(
          `Perf budget exceeded. Run EXPLAIN (ANALYZE, BUFFERS) before changing anything:\n${failures.join('\n')}`,
        );
      }
    },
    600_000,
  );
});
