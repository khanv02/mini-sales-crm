import type { Deal as DealModel } from '@prisma/client';
import type { Deal as DealResponse } from '@pulse/shared';

/** `date` columns are date-only in the contract (`YYYY-MM-DD`), not UTC timestamps. */
function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** API projection of a deal (docs/api/openapi.yaml `Deal`); `numeric` becomes a number. */
export function toDeal(deal: DealModel): DealResponse {
  return {
    id: deal.id,
    orgId: deal.orgId,
    contactId: deal.contactId,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    title: deal.title,
    value: Number(deal.value),
    currency: deal.currency,
    ownerId: deal.ownerId,
    expectedClose: deal.expectedClose ? toDateOnly(deal.expectedClose) : null,
    status: deal.status,
    lostReason: deal.lostReason,
    position: Number(deal.position),
    version: deal.version,
    closedAt: deal.closedAt?.toISOString() ?? null,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

/** Audit snapshot of the business fields (C4); internal ids and timestamps only where they matter. */
export function dealAuditSnapshot(deal: DealModel): Record<string, unknown> {
  return {
    title: deal.title,
    value: Number(deal.value),
    currency: deal.currency,
    contactId: deal.contactId,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    ownerId: deal.ownerId,
    expectedClose: deal.expectedClose ? toDateOnly(deal.expectedClose) : null,
    status: deal.status,
    lostReason: deal.lostReason,
    position: Number(deal.position),
    version: deal.version,
    closedAt: deal.closedAt?.toISOString() ?? null,
  };
}
