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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

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

  const orgCount = await prisma.organization.count();
  const userCount = await prisma.user.count();
  console.log(`Seed complete: ${orgCount} organizations, ${userCount} users.`);

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
