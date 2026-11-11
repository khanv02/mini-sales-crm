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

  it('creates 2 orgs and 8 users with Argon2id password hashes', async () => {
    runSeed();

    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(8);

    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@acme.test' } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('creates no duplicates when run again', async () => {
    runSeed();

    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(8);
  });
});
