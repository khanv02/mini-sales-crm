import type { Deal, DealStatus } from '@prisma/client';
import { prisma } from './prisma';

export async function createDeal(input: {
  orgId: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  title?: string;
  value?: number;
  currency?: string;
  expectedClose?: Date | null;
  status?: DealStatus;
  lostReason?: string | null;
  position?: number;
  version?: number;
  closedAt?: Date | null;
  createdAt?: Date;
}): Promise<Deal> {
  return prisma.deal.create({
    data: {
      orgId: input.orgId,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      ownerId: input.ownerId,
      title: input.title ?? 'Test Deal',
      value: input.value ?? 0,
      currency: input.currency ?? 'VND',
      expectedClose: input.expectedClose ?? null,
      status: input.status ?? 'OPEN',
      lostReason: input.lostReason ?? null,
      position: input.position ?? 1,
      version: input.version ?? 1,
      closedAt: input.closedAt ?? null,
      createdAt: input.createdAt,
    },
  });
}
