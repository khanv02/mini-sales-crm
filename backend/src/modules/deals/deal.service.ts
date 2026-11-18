import { Injectable } from '@nestjs/common';
import type { Deal as DealModel, Prisma, Stage } from '@prisma/client';
import type {
  Deal as DealResponse,
  DealAssignRequest,
  DealCreateRequest,
  DealListQuery,
  DealListResponse,
  DealMoveRequest,
  DealUpdateRequest,
} from '@pulse/shared';
import { AuditService, type DealAuditAction } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dealAuditSnapshot, toDeal } from './deal.mapper';
import { DealsRepository, type DealSort } from './deal.repository';
import { computePosition } from './position.service';

export interface DealMutationMeta {
  ip?: string;
}

function dealNotFound(): AppError {
  return new AppError(ERROR_CODES.DEAL_NOT_FOUND, 404, 'Deal not found.');
}

function pipelineNotFound(): AppError {
  return new AppError(ERROR_CODES.PIPELINE_NOT_FOUND, 404, 'Pipeline not found.');
}

function stageNotFound(): AppError {
  return new AppError(ERROR_CODES.STAGE_NOT_FOUND, 404, 'Stage not found.');
}

function contactNotFound(): AppError {
  return new AppError(ERROR_CODES.CONTACT_NOT_FOUND, 404, 'Contact not found.');
}

function invalidStage(): AppError {
  return new AppError(ERROR_CODES.INVALID_STAGE, 400, 'The stage does not belong to the deal pipeline.');
}

function invalidOwner(): AppError {
  return new AppError(
    ERROR_CODES.INVALID_OWNER,
    400,
    'The owner must be an active member of your organization.',
  );
}

function currencyMismatch(expected: string): AppError {
  return new AppError(
    ERROR_CODES.CURRENCY_MISMATCH,
    400,
    `Deals in this organization use ${expected}.`,
  );
}

function lostReasonRequired(): AppError {
  return new AppError(ERROR_CODES.LOST_REASON_REQUIRED, 400, 'A lost deal requires a reason.');
}

function deletedContact(): AppError {
  return new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'The contact has been deleted.');
}

function startOfUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** `status` is derived from the stage, never from the client (FR-06.1). */
function stageStatus(stage: Pick<Stage, 'isWon' | 'isLost'>): DealModel['status'] {
  if (stage.isWon) {
    return 'WON';
  }
  if (stage.isLost) {
    return 'LOST';
  }
  return 'OPEN';
}

/** One audit row per move: the action names the lifecycle transition when there is one. */
function moveAuditAction(from: DealModel['status'], to: DealModel['status']): DealAuditAction {
  if (from === to) {
    return 'DEAL_MOVED';
  }
  if (to === 'WON') {
    return 'DEAL_WON';
  }
  if (to === 'LOST') {
    return 'DEAL_LOST';
  }
  return 'DEAL_REOPENED';
}

/**
 * Deal CRUD, kanban moves and assignment (FR-05/FR-06). Visibility is scoped here; the repository
 * always filters by org, and every mutation audits inside the transaction and publishes after commit.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsRepository,
    private readonly audit: AuditService,
    private readonly events: DomainEventBus,
  ) {}

  async list(actor: AuthenticatedUser, query: DealListQuery): Promise<DealListResponse> {
    const page = await this.deals.list(actor.orgId, {
      ownerId: actor.role === 'SALES' ? actor.userId : query.ownerId,
      pipelineId: query.pipelineId,
      stageId: query.stageId,
      status: query.status,
      sort: query.sort as DealSort,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: page.rows.map(toDeal),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<DealResponse> {
    const deal = await this.deals.findById(this.prisma, actor.orgId, id, this.ownerScope(actor));
    if (!deal) {
      throw dealNotFound();
    }
    return toDeal(deal);
  }

  async create(
    actor: AuthenticatedUser,
    body: DealCreateRequest,
    meta: DealMutationMeta = {},
  ): Promise<DealResponse> {
    return this.prisma.$transaction(async (tx) => {
      const pipeline = await this.deals.findPipeline(tx, actor.orgId, body.pipelineId);
      if (!pipeline) {
        throw pipelineNotFound();
      }
      const stage = await this.deals.findStage(tx, actor.orgId, body.stageId);
      if (!stage) {
        throw stageNotFound();
      }
      if (stage.pipelineId !== pipeline.id) {
        throw invalidStage();
      }

      const contact = await this.deals.findContact(tx, actor.orgId, body.contactId);
      const ownerScope = this.ownerScope(actor);
      if (!contact || (ownerScope && contact.ownerId !== ownerScope)) {
        throw contactNotFound();
      }
      if (contact.deletedAt) {
        throw deletedContact();
      }

      const currency = await this.deals.findOrgCurrency(tx, actor.orgId);
      if (body.currency && body.currency !== currency) {
        throw currencyMismatch(currency);
      }

      const ownerId = await this.resolveOwner(tx, actor, body.ownerId);
      const status = stageStatus(stage);
      if (status === 'LOST') {
        throw lostReasonRequired();
      }

      const cards = await this.deals.listStageCards(tx, actor.orgId, stage.id);
      const plan = computePosition(cards, cards.length);

      const deal = await this.deals.create(tx, {
        orgId: actor.orgId,
        contactId: body.contactId,
        pipelineId: body.pipelineId,
        stageId: body.stageId,
        title: body.title,
        value: body.value,
        currency,
        ownerId,
        expectedClose: body.expectedClose ? startOfUtcDay(body.expectedClose) : null,
        status,
        lostReason: null,
        position: plan.position,
        closedAt: status === 'OPEN' ? null : new Date(),
      });

      await this.audit.recordDeal(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: deal.id,
        action: 'DEAL_CREATED',
        after: dealAuditSnapshot(deal),
        ip: meta.ip,
      });

      return toDeal(deal);
    });
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    body: DealUpdateRequest,
    meta: DealMutationMeta = {},
  ): Promise<DealResponse> {
    const ownerScope = this.ownerScope(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.deals.findById(tx, actor.orgId, id, ownerScope);
      if (!existing) {
        throw dealNotFound();
      }

      const data: Prisma.DealUncheckedUpdateManyInput = {};
      if (body.title !== undefined) {
        data.title = body.title;
      }
      if (body.value !== undefined) {
        data.value = body.value;
      }
      if (body.expectedClose !== undefined) {
        data.expectedClose = body.expectedClose === null ? null : startOfUtcDay(body.expectedClose);
      }

      const count = await this.deals.updateVersioned(tx, actor.orgId, id, body.version, data, ownerScope);
      if (count === 0) {
        throw await this.conflict(tx, actor.orgId, id, ownerScope);
      }

      const updated = await this.findUpdated(tx, actor.orgId, id, ownerScope);
      await this.audit.recordDeal(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: id,
        action: 'DEAL_UPDATED',
        before: dealAuditSnapshot(existing),
        after: dealAuditSnapshot(updated),
        ip: meta.ip,
      });

      return toDeal(updated);
    });
  }

  async move(
    actor: AuthenticatedUser,
    id: string,
    body: DealMoveRequest,
    meta: DealMutationMeta = {},
  ): Promise<DealResponse> {
    const ownerScope = this.ownerScope(actor);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await this.deals.findById(tx, actor.orgId, id, ownerScope);
      if (!existing) {
        throw dealNotFound();
      }

      const stage = await this.deals.findStage(tx, actor.orgId, body.stageId);
      if (!stage) {
        throw stageNotFound();
      }
      if (stage.pipelineId !== existing.pipelineId) {
        throw invalidStage();
      }

      const status = stageStatus(stage);
      if (status === 'LOST' && !body.lostReason) {
        throw lostReasonRequired();
      }

      const cards = await this.deals.listStageCards(tx, actor.orgId, stage.id, existing.id);
      const plan = computePosition(cards, body.position);
      for (const update of plan.rebalance) {
        await this.deals.updatePosition(tx, actor.orgId, update.id, update.position);
      }

      const count = await this.deals.updateVersioned(
        tx,
        actor.orgId,
        id,
        body.version,
        {
          stageId: stage.id,
          position: plan.position,
          status,
          lostReason: status === 'LOST' ? body.lostReason : null,
          closedAt: status === 'OPEN' ? null : (existing.closedAt ?? new Date()),
        },
        ownerScope,
      );
      if (count === 0) {
        throw await this.conflict(tx, actor.orgId, id, ownerScope);
      }

      const updated = await this.findUpdated(tx, actor.orgId, id, ownerScope);
      await this.audit.recordDeal(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: id,
        action: moveAuditAction(existing.status, updated.status),
        before: dealAuditSnapshot(existing),
        after: dealAuditSnapshot(updated),
        ip: meta.ip,
      });

      return { deal: updated, fromStageId: existing.stageId };
    });

    await this.events.publish('deal.moved', actor.orgId, {
      dealId: outcome.deal.id,
      fromStageId: outcome.fromStageId,
      toStageId: outcome.deal.stageId,
      position: outcome.deal.position.toFixed(10),
      version: outcome.deal.version,
      ownerId: outcome.deal.ownerId,
      actorId: actor.userId,
    });

    return toDeal(outcome.deal);
  }

  async assign(
    actor: AuthenticatedUser,
    id: string,
    body: DealAssignRequest,
    meta: DealMutationMeta = {},
  ): Promise<DealResponse> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await this.deals.findById(tx, actor.orgId, id);
      if (!existing) {
        throw dealNotFound();
      }
      const owner = await this.deals.findActiveOwner(tx, actor.orgId, body.ownerId);
      if (!owner) {
        throw invalidOwner();
      }

      const count = await this.deals.updateVersioned(tx, actor.orgId, id, body.version, {
        ownerId: owner.id,
      });
      if (count === 0) {
        throw await this.conflict(tx, actor.orgId, id);
      }

      const updated = await this.findUpdated(tx, actor.orgId, id);
      await this.audit.recordDeal(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: id,
        action: 'DEAL_ASSIGNED',
        before: dealAuditSnapshot(existing),
        after: dealAuditSnapshot(updated),
        ip: meta.ip,
      });

      return { deal: updated, fromOwnerId: existing.ownerId };
    });

    await this.events.publish('deal.assigned', actor.orgId, {
      dealId: outcome.deal.id,
      fromOwnerId: outcome.fromOwnerId,
      toOwnerId: outcome.deal.ownerId,
      version: outcome.deal.version,
      actorId: actor.userId,
    });

    return toDeal(outcome.deal);
  }

  /** Sales are always restricted to their own rows; Manager/Admin see the whole org. */
  private ownerScope(actor: AuthenticatedUser): string | undefined {
    return actor.role === 'SALES' ? actor.userId : undefined;
  }

  /**
   * `ownerId` follows the permissions matrix: Sales may only own the deal themselves (403 otherwise),
   * while Manager/Admin may assign an active member of their org (`400 INVALID_OWNER` otherwise).
   */
  private async resolveOwner(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    requested?: string,
  ): Promise<string> {
    if (actor.role === 'SALES') {
      if (requested && requested !== actor.userId) {
        throw new AppError(ERROR_CODES.FORBIDDEN, 403, 'Sales cannot assign a deal to another user.');
      }
      return actor.userId;
    }

    if (!requested) {
      return actor.userId;
    }

    const owner = await this.deals.findActiveOwner(tx, actor.orgId, requested);
    if (!owner) {
      throw invalidOwner();
    }
    return requested;
  }

  /** 0 updated rows: the row vanished (404) or a concurrent writer bumped the version (409). */
  private async conflict(
    tx: Prisma.TransactionClient,
    orgId: string,
    id: string,
    ownerScopeId?: string,
  ): Promise<AppError> {
    const current = await this.deals.findById(tx, orgId, id, ownerScopeId);
    if (!current) {
      return dealNotFound();
    }
    return new AppError(
      ERROR_CODES.DEAL_VERSION_CONFLICT,
      409,
      'The deal was updated by someone else. Please reload.',
      { currentVersion: current.version },
    );
  }

  private async findUpdated(
    tx: Prisma.TransactionClient,
    orgId: string,
    id: string,
    ownerScopeId?: string,
  ): Promise<DealModel> {
    const updated = await this.deals.findById(tx, orgId, id, ownerScopeId);
    if (!updated) {
      throw dealNotFound();
    }
    return updated;
  }
}
