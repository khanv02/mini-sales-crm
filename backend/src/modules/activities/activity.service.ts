import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityType } from '@prisma/client';
import type {
  Activity as ActivityResponse,
  ActivityCreateRequest,
  ActivityListQuery,
  ActivityListResponse,
  ActivityUpdateRequest,
} from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { activityAuditSnapshot, toActivity } from './activity.mapper';
import { ActivitiesRepository, type PrismaLike } from './activity.repository';

export interface ActivityMutationMeta {
  ip?: string;
}

function dealNotFound(): AppError {
  return new AppError(ERROR_CODES.DEAL_NOT_FOUND, 404, 'Deal not found.');
}

function activityNotFound(): AppError {
  return new AppError(ERROR_CODES.ACTIVITY_NOT_FOUND, 404, 'Activity not found.');
}

function taskDueRequired(): AppError {
  return new AppError(ERROR_CODES.TASK_DUE_REQUIRED, 400, 'A task requires a due date.');
}

function taskAssigneeRequired(): AppError {
  return new AppError(ERROR_CODES.TASK_ASSIGNEE_REQUIRED, 400, 'A task requires an assignee.');
}

function invalidAssignee(): AppError {
  return new AppError(
    ERROR_CODES.INVALID_OWNER,
    400,
    'The assignee must be an active member of your organization.',
  );
}

function taskOnlyFields(): AppError {
  return new AppError(
    ERROR_CODES.VALIDATION_ERROR,
    400,
    'Only tasks carry a due date or an assignee.',
  );
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

/**
 * Timeline and activity mutations (FR-07.1..07.4). Visibility is scoped here; the repository always filters by
 * org, and every mutation audits inside the transaction (C4).
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesRepository,
    private readonly audit: AuditService,
  ) {}

  /** Newest first, optional `type` filter; the deal visibility check runs before the query (FR-07.2). */
  async list(
    actor: AuthenticatedUser,
    dealId: string,
    query: ActivityListQuery,
  ): Promise<ActivityListResponse> {
    const deal = await this.activities.findDeal(
      this.prisma,
      actor.orgId,
      dealId,
      this.ownerScope(actor),
    );
    if (!deal) {
      throw dealNotFound();
    }

    const page = await this.activities.list(actor.orgId, deal.id, {
      type: query.type as ActivityType | undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: page.rows.map(toActivity),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async create(
    actor: AuthenticatedUser,
    dealId: string,
    body: ActivityCreateRequest,
    meta: ActivityMutationMeta = {},
  ): Promise<ActivityResponse> {
    return this.prisma.$transaction(async (tx) => {
      const deal = await this.activities.findDeal(
        tx,
        actor.orgId,
        dealId,
        this.ownerScope(actor),
      );
      if (!deal) {
        throw dealNotFound();
      }

      const dueAt = body.dueAt ? toDate(body.dueAt) : null;
      const assigneeId = body.assigneeId ?? null;

      if (body.type === 'TASK') {
        if (!dueAt) {
          throw taskDueRequired();
        }
        if (!assigneeId) {
          throw taskAssigneeRequired();
        }
      } else if (dueAt || assigneeId) {
        throw taskOnlyFields();
      }

      if (assigneeId) {
        await this.requireActiveAssignee(tx, actor.orgId, assigneeId);
      }

      const activity = await this.activities.create(tx, {
        orgId: actor.orgId,
        dealId: deal.id,
        type: body.type as ActivityType,
        content: body.content,
        dueAt,
        assigneeId,
        createdBy: actor.userId,
      });

      await this.audit.recordActivity(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: activity.id,
        action: 'ACTIVITY_CREATED',
        after: activityAuditSnapshot(activity),
        ip: meta.ip,
      });

      return toActivity(activity);
    });
  }

  /**
   * Creator/assignee (Sales) or Manager/Admin (permissions matrix); `null` clears a task field, but a task must
   * keep both its deadline and its assignee (FR-07.2).
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    body: ActivityUpdateRequest,
    meta: ActivityMutationMeta = {},
  ): Promise<ActivityResponse> {
    const ownerScope = this.ownerScope(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.activities.findById(tx, actor.orgId, id);
      if (!existing) {
        throw activityNotFound();
      }

      const deal = await this.activities.findDeal(tx, actor.orgId, existing.dealId, ownerScope);
      if (!deal) {
        throw activityNotFound();
      }

      if (
        actor.role === 'SALES' &&
        existing.createdBy !== actor.userId &&
        existing.assigneeId !== actor.userId
      ) {
        throw activityNotFound();
      }

      const dueAt = body.dueAt === undefined ? existing.dueAt : toDate(body.dueAt);
      const assigneeId = body.assigneeId === undefined ? existing.assigneeId : body.assigneeId;

      if (existing.type === 'TASK') {
        if (!dueAt) {
          throw taskDueRequired();
        }
        if (!assigneeId) {
          throw taskAssigneeRequired();
        }
      } else if (body.dueAt !== undefined || body.assigneeId !== undefined) {
        throw taskOnlyFields();
      }

      if (assigneeId && assigneeId !== existing.assigneeId) {
        await this.requireActiveAssignee(tx, actor.orgId, assigneeId);
      }

      const data: Prisma.ActivityUncheckedUpdateManyInput = {};
      if (body.content !== undefined) {
        data.content = body.content;
      }
      if (body.dueAt !== undefined) {
        data.dueAt = toDate(body.dueAt);
      }
      if (body.assigneeId !== undefined) {
        data.assigneeId = body.assigneeId;
      }

      const count = await this.activities.update(tx, actor.orgId, id, data);
      if (count === 0) {
        throw activityNotFound();
      }

      const updated = await this.activities.findById(tx, actor.orgId, id);
      if (!updated) {
        throw activityNotFound();
      }

      await this.audit.recordActivity(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: updated.id,
        action: 'ACTIVITY_UPDATED',
        before: activityAuditSnapshot(existing),
        after: activityAuditSnapshot(updated),
        ip: meta.ip,
      });

      return toActivity(updated);
    });
  }

  /** Sales are always restricted to their own rows; Manager/Admin see the whole org. */
  private ownerScope(actor: AuthenticatedUser): string | undefined {
    return actor.role === 'SALES' ? actor.userId : undefined;
  }

  private async requireActiveAssignee(
    tx: PrismaLike,
    orgId: string,
    assigneeId: string,
  ): Promise<void> {
    const assignee = await this.activities.findActiveUser(tx, orgId, assigneeId);
    if (!assignee) {
      throw invalidAssignee();
    }
  }
}
