# ADR-002 — Multi-tenant via an `org_id` column (shared schema)

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec section 4, C3
- **Related**: NFR-02, SCR-001

## Context

Data must be isolated between organizations cheaply, fitting a small project. Options: database-per-tenant,
schema-per-tenant, shared schema + `org_id`.

## Decision

Use a shared schema: every business table has `org_id`; every query filters by the org taken from the JWT. Use
composite FKs `(org_id, id)` so the database rejects cross-tenant references. Add `org_id` to `stages` (SCR-001).

## Consequences

**Positive**

- One migration, one connection pool, simple backups.
- Org-wide reporting queries are easy; low infrastructure cost.
- Composite FKs create a safety net in the database, not just in code.

**Negative / trade-offs**

- One query forgetting `org_id` leaks data.
- No physical isolation; one bad SQL statement can affect several orgs.
- Indexes must lead with `org_id` and can grow large.

## Mandatory mitigations

- Repositories take an explicit `orgId`; no `findUnique({id})` for business data.
- Tenant-isolation tests for **every** endpoint (org B calling an org A ID → 404).
- `$queryRaw` must include `org_id = $1`; reviewed manually.
- Composite FK + unique `(org_id,id)` on parent tables.
- Never take `orgId` from the body/query/header.

## Rejected alternatives

- **Schema-per-tenant**: N migrations, complex connections, unnecessary.
- **Database-per-tenant**: high operational cost, hard to report across tenants (not needed).
