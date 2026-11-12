import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getRequestId } from '../logging/request-context';

const REDACTED = '[REDACTED]';

/** Keys that must never reach an audit row (C4: no secrets or raw PII). */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokens',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'tokenhash',
  'token_hash',
  'cookie',
  'authorization',
  'secret',
  'pepper',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z_]/g, '');
}

/** Deep-copy a snapshot, replacing sensitive values with `[REDACTED]`. */
export function redactSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  function walk(current: unknown, depth: number): unknown {
    if (current === null || typeof current !== 'object') {
      return current;
    }
    if (depth > 6) {
      return REDACTED;
    }
    if (Array.isArray(current)) {
      return current.map((item) => walk(item, depth + 1));
    }
    if (current instanceof Date) {
      return current.toISOString();
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : walk(nested, depth + 1);
    }
    return result;
  }

  return walk(value, 0) as Prisma.InputJsonValue;
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/** Feature-specific actions from `specs/003-contacts-pipeline/plan.md`. */
export type ContactAuditAction = 'CONTACT_CREATED' | 'CONTACT_UPDATED' | 'CONTACT_DELETED';
export type PipelineAuditAction = 'PIPELINE_CREATED' | 'PIPELINE_UPDATED' | 'PIPELINE_DELETED';
export type StageAuditAction = 'STAGE_CREATED' | 'STAGE_UPDATED' | 'STAGE_DELETED';
export type DealAuditAction =
  | 'DEAL_CREATED'
  | 'DEAL_UPDATED'
  | 'DEAL_MOVED'
  | 'DEAL_ASSIGNED'
  | 'DEAL_WON'
  | 'DEAL_LOST'
  | 'DEAL_REOPENED';

export type EntityAuditEntry<A extends string> = Omit<AuditEntry, 'action' | 'entity'> & { action: A };

export interface AuditEntry {
  orgId: string;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: AuditAction | ContactAuditAction | PipelineAuditAction | StageAuditAction | DealAuditAction;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  requestId?: string;
}

/**
 * C4: every business mutation writes an audit row **inside the same transaction**
 * as the mutation, so a rollback removes both.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        orgId: entry.orgId,
        actorId: entry.actorId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: redactSnapshot(entry.before),
        after: redactSnapshot(entry.after),
        requestId: entry.requestId ?? getRequestId() ?? null,
        ip: entry.ip ?? null,
      },
    });
  }

  /** FR-03: contact mutations, entity `Contact`. */
  async recordContact(
    tx: Prisma.TransactionClient,
    entry: EntityAuditEntry<ContactAuditAction>,
  ): Promise<void> {
    await this.record(tx, { ...entry, entity: 'Contact' });
  }

  /** FR-04: pipeline mutations, entity `Pipeline`. */
  async recordPipeline(
    tx: Prisma.TransactionClient,
    entry: EntityAuditEntry<PipelineAuditAction>,
  ): Promise<void> {
    await this.record(tx, { ...entry, entity: 'Pipeline' });
  }

  /** FR-04: stage mutations, entity `Stage`. */
  async recordStage(
    tx: Prisma.TransactionClient,
    entry: EntityAuditEntry<StageAuditAction>,
  ): Promise<void> {
    await this.record(tx, { ...entry, entity: 'Stage' });
  }

  /** FR-05/FR-06: deal mutations, entity `Deal`. */
  async recordDeal(tx: Prisma.TransactionClient, entry: EntityAuditEntry<DealAuditAction>): Promise<void> {
    await this.record(tx, { ...entry, entity: 'Deal' });
  }
}
