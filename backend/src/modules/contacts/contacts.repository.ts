import { Injectable } from '@nestjs/common';
import { Prisma, type Contact } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

export type ContactSort = 'createdAt' | '-createdAt' | 'name';

export interface ContactListFilters {
  /** `undefined` means any owner (Manager/Admin), `null` means unassigned only. */
  ownerId?: string | null;
  search?: string;
  source?: string;
  createdFrom?: Date;
  createdTo?: Date;
  sort: ContactSort;
  limit: number;
  cursor?: string;
}

export interface ContactPage {
  rows: Contact[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ContactCreateData {
  orgId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  ownerId?: string | null;
}

export interface ContactUpdateData {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  ownerId?: string | null;
}

interface ContactRow extends Contact {
  sortValue: string;
}

/** Escape LIKE metacharacters so a search term is always a literal substring. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Every method takes `orgId` from the caller's principal (C3); no cross-tenant read. */
@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, filters: ContactListFilters): Promise<ContactPage> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."org_id" = ${orgId}::uuid`,
      Prisma.sql`c."deleted_at" IS NULL`,
    ];

    if (filters.ownerId !== undefined) {
      conditions.push(
        filters.ownerId === null
          ? Prisma.sql`c."owner_id" IS NULL`
          : Prisma.sql`c."owner_id" = ${filters.ownerId}::uuid`,
      );
    }
    if (filters.search) {
      conditions.push(
        Prisma.sql`pulse_contact_search(c."name", c."email", c."company")
          LIKE '%' || pulse_unaccent(lower(${escapeLikePattern(filters.search)})) || '%'`,
      );
    }
    if (filters.source) {
      conditions.push(Prisma.sql`c."source" = ${filters.source}`);
    }
    if (filters.createdFrom) {
      conditions.push(Prisma.sql`c."created_at" >= ${filters.createdFrom}`);
    }
    if (filters.createdTo) {
      conditions.push(Prisma.sql`c."created_at" < ${filters.createdTo}`);
    }

    const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
    let orderBy: Prisma.Sql;
    if (filters.sort === 'name') {
      orderBy = Prisma.sql`lower(c."name") ASC, c."id" ASC`;
      if (cursor) {
        conditions.push(
          Prisma.sql`(lower(c."name"), c."id") > (${cursor.sortValue ?? ''}, ${cursor.id}::uuid)`,
        );
      }
    } else if (filters.sort === 'createdAt') {
      orderBy = Prisma.sql`c."created_at" ASC, c."id" ASC`;
      if (cursor) {
        conditions.push(Prisma.sql`(c."created_at", c."id") > (${cursor.createdAt}, ${cursor.id}::uuid)`);
      }
    } else {
      orderBy = Prisma.sql`c."created_at" DESC, c."id" DESC`;
      if (cursor) {
        conditions.push(Prisma.sql`(c."created_at", c."id") < (${cursor.createdAt}, ${cursor.id}::uuid)`);
      }
    }

    const rows = await this.prisma.$queryRaw<ContactRow[]>(Prisma.sql`
      SELECT
        c."id",
        c."org_id" AS "orgId",
        c."name",
        c."email",
        c."phone",
        c."company",
        c."source",
        c."owner_id" AS "ownerId",
        c."deleted_at" AS "deletedAt",
        c."created_at" AS "createdAt",
        c."updated_at" AS "updatedAt",
        lower(c."name") AS "sortValue"
      FROM "contacts" c
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
            sortValue: filters.sort === 'name' ? last.sortValue : undefined,
          })
        : null;

    return {
      rows: pageRows.map(({ sortValue: _sortValue, ...row }) => row),
      nextCursor,
      hasMore,
    };
  }

  async findById(
    tx: PrismaLike,
    orgId: string,
    id: string,
    ownerScopeId?: string,
  ): Promise<Contact | null> {
    return tx.contact.findFirst({
      where: {
        orgId,
        id,
        deletedAt: null,
        ...(ownerScopeId ? { ownerId: ownerScopeId } : {}),
      },
    });
  }

  async create(tx: PrismaLike, data: ContactCreateData): Promise<Contact> {
    return tx.contact.create({
      data: {
        orgId: data.orgId,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        company: data.company ?? null,
        source: data.source ?? null,
        ownerId: data.ownerId ?? null,
      },
    });
  }

  async update(
    tx: PrismaLike,
    orgId: string,
    id: string,
    data: ContactUpdateData,
    ownerScopeId?: string,
  ): Promise<Contact | null> {
    const result = await tx.contact.updateMany({
      where: {
        orgId,
        id,
        deletedAt: null,
        ...(ownerScopeId ? { ownerId: ownerScopeId } : {}),
      },
      data,
    });
    if (result.count === 0) {
      return null;
    }
    return tx.contact.findFirst({ where: { orgId, id } });
  }

  async softDelete(
    tx: PrismaLike,
    orgId: string,
    id: string,
    ownerScopeId?: string,
  ): Promise<number> {
    const result = await tx.contact.updateMany({
      where: {
        orgId,
        id,
        deletedAt: null,
        ...(ownerScopeId ? { ownerId: ownerScopeId } : {}),
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  /** Case-insensitive duplicate check against live rows only (the partial unique index scope). */
  async emailExists(tx: PrismaLike, orgId: string, email: string, excludeId?: string): Promise<boolean> {
    const exclude = excludeId ? Prisma.sql`AND "id" <> ${excludeId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "contacts"
        WHERE "org_id" = ${orgId}::uuid
          AND "deleted_at" IS NULL
          AND "email" IS NOT NULL
          AND lower("email") = lower(${email})
          ${exclude}
      ) AS "exists"
    `);
    return rows[0]?.exists ?? false;
  }

  async findActiveOwner(tx: PrismaLike, orgId: string, ownerId: string): Promise<{ id: string } | null> {
    return tx.user.findFirst({ where: { orgId, id: ownerId, active: true }, select: { id: true } });
  }
}
