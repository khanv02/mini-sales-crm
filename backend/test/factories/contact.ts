import { randomUUID } from 'node:crypto';
import type { Contact } from '@prisma/client';
import { prisma } from './prisma';

export async function createContact(input: {
  orgId: string;
  ownerId?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  deletedAt?: Date | null;
  createdAt?: Date;
}): Promise<Contact> {
  return prisma.contact.create({
    data: {
      orgId: input.orgId,
      name: input.name ?? `Contact ${randomUUID().slice(0, 8)}`,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      source: input.source ?? null,
      ownerId: input.ownerId ?? null,
      deletedAt: input.deletedAt ?? null,
      createdAt: input.createdAt,
    },
  });
}
