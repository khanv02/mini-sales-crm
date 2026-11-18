import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient, UserRole } from '@prisma/client';
import { loadEnvFile } from '../src/common/config/env';

loadEnvFile();

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';

const orgs = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Acme',
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Globex',
    currency: 'USD',
    timezone: 'Asia/Ho_Chi_Minh',
  },
] as const;

const users = [
  { id: '00000000-0000-4000-8000-000000000101', orgIndex: 0, label: 'Admin', role: UserRole.ADMIN },
  { id: '00000000-0000-4000-8000-000000000102', orgIndex: 0, label: 'Manager', role: UserRole.MANAGER },
  { id: '00000000-0000-4000-8000-000000000103', orgIndex: 0, label: 'Sales One', role: UserRole.SALES },
  { id: '00000000-0000-4000-8000-000000000104', orgIndex: 0, label: 'Sales Two', role: UserRole.SALES },
  { id: '00000000-0000-4000-8000-000000000201', orgIndex: 1, label: 'Admin', role: UserRole.ADMIN },
  { id: '00000000-0000-4000-8000-000000000202', orgIndex: 1, label: 'Manager', role: UserRole.MANAGER },
  { id: '00000000-0000-4000-8000-000000000203', orgIndex: 1, label: 'Sales One', role: UserRole.SALES },
  { id: '00000000-0000-4000-8000-000000000204', orgIndex: 1, label: 'Sales Two', role: UserRole.SALES },
] as const;

/** Default pipeline per org so the kanban can be demoed before the admin UI exists. */
const pipelines = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    orgIndex: 0,
    name: 'Sales Pipeline',
    stages: [
      { id: '00000000-0000-4000-8000-000000000311', name: 'New', position: 1, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000312', name: 'Qualified', position: 2, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000313', name: 'Proposal', position: 3, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000314', name: 'Won', position: 4, isWon: true, isLost: false },
      { id: '00000000-0000-4000-8000-000000000315', name: 'Lost', position: 5, isWon: false, isLost: true },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    orgIndex: 1,
    name: 'Sales Pipeline',
    stages: [
      { id: '00000000-0000-4000-8000-000000000321', name: 'New', position: 1, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000322', name: 'Qualified', position: 2, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000323', name: 'Proposal', position: 3, isWon: false, isLost: false },
      { id: '00000000-0000-4000-8000-000000000324', name: 'Won', position: 4, isWon: true, isLost: false },
      { id: '00000000-0000-4000-8000-000000000325', name: 'Lost', position: 5, isWon: false, isLost: true },
    ],
  },
] as const;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Demo contact and deals (one OPEN, one WON, one LOST) per org so the kanban and
 * the feature 004 dashboard can be demoed right after `pnpm db:seed`.
 */
interface DemoDeal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  position: number;
  status: 'OPEN' | 'WON' | 'LOST';
  lostReason: string | null;
  closedAt: string | null;
  createdAt: string;
}

const demos: Array<{
  orgIndex: number;
  contact: { id: string; ownerId: string; name: string; email: string };
  pipelineId: string;
  currency: string;
  deals: DemoDeal[];
}> = [
  {
    orgIndex: 0,
    contact: {
      id: '00000000-0000-4000-8000-000000000401',
      ownerId: '00000000-0000-4000-8000-000000000103',
      name: 'Acme Demo Contact',
      email: 'demo@acme.test',
    },
    pipelineId: '00000000-0000-4000-8000-000000000301',
    currency: 'VND',
    deals: [
      {
        id: '00000000-0000-4000-8000-000000000501',
        title: 'Acme pilot',
        value: 120_000_000,
        stageId: '00000000-0000-4000-8000-000000000311',
        position: 1,
        status: 'OPEN',
        lostReason: null,
        closedAt: null,
        createdAt: '2026-10-05T03:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000511',
        title: 'Acme annual plan',
        value: 480_000_000,
        stageId: '00000000-0000-4000-8000-000000000314',
        position: 1,
        status: 'WON',
        lostReason: null,
        closedAt: '2026-10-20T09:00:00.000Z',
        createdAt: '2026-09-15T03:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000521',
        title: 'Acme add-on',
        value: 60_000_000,
        stageId: '00000000-0000-4000-8000-000000000315',
        position: 1,
        status: 'LOST',
        lostReason: 'Budget cut',
        closedAt: '2026-10-10T09:00:00.000Z',
        createdAt: '2026-09-20T03:00:00.000Z',
      },
    ],
  },
  {
    orgIndex: 1,
    contact: {
      id: '00000000-0000-4000-8000-000000000402',
      ownerId: '00000000-0000-4000-8000-000000000203',
      name: 'Globex Demo Contact',
      email: 'demo@globex.test',
    },
    pipelineId: '00000000-0000-4000-8000-000000000302',
    currency: 'USD',
    deals: [
      {
        id: '00000000-0000-4000-8000-000000000502',
        title: 'Globex pilot',
        value: 5_000,
        stageId: '00000000-0000-4000-8000-000000000321',
        position: 1,
        status: 'OPEN',
        lostReason: null,
        closedAt: null,
        createdAt: '2026-10-06T03:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000512',
        title: 'Globex annual plan',
        value: 24_000,
        stageId: '00000000-0000-4000-8000-000000000324',
        position: 1,
        status: 'WON',
        lostReason: null,
        closedAt: '2026-10-21T09:00:00.000Z',
        createdAt: '2026-09-16T03:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000522',
        title: 'Globex add-on',
        value: 1_500,
        stageId: '00000000-0000-4000-8000-000000000325',
        position: 1,
        status: 'LOST',
        lostReason: 'Competitor won',
        closedAt: '2026-10-11T09:00:00.000Z',
        createdAt: '2026-09-21T03:00:00.000Z',
      },
    ],
  },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.log('Seed skipped: NODE_ENV=production requires ALLOW_SEED=true.');
    return;
  }

  const passwordHash = await hash(SEED_PASSWORD, { algorithm: Algorithm.Argon2id });

  for (const org of orgs) {
    await prisma.organization.upsert({
      where: { id: org.id },
      update: { name: org.name, currency: org.currency, timezone: org.timezone },
      create: org,
    });
  }

  for (const user of users) {
    const org = orgs[user.orgIndex];
    if (!org) {
      throw new Error(`Seed configuration error: unknown org index ${user.orgIndex}`);
    }

    const email = `${slug(user.label)}@${slug(org.name)}.test`;
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        orgId: org.id,
        email,
        name: `${user.label} ${org.name}`,
        role: user.role,
        active: true,
      },
      create: {
        id: user.id,
        orgId: org.id,
        email,
        passwordHash,
        name: `${user.label} ${org.name}`,
        role: user.role,
        active: true,
      },
    });
  }

  for (const pipeline of pipelines) {
    const org = orgs[pipeline.orgIndex];
    if (!org) {
      throw new Error(`Seed configuration error: unknown org index ${pipeline.orgIndex}`);
    }

    await prisma.pipeline.upsert({
      where: { id: pipeline.id },
      update: { orgId: org.id, name: pipeline.name },
      create: { id: pipeline.id, orgId: org.id, name: pipeline.name },
    });

    for (const stage of pipeline.stages) {
      const data = {
        orgId: org.id,
        pipelineId: pipeline.id,
        name: stage.name,
        position: stage.position,
        isWon: stage.isWon,
        isLost: stage.isLost,
      };
      await prisma.stage.upsert({
        where: { id: stage.id },
        update: data,
        create: { id: stage.id, ...data },
      });
    }
  }

  for (const demo of demos) {
    const org = orgs[demo.orgIndex];
    if (!org) {
      throw new Error(`Seed configuration error: unknown org index ${demo.orgIndex}`);
    }

    const contact = {
      orgId: org.id,
      name: demo.contact.name,
      email: demo.contact.email,
      ownerId: demo.contact.ownerId,
    };
    await prisma.contact.upsert({
      where: { id: demo.contact.id },
      update: { ...contact, deletedAt: null },
      create: { id: demo.contact.id, ...contact },
    });

    for (const deal of demo.deals) {
      const data = {
        orgId: org.id,
        contactId: demo.contact.id,
        pipelineId: demo.pipelineId,
        stageId: deal.stageId,
        title: deal.title,
        value: deal.value,
        currency: demo.currency,
        ownerId: demo.contact.ownerId,
        expectedClose: null,
        status: deal.status,
        lostReason: deal.lostReason,
        position: deal.position,
        version: 1,
        closedAt: deal.closedAt ? new Date(deal.closedAt) : null,
        createdAt: new Date(deal.createdAt),
      };
      await prisma.deal.upsert({
        where: { id: deal.id },
        update: data,
        create: { id: deal.id, ...data },
      });
    }
  }

  const orgCount = await prisma.organization.count();
  const userCount = await prisma.user.count();
  const pipelineCount = await prisma.pipeline.count();
  const stageCount = await prisma.stage.count();
  const contactCount = await prisma.contact.count();
  const dealCount = await prisma.deal.count();
  console.log(
    `Seed complete: ${orgCount} organizations, ${userCount} users, ${pipelineCount} pipelines, ${stageCount} stages, ${contactCount} contacts, ${dealCount} deals.`,
  );

  if (process.env.SEED_PERF === 'true') {
    console.log('SEED_PERF ignored at M0: the perf dataset arrives with feature 003 (contacts/deals).');
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
