import { randomUUID } from 'node:crypto';
import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient, type Organization, type User, UserRole } from '@prisma/client';
import Redis from 'ioredis';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { loadEnv } from '../../src/common/config/env';

export const prisma = new PrismaClient();

export const TEST_PASSWORD = 'Password123!';

let cachedPasswordHash: string | undefined;

async function getPasswordHash(): Promise<string> {
  if (!cachedPasswordHash) {
    cachedPasswordHash = await hash(TEST_PASSWORD, { algorithm: Algorithm.Argon2id });
  }
  return cachedPasswordHash;
}

export async function createOrg(
  input: Partial<Pick<Organization, 'name' | 'currency' | 'timezone' | 'plan'>> = {},
): Promise<Organization> {
  return prisma.organization.create({
    data: {
      name: input.name ?? `Org ${randomUUID().slice(0, 8)}`,
      currency: input.currency ?? 'VND',
      timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
      plan: input.plan ?? 'free',
    },
  });
}

export async function createUser(input: {
  orgId: string;
  email?: string;
  name?: string;
  role?: UserRole;
  active?: boolean;
}): Promise<User> {
  return prisma.user.create({
    data: {
      orgId: input.orgId,
      email: input.email ?? `user-${randomUUID().slice(0, 8)}@example.test`,
      passwordHash: await getPasswordHash(),
      name: input.name ?? 'Test User',
      role: input.role ?? UserRole.SALES,
      active: input.active ?? true,
    },
  });
}

export function loginAs(user: Pick<User, 'id' | 'orgId' | 'role' | 'active'>): {
  accessToken: string;
  authorization: string;
} {
  const env = loadEnv();
  const accessToken = jwt.sign(
    { sub: user.id, orgId: user.orgId, role: user.role, active: user.active, jti: randomUUID() },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] },
  );
  return { accessToken, authorization: `Bearer ${accessToken}` };
}

let rateLimitClient: Redis | undefined;

/** Shared Redis client for tests that must inspect or clear rate-limit state. */
export function redisClient(): Redis {
  rateLimitClient ??= new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 1 });
  return rateLimitClient;
}

/** Clears login lockout counters so tests do not leak state into each other. */
export async function resetRateLimits(): Promise<void> {
  const client = redisClient();
  const keys = await client.keys('auth:login:fail:*');
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

/** Remove all business/auth rows between tests. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, refresh_tokens, users, organizations RESTART IDENTITY CASCADE',
  );
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
  if (rateLimitClient) {
    rateLimitClient.disconnect();
    rateLimitClient = undefined;
  }
}
