import { performance } from 'node:perf_hooks';
import os from 'node:os';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/common/config/env';
import { createOrg, createUser, disconnect, loginAs, prisma, resetDatabase } from '../factories';

/**
 * T205 / AC-NFR01-01: contact search with 10,000 contacts in one org.
 *
 * Seeds a deterministic dataset into the test database, then measures `GET /contacts` over three runs
 * (median p95 must stay below 300ms). Manual/nightly suite: `pnpm test:perf` (never part of default CI).
 */
const CONTACT_COUNT = 10_000;
const RUNS = 3;
const WARMUP_REQUESTS = 5;
const MEASURED_REQUESTS = 50;
const P95_BUDGET_MS = 300;

const UUID_PREFIX = '7d1f4c2e-9b8a-4d3c-8e5f-';

const firstNames = [
  'Nguyễn Văn An',
  'Trần Thị Bình',
  'Lê Hoàng Chi',
  'Phạm Minh Dũng',
  'Hoàng Thu Hà',
  'Vũ Quang Hùng',
  'Đặng Ngọc Linh',
  'Bùi Tấn Phát',
];
const companies = ['Acme Software', 'Globex Việt Nam', 'Initech', 'Umbrella', 'Soylent', 'Hooli'];
const sources = ['manual', 'webhook', 'import'];

interface Scenario {
  name: string;
  path: string;
}

const scenarios: Scenario[] = [
  { name: 'search=nguyen', path: '/api/v1/contacts?search=nguyen&limit=50' },
  { name: 'search=acme&source=manual', path: '/api/v1/contacts?search=acme&source=manual&limit=50' },
  {
    name: 'search=an&createdFrom..to',
    path: '/api/v1/contacts?search=an&createdFrom=2026-01-01&createdTo=2026-03-31&limit=50',
  },
  { name: 'sort=-createdAt', path: '/api/v1/contacts?limit=50&sort=-createdAt' },
];

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
function deterministicUuid(index: number): string {
  return `${UUID_PREFIX}${index.toString(16).padStart(12, '0')}`;
}

async function seedDataset(orgId: string, ownerIds: string[]): Promise<void> {
  const base = Date.UTC(2026, 0, 1, 9, 0, 0);

  for (let offset = 0; offset < CONTACT_COUNT; offset += 1_000) {
    const batch = Array.from({ length: Math.min(1_000, CONTACT_COUNT - offset) }, (_, index) => {
      const sequence = offset + index;
      return {
        id: deterministicUuid(sequence),
        orgId,
        name: `${firstNames[sequence % firstNames.length]} ${sequence}`,
        email: sequence % 7 === 0 ? null : `contact${sequence}@example.test`,
        phone: sequence % 4 === 0 ? `+84 90 ${String(sequence).padStart(6, '0')}` : null,
        company: sequence % 5 === 0 ? null : companies[sequence % companies.length],
        source: sources[sequence % sources.length],
        ownerId: sequence % 11 === 0 ? null : (ownerIds[sequence % ownerIds.length] ?? null),
        createdAt: new Date(base + sequence * 60_000),
        updatedAt: new Date(base + sequence * 60_000),
      };
    });

    await prisma.contact.createMany({ data: batch });
  }

  await prisma.$executeRawUnsafe('ANALYZE "contacts"');
}

async function measureRun(
  app: INestApplication,
  authorization: string,
  scenario: Scenario,
): Promise<number[]> {
  for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
    await request(app.getHttpServer()).get(scenario.path).set('Authorization', authorization);
  }

  const samples: number[] = [];
  for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
    const startedAt = performance.now();
    const response = await request(app.getHttpServer())
      .get(scenario.path)
      .set('Authorization', authorization);
    const elapsed = performance.now() - startedAt;
    if (response.status !== 200) {
      throw new Error(`${scenario.name} returned ${response.status}: ${JSON.stringify(response.body)}`);
    }
    samples.push(elapsed);
  }
  return samples;
}

describe('contacts search performance (T205)', () => {
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
    `searches 10,000 contacts with p95 below ${P95_BUDGET_MS}ms`,
    async () => {
      await resetDatabase();
      const org = await createOrg({ name: 'Perf Org' });
      const admin = await createUser({ orgId: org.id, role: 'ADMIN' });
      const salesOne = await createUser({ orgId: org.id, role: 'SALES' });
      const salesTwo = await createUser({ orgId: org.id, role: 'SALES' });
      const authorization = loginAs(admin).authorization;

      console.log(`Seeding ${CONTACT_COUNT.toLocaleString('en-US')} contacts...`);
      const seedStartedAt = performance.now();
      await seedDataset(org.id, [salesOne.id, salesTwo.id]);
      console.log(`Seeded in ${Math.round(performance.now() - seedStartedAt)}ms.`);

      console.log(
        `\nMachine: ${os.cpus()[0]?.model ?? 'unknown CPU'} | ${Math.round(os.totalmem() / 1024 / 1024)} MB RAM`,
      );
      console.log(`Runs: ${RUNS} x (${WARMUP_REQUESTS} warmup + ${MEASURED_REQUESTS} measured) per scenario\n`);

      const failures: string[] = [];
      console.log('scenario'.padEnd(32), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8));

      for (const scenario of scenarios) {
        const runP50: number[] = [];
        const runP95: number[] = [];
        const runP99: number[] = [];

        for (let run = 0; run < RUNS; run += 1) {
          const samples = await measureRun(app, authorization, scenario);
          runP50.push(percentile(samples, 0.5));
          runP95.push(percentile(samples, 0.95));
          runP99.push(percentile(samples, 0.99));
        }

        const p50 = median(runP50);
        const p95 = median(runP95);
        const p99 = median(runP99);
        console.log(
          scenario.name.padEnd(32),
          `${p50.toFixed(1)}ms`.padStart(8),
          `${p95.toFixed(1)}ms`.padStart(8),
          `${p99.toFixed(1)}ms`.padStart(8),
        );

        if (p95 >= P95_BUDGET_MS) {
          failures.push(`${scenario.name}: p95 ${p95.toFixed(1)}ms >= ${P95_BUDGET_MS}ms`);
        }
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
