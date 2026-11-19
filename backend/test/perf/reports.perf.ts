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
 * T312 / AC-FR08-09 and AC-NFR01-02: dashboard summary with 5,000 deals.
 *
 * Seeds 5,000 deals (OPEN, WON and LOST) spread over 2026, measures
 * `GET /reports/summary?from=2026-01-01&to=2026-12-30` over three runs (p95 < 300ms) and logs the
 * `EXPLAIN (ANALYZE, BUFFERS)` plans of the aggregate and win-rate queries. Manual/nightly: `pnpm test:perf`.
 */
const DEAL_COUNT = 5_000;
const RUNS = 3;
const WARMUP_REQUESTS = 5;
const MEASURED_REQUESTS = 50;
const P95_BUDGET_MS = 300;

const FROM = '2026-01-01';
const TO = '2026-12-30';

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

async function seedDeals(input: {
  orgId: string;
  contactId: string;
  ownerId: string;
  pipelineId: string;
  stageIds: { open: string[]; won: string; lost: string };
}): Promise<void> {
  const start = Date.UTC(2026, 0, 1, 3, 0, 0);

  for (let offset = 0; offset < DEAL_COUNT; offset += 1_000) {
    const batch = Array.from({ length: Math.min(1_000, DEAL_COUNT - offset) }, (_, index) => {
      const sequence = offset + index;
      const bucket = sequence % 100;
      const status = bucket < 12 ? ('WON' as const) : bucket < 20 ? ('LOST' as const) : ('OPEN' as const);
      const stageId =
        status === 'WON'
          ? input.stageIds.won
          : status === 'LOST'
            ? input.stageIds.lost
            : input.stageIds.open[sequence % input.stageIds.open.length]!;
      const createdAt = new Date(start + sequence * 90 * 60_000);
      const closedAt =
        status === 'OPEN'
          ? null
          : new Date(Date.UTC(2026, 1 + (sequence % 10), 1 + (sequence % 27), 3, 0, 0));
      const expectedClose =
        status === 'OPEN' && sequence % 10 !== 0
          ? new Date(Date.UTC(2026, sequence % 6, 1 + (sequence % 28)))
          : null;

      return {
        orgId: input.orgId,
        contactId: input.contactId,
        pipelineId: input.pipelineId,
        stageId,
        ownerId: input.ownerId,
        title: `Perf deal ${sequence}`,
        value: (sequence % 1_000) * 10_000,
        currency: 'VND',
        expectedClose,
        status,
        lostReason: status === 'LOST' ? 'Price' : null,
        position: Math.floor(sequence / input.stageIds.open.length) + 1,
        version: 1,
        closedAt,
        createdAt,
        updatedAt: createdAt,
      };
    });

    await prisma.deal.createMany({ data: batch });
  }

  await prisma.$executeRawUnsafe('ANALYZE "deals"');
}

async function logQueryPlans(input: { orgId: string; fromInstant: Date; toInstant: Date }): Promise<void> {
  const aggregate = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT d."stage_id", s."name", count(*)::int, coalesce(sum(d."value"), 0)
     FROM "deals" d
     JOIN "stages" s ON s."org_id" = d."org_id" AND s."id" = d."stage_id"
     WHERE d."org_id" = '${input.orgId}'::uuid
       AND d."status" = 'OPEN'
       AND d."created_at" >= '${input.fromInstant.toISOString()}'
       AND d."created_at" < '${input.toInstant.toISOString()}'
     GROUP BY d."stage_id", s."name", s."position"
     ORDER BY s."position" ASC, d."stage_id" ASC`,
  );
  console.log('\nEXPLAIN deals by stage:\n' + aggregate.map((row) => Object.values(row)[0]).join('\n'));

  const winRate = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT count(*) FILTER (WHERE d."status" = 'WON')::int,
            count(*) FILTER (WHERE d."status" = 'LOST')::int
     FROM "deals" d
     WHERE d."org_id" = '${input.orgId}'::uuid
       AND d."closed_at" >= '${input.fromInstant.toISOString()}'
       AND d."closed_at" < '${input.toInstant.toISOString()}'`,
  );
  console.log('\nEXPLAIN win rate:\n' + winRate.map((row) => Object.values(row)[0]).join('\n'));
}

describe('dashboard summary performance (T312)', () => {
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
    `aggregates 5,000 deals within the 300ms p95 budget`,
    async () => {
      await resetDatabase();
      const org = await createOrg({ name: 'Reports Perf Org' });
      const admin = await createUser({ orgId: org.id, role: 'ADMIN' });
      const authorization = loginAs(admin).authorization;
      const contact = await createContact({
        orgId: org.id,
        ownerId: admin.id,
        name: 'Perf Contact',
        createdAt: new Date('2026-03-01T03:00:00.000Z'),
      });
      const pipeline = await createPipeline({
        orgId: org.id,
        name: 'Perf Pipeline',
        stages: [
          { name: 'New', position: 1 },
          { name: 'Qualified', position: 2 },
          { name: 'Proposal', position: 3 },
          { name: 'Won', position: 4, isWon: true },
          { name: 'Lost', position: 5, isLost: true },
        ],
      });
      const stages = pipeline.stages;
      const stageIds = {
        open: [stages[0]!.id, stages[1]!.id, stages[2]!.id],
        won: stages[3]!.id,
        lost: stages[4]!.id,
      };

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

      await logQueryPlans({
        orgId: org.id,
        fromInstant: new Date('2025-12-31T17:00:00.000Z'),
        toInstant: new Date('2026-12-30T17:00:00.000Z'),
      });

      console.log(
        `\nMachine: ${os.cpus()[0]?.model ?? 'unknown CPU'} | ${Math.round(os.totalmem() / 1024 / 1024)} MB RAM`,
      );
      console.log(`Runs: ${RUNS} x (${WARMUP_REQUESTS} warmup + ${MEASURED_REQUESTS} measured)\n`);

      const path = `/api/v1/reports/summary?from=${FROM}&to=${TO}`;

      async function measure(): Promise<number> {
        const startedAt = performance.now();
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', authorization);
        const elapsed = performance.now() - startedAt;
        if (response.status !== 200) {
          throw new Error(`summary returned ${response.status}: ${JSON.stringify(response.body)}`);
        }
        return elapsed;
      }

      for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
        await measure();
      }

      const p50: number[] = [];
      const p95: number[] = [];
      const p99: number[] = [];

      for (let run = 0; run < RUNS; run += 1) {
        const samples: number[] = [];
        for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
          samples.push(await measure());
        }
        p50.push(percentile(samples, 0.5));
        p95.push(percentile(samples, 0.95));
        p99.push(percentile(samples, 0.99));
      }

      const sample = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', authorization);
      const summary = sample.body as {
        newLeads: number;
        pipelineValue: number;
        dealsByStage: unknown[];
        forecastByMonth: unknown[];
        winRate: number;
      };
      console.log(
        `Result: newLeads=${summary.newLeads}, dealsByStage=${summary.dealsByStage.length}, ` +
          `pipelineValue=${summary.pipelineValue}, winRate=${summary.winRate}, ` +
          `forecastByMonth=${summary.forecastByMonth.length}`,
      );

      console.log('scenario'.padEnd(32), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8));
      console.log(
        'GET /reports/summary'.padEnd(32),
        `${median(p50).toFixed(1)}ms`.padStart(8),
        `${median(p95).toFixed(1)}ms`.padStart(8),
        `${median(p99).toFixed(1)}ms`.padStart(8),
      );

      const p95Value = median(p95);
      if (summary.newLeads < 1 || summary.dealsByStage.length === 0 || summary.pipelineValue <= 0) {
        throw new Error(`summary returned an empty aggregate: ${JSON.stringify(summary)}`);
      }
      if (p95Value >= P95_BUDGET_MS) {
        throw new Error(
          `Perf budget exceeded: p95 ${p95Value.toFixed(1)}ms >= ${P95_BUDGET_MS}ms. ` +
            'Run EXPLAIN (ANALYZE, BUFFERS) before changing anything.',
        );
      }
    },
    600_000,
  );
});
