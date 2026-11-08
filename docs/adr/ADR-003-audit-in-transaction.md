# ADR-003 — Audit log inside the same transaction

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec section 4, C4
- **Related**: FR-13, SCR-013

## Context

C4 requires every business data change to be audited (who, what, when, before/after). Writing audit after commit
through a job/queue can lose rows when the process dies or the transaction rolls back.

## Decision

Write audit inside the same transaction as the mutation, via `AuditService.record(tx, entry)`. If the audit insert
fails, the transaction rolls back. Audit is append-only; there is no edit/delete API. Secrets/PII are redacted.

## Consequences

**Positive**

- The invariant "no change without a log" holds in every case.
- before/after queries stay consistent with the data.
- No outbox is needed for audit.

**Negative / trade-offs**

- Adds write latency and transaction size.
- `before/after` JSONB can be large; it needs limits.
- Audit and business data share one connection/transaction.

## Rules

- Only write when the mutation actually changes data (no no-op audits).
- `before/after` is a redacted diff or snapshot; max 32KB, truncated with a flag.
- Never store `password_hash`, tokens, secrets or authorization headers.
- Background jobs also use a transaction + audit when they write business data.
- Rollback test: a failure after the update leaves no audit row and the old data intact.

## Rejected alternatives

- **Async audit through a queue**: can lose rows, violating C4.
- **Database triggers**: hard to redact, to capture actor/requestId, to test, and to version the schema.
