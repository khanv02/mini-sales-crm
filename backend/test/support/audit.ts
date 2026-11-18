import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../factories/prisma';

/** C4 evidence: filter the append-only audit log by entity (and optionally action/org). */
export interface AuditQuery {
  entity: string;
  entityId?: string;
  action?: string;
  orgId?: string;
}

function toWhere(query: AuditQuery): Prisma.AuditLogWhereInput {
  return {
    entity: query.entity,
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.orgId ? { orgId: query.orgId } : {}),
  };
}

function describeQuery(query: AuditQuery): string {
  const parts = [`entity=${query.entity}`];
  if (query.entityId) parts.push(`entityId=${query.entityId}`);
  if (query.action) parts.push(`action=${query.action}`);
  if (query.orgId) parts.push(`orgId=${query.orgId}`);
  return parts.join(', ');
}

/** Newest matching audit row, or `null`. */
export function findAudit(query: AuditQuery): Promise<AuditLog | null> {
  return prisma.auditLog.findFirst({ where: toWhere(query), orderBy: { id: 'desc' } });
}

/** All matching rows, oldest first (useful to prove nothing was written twice). */
export function listAudits(query: AuditQuery): Promise<AuditLog[]> {
  return prisma.auditLog.findMany({ where: toWhere(query), orderBy: { id: 'asc' } });
}

export function countAudits(query: AuditQuery): Promise<number> {
  return prisma.auditLog.count({ where: toWhere(query) });
}

/** Like `findAudit`, but fails with the filter in the message so a missing audit row is easy to diagnose. */
export async function requireAudit(query: AuditQuery): Promise<AuditLog> {
  const row = await findAudit(query);
  if (!row) {
    throw new Error(`expected an audit row (${describeQuery(query)})`);
  }
  return row;
}
