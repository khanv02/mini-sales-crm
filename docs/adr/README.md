# ADR Index

| ADR | Title | Status | Impact |
| --- | --- | --- | --- |
| [001](ADR-001-modular-monolith.md) | Modular monolith | Accepted | Whole architecture |
| [002](ADR-002-tenant-org-id.md) | Multi-tenant `org_id` | Accepted | Schema, every query |
| [003](ADR-003-audit-in-transaction.md) | Audit inside the transaction | Accepted | Every mutation |
| [004](ADR-004-webhook-idempotency.md) | Webhook idempotency + queue | Accepted | FR-11 |
| [005](ADR-005-deal-optimistic-locking.md) | Deal optimistic locking | Accepted | FR-05 |
| [006](ADR-006-prisma.md) | Prisma | Accepted | ORM/migrations |
| [007](ADR-007-socketio-sse.md) | Socket.IO + SSE | Accepted | FR-09, FR-16 |
| [008](ADR-008-email-mailpit.md) | Mailpit/email adapter | Accepted | FR-12 |
| [009](ADR-009-defer-rag.md) | Defer RAG | Accepted | FR-20 |
| [010](ADR-010-tasks-as-activities.md) | Task = activity | Accepted | FR-07 |
| [011](ADR-011-webhook-secret-encryption.md) | Encrypt webhook secrets | Accepted | FR-11, SCR-003 |
| [012](ADR-012-realtime-rooms-rbac.md) | Realtime rooms by RBAC | Accepted | FR-09, SCR-008 |
| [013](ADR-013-contact-search-trigram.md) | Trigram search | Accepted | FR-03 |
| [014](ADR-014-fractional-position.md) | Fractional position | Accepted | FR-05 |
| [015](ADR-015-refresh-token-cookie.md) | Refresh token cookie | Accepted | FR-01 |

## Status conventions

- **Accepted**: settled; code must comply.
- **Proposed**: needs sign-off before the related milestone (all Proposed ADRs are listed in
  `specs/README.md` section 6, because they affect M1–M3 work).
- **Superseded**: replaced by a newer ADR (link it).
- **Deprecated**: no longer used but kept for history.

A new ADR: copy the structure `Context / Decision / Consequences / Alternatives / Verification`, take the next
number, update this table, and update `docs/spec-review.md` when it changes the spec.
