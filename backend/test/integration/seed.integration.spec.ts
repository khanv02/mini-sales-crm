import { execSync } from 'node:child_process';
import { disconnect, prisma, resetDatabase } from '../factories';
import { REPO_ROOT } from '../support/test-env';

function runSeed(): void {
  execSync('pnpm db:seed', {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'pipe',
    timeout: 120_000,
  });
}

describe('idempotent seed (integration)', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
  });

  it('creates 2 orgs, 8 users and one 5-stage pipeline per org', async () => {
    runSeed();

    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(8);
    expect(await prisma.pipeline.count()).toBe(2);
    expect(await prisma.stage.count()).toBe(10);

    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@acme.test' } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { orgId: '00000000-0000-4000-8000-000000000001' },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    expect(pipeline.name).toBe('Sales Pipeline');
    expect(pipeline.stages.map((stage) => stage.name)).toEqual(['New', 'Qualified', 'Proposal', 'Won', 'Lost']);
    expect(pipeline.stages.filter((stage) => stage.isWon)).toHaveLength(1);
    expect(pipeline.stages.filter((stage) => stage.isLost)).toHaveLength(1);
  });

  it('creates no duplicates when run again', async () => {
    runSeed();

    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(8);
    expect(await prisma.pipeline.count()).toBe(2);
    expect(await prisma.stage.count()).toBe(10);
  });
});
