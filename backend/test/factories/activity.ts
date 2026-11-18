import { randomUUID } from 'node:crypto';
import type { Activity, ActivityType } from '@prisma/client';
import { prisma } from './prisma';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Timeline row. Tasks are activities of type `TASK` (ADR-010), so `createActivity` stays generic and
 * `createTask` adds the two required fields enforced by the `0003_workflow` check constraint.
 */
export async function createActivity(input: {
  orgId: string;
  dealId: string;
  createdBy: string;
  type?: ActivityType;
  content?: string;
  dueAt?: Date | null;
  doneAt?: Date | null;
  assigneeId?: string | null;
  createdAt?: Date;
}): Promise<Activity> {
  return prisma.activity.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      createdBy: input.createdBy,
      type: input.type ?? 'NOTE',
      content: input.content ?? `Activity ${randomUUID().slice(0, 8)}`,
      dueAt: input.dueAt ?? null,
      doneAt: input.doneAt ?? null,
      assigneeId: input.assigneeId ?? null,
      createdAt: input.createdAt,
    },
  });
}

/** Task factory: same table, with a deadline and an assignee (defaults to the author and +1h). */
export async function createTask(input: {
  orgId: string;
  dealId: string;
  createdBy: string;
  assigneeId?: string;
  content?: string;
  dueAt?: Date;
  doneAt?: Date | null;
  createdAt?: Date;
}): Promise<Activity> {
  return createActivity({
    ...input,
    type: 'TASK',
    dueAt: input.dueAt ?? new Date(Date.now() + HOUR_MS),
    assigneeId: input.assigneeId ?? input.createdBy,
  });
}
