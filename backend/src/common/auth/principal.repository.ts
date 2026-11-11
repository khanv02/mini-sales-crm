import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Loads the caller's *current* tenant/role state.
 *
 * This is a session lookup by primary key, not business data, so it is the one
 * place allowed to use `findUnique({ id })`; business repositories always take
 * `orgId` (docs/data-model.md section 1).
 */
@Injectable()
export class PrincipalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, orgId: true, role: true, active: true },
    });

    if (!user) {
      return null;
    }

    return { userId: user.id, orgId: user.orgId, role: user.role, active: user.active };
  }
}
