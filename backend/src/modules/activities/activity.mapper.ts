import type { Activity as ActivityModel } from '@prisma/client';
import type { Activity as ActivityResponse } from '@pulse/shared';

/** API projection of an activity (docs/api/openapi.yaml); timestamps are ISO-8601 strings. */
export function toActivity(activity: ActivityModel): ActivityResponse {
  return {
    id: activity.id,
    orgId: activity.orgId,
    dealId: activity.dealId,
    type: activity.type,
    content: activity.content,
    dueAt: activity.dueAt?.toISOString() ?? null,
    doneAt: activity.doneAt?.toISOString() ?? null,
    assigneeId: activity.assigneeId,
    createdBy: activity.createdBy,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

/** Audit snapshot of the business fields (C4); ids and timestamps only where they matter. */
export function activityAuditSnapshot(activity: ActivityModel): Record<string, unknown> {
  return {
    dealId: activity.dealId,
    type: activity.type,
    content: activity.content,
    dueAt: activity.dueAt?.toISOString() ?? null,
    doneAt: activity.doneAt?.toISOString() ?? null,
    assigneeId: activity.assigneeId,
  };
}
