import { PrismaClient } from '@prisma/client';

/** Shared Prisma client for integration tests and factories. */
export const prisma = new PrismaClient();
