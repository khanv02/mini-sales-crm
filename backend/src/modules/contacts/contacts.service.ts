import { Injectable } from '@nestjs/common';
import type {
  ContactCreateRequest,
  ContactListQuery,
  ContactListResponse,
  ContactUpdateRequest,
} from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { isUniqueConstraintViolation } from '../../common/errors/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { contactAuditSnapshot, contactFieldSnapshot, toContact } from './contact.mapper';
import {
  ContactsRepository,
  type ContactUpdateData,
} from './contacts.repository';

export interface ContactMutationMeta {
  ip?: string;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextUtcDay(value: Date): Date {
  return new Date(value.getTime() + DAY_MS);
}

function contactNotFound(): AppError {
  return new AppError(ERROR_CODES.CONTACT_NOT_FOUND, 404, 'Contact not found.');
}

function emailExists(): AppError {
  return new AppError(ERROR_CODES.CONTACT_EMAIL_EXISTS, 409, 'A contact with this email already exists.');
}

/** Contact CRUD/search (FR-03). Visibility is scoped here; the repository always filters by org. */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, query: ContactListQuery): Promise<ContactListResponse> {
    const search = query.search?.trim();
    const range = this.resolveRange(query.createdFrom, query.createdTo);
    const ownerId = actor.role === 'SALES' ? actor.userId : query.ownerId;

    const page = await this.contacts.list(actor.orgId, {
      ownerId,
      search: search && search.length > 0 ? search : undefined,
      source: query.source,
      createdFrom: range?.from,
      createdTo: range?.to,
      sort: query.sort,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: page.rows.map(toContact),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async get(actor: AuthenticatedUser, id: string) {
    const contact = await this.contacts.findById(this.prisma, actor.orgId, id, this.ownerScope(actor));
    if (!contact) {
      throw contactNotFound();
    }
    return toContact(contact);
  }

  async create(actor: AuthenticatedUser, body: ContactCreateRequest, meta: ContactMutationMeta = {}) {
    const ownerId = await this.resolveOwnerId(actor, body.ownerId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const contact = await this.contacts.create(tx, {
          orgId: actor.orgId,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          company: body.company ?? null,
          source: body.source ?? null,
          ownerId,
        });

        await this.audit.recordContact(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: contact.id,
          action: 'CONTACT_CREATED',
          after: contactAuditSnapshot(contact),
          ip: meta.ip,
        });

        return toContact(contact);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw emailExists();
      }
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    body: ContactUpdateRequest,
    meta: ContactMutationMeta = {},
  ) {
    const changes: ContactUpdateData = {};
    if (body.name !== undefined) changes.name = body.name;
    if (body.email !== undefined) changes.email = body.email;
    if (body.phone !== undefined) changes.phone = body.phone;
    if (body.company !== undefined) changes.company = body.company;
    if (body.source !== undefined) changes.source = body.source;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.contacts.findById(tx, actor.orgId, id, this.ownerScope(actor));
        if (!existing) {
          throw contactNotFound();
        }
        if (changes.email !== undefined && changes.email !== null) {
          if (await this.contacts.emailExists(tx, actor.orgId, changes.email, id)) {
            throw emailExists();
          }
        }

        const fields = Object.keys(changes);
        const before = contactFieldSnapshot(existing, fields);
        const after: Record<string, unknown> = {};
        for (const field of fields) {
          after[field] = changes[field as keyof ContactUpdateData] ?? null;
        }

        const updated = await this.contacts.update(tx, actor.orgId, id, changes, this.ownerScope(actor));
        if (!updated) {
          throw contactNotFound();
        }

        await this.audit.recordContact(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: updated.id,
          action: 'CONTACT_UPDATED',
          before,
          after,
          ip: meta.ip,
        });

        return toContact(updated);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw emailExists();
      }
      throw error;
    }
  }

  async remove(actor: AuthenticatedUser, id: string, meta: ContactMutationMeta = {}): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.contacts.findById(tx, actor.orgId, id, this.ownerScope(actor));
      if (!existing) {
        throw contactNotFound();
      }

      await this.contacts.softDelete(tx, actor.orgId, id, this.ownerScope(actor));
      await this.audit.recordContact(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: existing.id,
        action: 'CONTACT_DELETED',
        before: contactAuditSnapshot(existing),
        ip: meta.ip,
      });
    });
  }

  /** Sales are always restricted to their own rows; Manager/Admin see the whole org. */
  private ownerScope(actor: AuthenticatedUser): string | undefined {
    return actor.role === 'SALES' ? actor.userId : undefined;
  }

  /**
   * `ownerId` follows the permissions matrix: Sales may only be the owner (403 otherwise), while
   * Manager/Admin may assign an active member of their org (`400 INVALID_OWNER` otherwise).
   */
  private async resolveOwnerId(actor: AuthenticatedUser, requested?: string): Promise<string> {
    if (actor.role === 'SALES') {
      if (requested && requested !== actor.userId) {
        throw new AppError(ERROR_CODES.FORBIDDEN, 403, 'Sales cannot assign a contact to another user.');
      }
      return actor.userId;
    }

    if (!requested) {
      return actor.userId;
    }

    const owner = await this.contacts.findActiveOwner(this.prisma, actor.orgId, requested);
    if (!owner) {
      throw new AppError(
        ERROR_CODES.INVALID_OWNER,
        400,
        'The owner must be an active member of your organization.',
      );
    }
    return requested;
  }

  /** Date-only filters are inclusive; `createdTo` becomes an exclusive next-day boundary. */
  private resolveRange(
    createdFrom?: string,
    createdTo?: string,
  ): { from?: Date; to?: Date } | undefined {
    const from = createdFrom ? startOfUtcDay(createdFrom) : undefined;
    const to = createdTo ? nextUtcDay(startOfUtcDay(createdTo)) : undefined;

    if (from && to) {
      if (from >= to || to.getTime() - from.getTime() > 367 * DAY_MS) {
        throw new AppError(
          ERROR_CODES.INVALID_DATE_RANGE,
          400,
          'createdFrom must be before createdTo and the range cannot exceed 366 days.',
        );
      }
    }

    if (!from && !to) {
      return undefined;
    }
    return { from, to };
  }
}
