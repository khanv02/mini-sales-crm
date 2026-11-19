import { Injectable } from '@nestjs/common';
import { Prisma, type Activity } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

/** `open` = not done and not yet due; `overdue` = not done and past due; `done` = has `done_at`. */
export type TaskStatusFilter = 'open' | 'overdue' | 'done';

export interface TaskListFilters {
  status?: TaskStatusFilter;
  assigneeId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  limit: number;
  cursor?: string;
}

export interface TaskPage {
  rows: Activity[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Tasks are activities with `type='TASK'` (ADR-010), so this repository reads the `activities` table and
 * never writes anything but the task fields. Every method takes `orgId` from the principal (C3).
 */
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keyset over `(due_at, id)`. A task always has a deadline (the `0003_workflow` check enforces it), so
   * `due_at` is never null here and can carry the cursor.
   */
  async list(orgId: string, filters: TaskListFilters): Promise<TaskPage> {
    const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
    const now = new Date();

    const statusWhere: Prisma.ActivityWhereInput =
      filters.status === 'done'
        ? { doneAt: { not: null } }
        : filters.status === 'overdue'
          ? { doneAt: null, dueAt: { lt: now } }
          : filters.status === 'open'
            ? { doneAt: null, dueAt: { gte: now } }
            : {};

    const rows = await this.prisma.activity.findMany({
      where: {
        orgId,
        type: 'TASK',
        ...statusWhere,
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.dueFrom || filters.dueTo
          ? {
              dueAt: {
                ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
                ...(filters.dueTo ? { lt: filters.dueTo } : {}),
                ...(filters.status === 'overdue' ? { lt: now } : {}),
                ...(filters.status === 'open' ? { gte: now } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { dueAt: { gt: cursor.createdAt } },
                { dueAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last && last.dueAt
        ? encodeCursor({ id: last.id, createdAt: last.dueAt })
        : null;

    return { rows: pageRows, nextCursor, hasMore };
  }

  /** A task is only visible through its own id; the caller maps `null` to 404. */
  async findById(tx: PrismaLike, orgId: string, id: string): Promise<Activity | null> {
    return tx.activity.findFirst({ where: { orgId, id, type: 'TASK' } });
  }

  async update(
    tx: PrismaLike,
    orgId: string,
    id: string,
    data: Prisma.ActivityUncheckedUpdateManyInput,
  ): Promise<number> {
    const result = await tx.activity.updateMany({ where: { orgId, id, type: 'TASK' }, data });
    return result.count;
  }

  /** Deal lookup with the Sales owner scope; `null` means invisible (404). */
  async findDeal(
    tx: PrismaLike,
    orgId: string,
    dealId: string,
    ownerScopeId?: string,
  ): Promise<{ id: string } | null> {
    return tx.deal.findFirst({
      where: { orgId, id: dealId, ...(ownerScopeId ? { ownerId: ownerScopeId } : {}) },
      select: { id: true },
    });
  }

  async findActiveUser(tx: PrismaLike, orgId: string, userId: string): Promise<{ id: string } | null> {
    return tx.user.findFirst({ where: { orgId, id: userId, active: true }, select: { id: true } });
  }
}
