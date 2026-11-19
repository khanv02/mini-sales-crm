import { Injectable } from '@nestjs/common';
import { Prisma, type Activity, type ActivityType } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

export interface ActivityListFilters {
  type?: ActivityType;
  limit: number;
  cursor?: string;
}

export interface ActivityPage {
  rows: Activity[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ActivityCreateData {
  orgId: string;
  dealId: string;
  type: ActivityType;
  content: string;
  dueAt: Date | null;
  assigneeId: string | null;
  createdBy: string;
}

export interface VisibleDeal {
  id: string;
  ownerId: string;
}

/**
 * Every method takes `orgId` from the caller's principal (C3).
 *
 * `activities` is the single table for notes, calls, emails and tasks (ADR-010); the timeline is ordered by
 * `created_at desc, id desc` and paginated with a `(createdAt, id)` keyset (FR-07.3).
 */
@Injectable()
export class ActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Deal lookup that also applies the Sales owner scope; `null` means invisible (404). */
  async findDeal(
    tx: PrismaLike,
    orgId: string,
    dealId: string,
    ownerScopeId?: string,
  ): Promise<VisibleDeal | null> {
    return tx.deal.findFirst({
      where: { orgId, id: dealId, ...(ownerScopeId ? { ownerId: ownerScopeId } : {}) },
      select: { id: true, ownerId: true },
    });
  }

  async findActiveUser(tx: PrismaLike, orgId: string, userId: string): Promise<{ id: string } | null> {
    return tx.user.findFirst({ where: { orgId, id: userId, active: true }, select: { id: true } });
  }

  async list(orgId: string, dealId: string, filters: ActivityListFilters): Promise<ActivityPage> {
    const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;

    const rows = await this.prisma.activity.findMany({
      where: {
        orgId,
        dealId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ id: last.id, createdAt: last.createdAt }) : null;

    return { rows: pageRows, nextCursor, hasMore };
  }

  async findById(tx: PrismaLike, orgId: string, id: string): Promise<Activity | null> {
    return tx.activity.findFirst({ where: { orgId, id } });
  }

  async create(tx: PrismaLike, data: ActivityCreateData): Promise<Activity> {
    return tx.activity.create({ data });
  }

  /** 0 rows means the activity vanished (or belongs to another org); the caller maps it to 404. */
  async update(
    tx: PrismaLike,
    orgId: string,
    id: string,
    data: Prisma.ActivityUncheckedUpdateManyInput,
  ): Promise<number> {
    const result = await tx.activity.updateMany({ where: { orgId, id }, data });
    return result.count;
  }
}
