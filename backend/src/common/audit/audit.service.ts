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

export interface AuditEntry {
  orgId: string;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: AuditAction;
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
}
