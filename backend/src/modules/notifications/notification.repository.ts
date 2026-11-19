import { Injectable } from '@nestjs/common';
import { Prisma, type Notification, type NotificationType } from '@prisma/client';
import { DEFAULT_PAGE_SIZE } from '@pulse/shared';
import { isUniqueConstraintViolation } from '../../common/errors/prisma-errors';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  type: NotificationType;
  payload: Prisma.InputJsonValue;
  /** Anti-spam key; the partial unique index dedupes `(orgId, userId, type, dedupeKey)`. */
  dedupeKey?: string | null;
}

export interface NotificationListOptions {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface NotificationPage {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Notification persistence (FR-07.5, FR-08 groundwork). Real-time delivery and the HTTP API belong to 005;
 * this repository only knows the table and always scopes every query to `orgId` + `userId`.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a notification, returning `null` when the dedupe key already exists. The partial unique index
   * does the race-safe deduplication, so two scheduler instances cannot create the same reminder.
   */
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      return await this.prisma.notification.create({
        data: {
          orgId: input.orgId,
          userId: input.userId,
          type: input.type,
          payload: input.payload,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'dedupe_key')) {
        return null;
      }
      throw error;
    }
  }

  /** Newest first, keyset over `(created_at desc, id desc)`. */
  async listForUser(
    orgId: string,
    userId: string,
    options: NotificationListOptions = {},
  ): Promise<NotificationPage> {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = options.cursor ? decodeCursor(options.cursor) : undefined;

    const rows = await this.prisma.notification.findMany({
      where: {
        orgId,
        userId,
        ...(options.unreadOnly ? { readAt: null } : {}),
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
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ id: last.id, createdAt: last.createdAt }) : null;

    return { data: pageRows, nextCursor, hasMore };
  }

  /** Idempotent: an already-read notification keeps its `read_at`. `null` means not visible (404 in 005). */
  async markRead(orgId: string, userId: string, id: string): Promise<Notification | null> {
    const existing = await this.prisma.notification.findFirst({
      where: { orgId, userId, id },
    });
    if (!existing) {
      return null;
    }
    if (existing.readAt) {
      return existing;
    }

    await this.prisma.notification.updateMany({
      where: { orgId, userId, id, readAt: null },
      data: { readAt: new Date() },
    });

    return this.prisma.notification.findFirst({ where: { orgId, userId, id } });
  }

  async markAllRead(orgId: string, userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { orgId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
