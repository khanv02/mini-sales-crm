import { Injectable } from '@nestjs/common';
import { Prisma, type Deal, type DealStatus, type Stage } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

export type DealSort = 'createdAt' | '-createdAt' | 'name' | 'value';

export interface DealListFilters {
  /** `undefined` means any owner (Manager/Admin); Sales are scoped upstream. */
  ownerId?: string;
  pipelineId?: string;
  stageId?: string;
  status?: DealStatus;
  sort: DealSort;
  limit: number;
  cursor?: string;
}

export interface DealPage {
  rows: Deal[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DealCreateData {
  orgId: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  currency: string;
  ownerId: string;
  expectedClose: Date | null;
  status: DealStatus;
  lostReason: string | null;
  position: number;
  closedAt: Date | null;
}

export interface DealContact {
  id: string;
  ownerId: string | null;
  deletedAt: Date | null;
}

export interface StageCard {
  id: string;
  position: number;
}

interface DealRow extends Deal {
  stagePosition: Prisma.Decimal;
  sortValue: string;
}

const boardSortValueSeparator = ':';

function boardCursorValue(stagePosition: string, position: string): string {
  return `${stagePosition}${boardSortValueSeparator}${position}`;
}

function parseBoardCursor(value: string | undefined): { stagePosition: string; position: string } {
  const [stagePosition, position] = value?.split(boardSortValueSeparator) ?? [];
  if (!stagePosition || !position || Number.isNaN(Number(stagePosition)) || Number.isNaN(Number(position))) {
    throw new AppError(ERROR_CODES.INVALID_CURSOR, 400, 'The cursor is not valid.');
  }
  return { stagePosition, position };
}

/**
 * Every method takes `orgId` from the caller's principal (C3).
 *
 * The board (`?pipelineId=...`) is ordered by stage then fractional position (FR-05.2) and
 * paginates with a `(stage position, deal position, id)` keyset; the flat list supports the
 * documented `createdAt|name|value` sorts.
 */
@Injectable()
export class DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, filters: DealListFilters): Promise<DealPage> {
    const conditions: Prisma.Sql[] = [Prisma.sql`d."org_id" = ${orgId}::uuid`];

    if (filters.ownerId) {
      conditions.push(Prisma.sql`d."owner_id" = ${filters.ownerId}::uuid`);
    }
    if (filters.pipelineId) {
      conditions.push(Prisma.sql`d."pipeline_id" = ${filters.pipelineId}::uuid`);
    }
    if (filters.stageId) {
      conditions.push(Prisma.sql`d."stage_id" = ${filters.stageId}::uuid`);
    }
    if (filters.status) {
      conditions.push(Prisma.sql`d."status" = ${filters.status}::"DealStatus"`);
    }

    const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
    const board = Boolean(filters.pipelineId);
    let orderBy: Prisma.Sql;

    if (board) {
      orderBy = Prisma.sql`s."position" ASC, d."position" ASC, d."id" ASC`;
      if (cursor) {
        const { stagePosition, position } = parseBoardCursor(cursor.sortValue);
        conditions.push(
          Prisma.sql`(s."position", d."position", d."id") > (${stagePosition}::numeric, ${position}::numeric, ${cursor.id}::uuid)`,
        );
      }
    } else if (filters.sort === 'createdAt') {
      orderBy = Prisma.sql`d."created_at" ASC, d."id" ASC`;
      if (cursor) {
        conditions.push(
          Prisma.sql`(d."created_at", d."id") > (${cursor.createdAt}, ${cursor.id}::uuid)`,
        );
      }
    } else if (filters.sort === 'name') {
      orderBy = Prisma.sql`lower(d."title") ASC, d."id" ASC`;
      if (cursor) {
        conditions.push(
          Prisma.sql`(lower(d."title"), d."id") > (${cursor.sortValue ?? ''}, ${cursor.id}::uuid)`,
        );
      }
    } else if (filters.sort === 'value') {
      orderBy = Prisma.sql`d."value" ASC, d."id" ASC`;
      if (cursor) {
        conditions.push(
          Prisma.sql`(d."value", d."id") > (${cursor.sortValue ?? '0'}::numeric, ${cursor.id}::uuid)`,
        );
      }
    } else {
      orderBy = Prisma.sql`d."created_at" DESC, d."id" DESC`;
      if (cursor) {
        conditions.push(
          Prisma.sql`(d."created_at", d."id") < (${cursor.createdAt}, ${cursor.id}::uuid)`,
        );
      }
    }

    const rows = await this.prisma.$queryRaw<DealRow[]>(Prisma.sql`
      SELECT
        d."id",
        d."org_id" AS "orgId",
        d."contact_id" AS "contactId",
        d."pipeline_id" AS "pipelineId",
        d."stage_id" AS "stageId",
        d."title",
        d."value",
        d."currency",
        d."owner_id" AS "ownerId",
        d."expected_close" AS "expectedClose",
        d."status",
        d."lost_reason" AS "lostReason",
        d."position",
        d."version",
        d."closed_at" AS "closedAt",
        d."created_at" AS "createdAt",
        d."updated_at" AS "updatedAt",
        s."position" AS "stagePosition",
        lower(d."title") AS "sortValue"
      FROM "deals" d
      JOIN "stages" s ON s."org_id" = d."org_id" AND s."id" = d."stage_id"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${filters.limit + 1}
    `);

    const hasMore = rows.length > filters.limit;
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            id: last.id,
            createdAt: last.createdAt,
            sortValue: board
              ? boardCursorValue(last.stagePosition.toString(), last.position.toString())
              : filters.sort === 'name'
                ? last.sortValue
                : filters.sort === 'value'
                  ? last.value.toString()
                  : undefined,
          })
        : null;

    return {
      rows: pageRows.map(({ stagePosition: _stagePosition, sortValue: _sortValue, ...row }) => row),
      nextCursor,
      hasMore,
    };
  }

  async findById(tx: PrismaLike, orgId: string, id: string, ownerScopeId?: string): Promise<Deal | null> {
    return tx.deal.findFirst({
      where: { orgId, id, ...(ownerScopeId ? { ownerId: ownerScopeId } : {}) },
    });
  }

  async findContact(tx: PrismaLike, orgId: string, contactId: string): Promise<DealContact | null> {
    return tx.contact.findFirst({
      where: { orgId, id: contactId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
  }

  async findPipeline(tx: PrismaLike, orgId: string, pipelineId: string): Promise<{ id: string } | null> {
    return tx.pipeline.findFirst({ where: { orgId, id: pipelineId }, select: { id: true } });
  }

  async findStage(tx: PrismaLike, orgId: string, stageId: string): Promise<Stage | null> {
    return tx.stage.findFirst({ where: { orgId, id: stageId } });
  }

  async findActiveOwner(tx: PrismaLike, orgId: string, ownerId: string): Promise<{ id: string } | null> {
    return tx.user.findFirst({ where: { orgId, id: ownerId, active: true }, select: { id: true } });
  }

  async findOrgCurrency(tx: PrismaLike, orgId: string): Promise<string> {
    const organization = await tx.organization.findFirstOrThrow({
      where: { id: orgId },
      select: { currency: true },
    });
    return organization.currency;
  }

  /** Cards of a stage in board order, excluding the deal being moved. */
  async listStageCards(
    tx: PrismaLike,
    orgId: string,
    stageId: string,
    excludeId?: string,
  ): Promise<StageCard[]> {
    const cards = await tx.deal.findMany({
      where: { orgId, stageId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, position: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return cards.map((card) => ({ id: card.id, position: Number(card.position) }));
  }

  async create(tx: PrismaLike, data: DealCreateData): Promise<Deal> {
    return tx.deal.create({ data });
  }

  /** Optimistic lock (ADR-005): 0 rows means the version changed or the row is not visible. */
  async updateVersioned(
    tx: PrismaLike,
    orgId: string,
    id: string,
    version: number,
    data: Prisma.DealUncheckedUpdateManyInput,
    ownerScopeId?: string,
  ): Promise<number> {
    const result = await tx.deal.updateMany({
      where: { orgId, id, version, ...(ownerScopeId ? { ownerId: ownerScopeId } : {}) },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count;
  }

  async updatePosition(tx: PrismaLike, orgId: string, id: string, position: number): Promise<void> {
    await tx.deal.updateMany({ where: { orgId, id }, data: { position } });
  }
}
