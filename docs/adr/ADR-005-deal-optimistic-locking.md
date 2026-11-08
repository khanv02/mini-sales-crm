# ADR-005 — Optimistic locking for deals

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec section 4, FR-05
- **Related**: ADR-014

## Context

The kanban lets several people drag the same deal. With "last write wins" updates the later writer silently
overwrites the earlier change (data loss, wrong audit).

## Decision

Use a `deals.version` column (integer, default 1). Every update/move sends the current `version`. The repository
runs:

```sql
UPDATE deals
SET stage_id = $1, position = $2, version = version + 1, ...
WHERE id = $3 AND org_id = $4 AND version = $5;
```

If `rowCount = 0`: reload the deal; when it exists → `409 DEAL_VERSION_CONFLICT` with `currentVersion`; when it
does not → 404. No automatic retry for user moves.

## Consequences

**Positive**

- No silent overwrites; the client learns about the conflict and reloads.
- No pessimistic locks needed; suits read-heavy workloads.
- Audit only records the winning mutation.

**Negative / trade-offs**

- The client must send the version and handle 409.
- Every deal update must bump the version; forgetting it removes the protection.
- It does not resolve position conflicts between two different deals (tie-break accepted).

## Rules

- `version` only increments on the server; clients never set it.
- Both `PATCH /deals/:id` and `/move` use the version.
- Bulk updates (import/assign) do not use the version; they use a transaction + audit.
- UI: optimistic update, rollback + toast on 409, refetch the deal/board.
- Concurrency test with 2 requests on the same version → one 200, one 409; the DB stays consistent.

## Rejected alternatives

- **Pessimistic lock**: holds a transaction/row lock for long, prone to deadlocks, unnecessary.
- **Last write wins**: violates the AC and the user experience.
