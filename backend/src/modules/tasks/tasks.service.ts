import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Activity as ActivityResponse,
  ActivityListResponse,
  TaskListQuery,
  TaskUpdateRequest,
} from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { activityAuditSnapshot, toActivity } from '../activities/activity.mapper';
import { TasksRepository, type PrismaLike } from './tasks.repository';

export interface TaskMutationMeta {
  ip?: string;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextUtcDay(value: Date): Date {
  return new Date(value.getTime() + DAY_MS);
}

function taskNotFound(): AppError {
  return new AppError(ERROR_CODES.ACTIVITY_NOT_FOUND, 404, 'Task not found.');
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

/**
 * Task projection over activities (FR-07.5..07.7, ADR-010).
 *
 * Sales see only the tasks assigned to them; Manager/Admin see the whole org. Marking a task done is
 * idempotent: the second call keeps the original `done_at` instead of moving it.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksRepository,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, query: TaskListQuery): Promise<ActivityListResponse> {
    const range = this.resolveRange(query.dueFrom, query.dueTo);
    const assigneeId = actor.role === 'SALES' ? actor.userId : query.assigneeId;

    const page = await this.tasks.list(actor.orgId, {
      status: query.status,
      assigneeId,
      dueFrom: range?.from,
      dueTo: range?.to,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: page.rows.map(toActivity),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    body: TaskUpdateRequest,
    meta: TaskMutationMeta = {},
  ): Promise<ActivityResponse> {
    const ownerScope = actor.role === 'SALES' ? actor.userId : undefined;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.tasks.findById(tx, actor.orgId, id);
      if (!existing) {
        throw taskNotFound();
      }

      const deal = await this.tasks.findDeal(tx, actor.orgId, existing.dealId, ownerScope);
      if (!deal) {
        throw taskNotFound();
      }

      // Sales may only touch a task they own or that is assigned to them.
      if (
        actor.role === 'SALES' &&
        existing.createdBy !== actor.userId &&
        existing.assigneeId !== actor.userId
      ) {
        throw taskNotFound();
      }

      const assigneeId = body.assigneeId === undefined ? existing.assigneeId : body.assigneeId;
      if (!assigneeId) {
        throw taskAssigneeRequired();
      }
      if (assigneeId !== existing.assigneeId) {
        await this.requireActiveAssignee(tx, actor.orgId, assigneeId);
      }

      const data: Prisma.ActivityUncheckedUpdateManyInput = {};
      if (body.content !== undefined) {
        data.content = body.content;
      }
      if (body.dueAt !== undefined) {
        data.dueAt = new Date(body.dueAt);
      }
      if (body.assigneeId !== undefined) {
        data.assigneeId = body.assigneeId;
      }
      if (body.done !== undefined) {
        // Idempotent: re-marking done keeps the first timestamp, and reopening clears it.
        if (body.done) {
          data.doneAt = existing.doneAt ?? new Date();
        } else {
          data.doneAt = null;
        }
      }

      const count = await this.tasks.update(tx, actor.orgId, id, data);
      if (count === 0) {
        throw taskNotFound();
      }

      const updated = await this.tasks.findById(tx, actor.orgId, id);
      if (!updated) {
        throw taskNotFound();
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

  private async requireActiveAssignee(
    tx: PrismaLike,
    orgId: string,
    assigneeId: string,
  ): Promise<void> {
    const assignee = await this.tasks.findActiveUser(tx, orgId, assigneeId);
    if (!assignee) {
      throw invalidAssignee();
    }
  }

  /** Date-only filters are inclusive; `dueTo` becomes an exclusive next-day boundary. */
  private resolveRange(
    dueFrom?: string,
    dueTo?: string,
  ): { from?: Date; to?: Date } | undefined {
    const from = dueFrom ? startOfUtcDay(dueFrom) : undefined;
    const to = dueTo ? nextUtcDay(startOfUtcDay(dueTo)) : undefined;

    if (from && to) {
      if (from >= to || to.getTime() - from.getTime() > 367 * DAY_MS) {
        throw new AppError(
          ERROR_CODES.INVALID_DATE_RANGE,
          400,
          'dueFrom must be before dueTo and the range cannot exceed 366 days.',
        );
      }
    }

    if (!from && !to) {
      return undefined;
    }
    return { from, to };
  }
}
