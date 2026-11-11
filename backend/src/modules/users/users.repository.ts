import { Injectable } from '@nestjs/common';
import { Prisma, type User, type UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

export interface UserListFilters {
  role?: UserRole;
  active?: boolean;
  limit: number;
  cursor?: string;
}

export interface UserPage {
  rows: User[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface UserCreateData {
  orgId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}

export interface UserUpdateData {
  name?: string;
  role?: UserRole;
  active?: boolean;
}

/** Every method takes `orgId` from the caller's principal (C3); no cross-tenant read. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, filters: UserListFilters): Promise<UserPage> {
    const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;

    const where: Prisma.UserWhereInput = {
      orgId,
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = page.at(-1);

    return {
      rows: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ id: last.id, createdAt: last.createdAt }) : null,
    };
  }

  findByOrgAndId(orgId: string, id: string, client?: PrismaLike): Promise<User | null> {
    return (client ?? this.prisma).user.findFirst({ where: { orgId, id } });
  }

  create(client: PrismaLike, data: UserCreateData): Promise<User> {
    return client.user.create({ data });
  }

  update(client: PrismaLike, orgId: string, id: string, data: UserUpdateData): Promise<User> {
    return client.user.update({ where: { orgId_id: { orgId, id } }, data });
  }

  /**
   * Locks the org's active admins so two concurrent demotions cannot both pass
   * the last-admin check. Parameterised and org-filtered (docs/data-model.md 1.5).
   */
  async lockActiveAdmins(tx: Prisma.TransactionClient, orgId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE org_id = ${orgId}::uuid AND role::text = 'ADMIN' AND active = true
      FOR UPDATE
    `;
    return rows.length;
  }
}
