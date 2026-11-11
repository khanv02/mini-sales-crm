# Implementation Plan: Contacts, Pipeline & Deals

**Branch**: `003-contacts-pipeline` | **Date**: 2026-11-08 | **Spec**: `specs/003-contacts-pipeline/spec.md`

## Summary

Build the contacts module (CRUD/search/soft delete), pipeline/stage admin, deal CRUD + kanban move with fractional
position and optimistic lock, win/loss. This is the M1 business core; audit + events are first-class.

## Technical Context

- **Backend**: NestJS modules `contacts`, `pipeline`, `deals`; Prisma; PostgreSQL trigram.
- **Frontend**: React Router, TanStack Query, dnd-kit, react-hook-form + zod, shadcn/ui.
- **Storage**: contacts, pipelines, stages, deals; composite FK; audit_logs.
- **Testing**: Jest/Supertest; Playwright; perf seed 10k/5k.
- **Performance**: list/search/board p95 < 300ms; move < 500ms.

## Constitution Check

| Gate | How it is met | Status |
| --- | --- | --- |
| C1 strict | zod DTO/shared types; no any | Pass |
| C2 layering | controller → service → repository; raw SQL in the repo | Pass |
| C3 org_id | Composite FK; repo takes orgId; tenant test | Pass |
| C4 audit | transaction + AuditService for every mutation | Pass |
| C5 validate/error | zod; conflict/validation codes | Pass |
| C6 secret | no secret in this feature | Pass |
| C7 async | realtime event after commit; non-blocking | Pass |
| C8 test | happy/error/role/tenant + concurrency | Pass |
| C9 small PRs | T200–T226 by group | Pass |

## Data Model (delta)

- `contacts`: partial unique lower(email); soft delete; trigram indexes.
- `pipelines`, `stages` (org_id, composite FK, won/lost partial unique).
- `deals`: composite FK `(org_id, pipeline_id, stage_id)`, version, position numeric, closed_at, status,
  lost_reason, check constraints.
- Details in `docs/data-model.md` 4.4–4.7.

## API

| Method | Path | Note |
| --- | --- | --- |
| GET/POST | `/contacts` | search/filter/cursor |
| GET/PATCH/DELETE | `/contacts/:id` | soft delete |
| GET/POST | `/pipelines` | Sales read; Admin write |
| PATCH/DELETE | `/pipelines/:id` | 409 if deals remain |
| POST | `/pipelines/:id/stages` | Admin |
| PATCH/DELETE | `/stages/:id` | reorder/won/lost |
| GET/POST | `/deals` | board/list |
| GET/PATCH | `/deals/:id` | version |
| PATCH | `/deals/:id/move` | stageId, position, version |
| PATCH | `/deals/:id/assign` | Manager/Admin |
| GET/POST | `/deals/:id/activities` | (implemented by feature 004; the route belongs to deals) |

## Search design

- Normalize the term: trim, lowercase, unaccent (when used), escape `%`/`_`.
- Query contacts within the org + owner scope + deleted null; `ILIKE` on name/email/company.
- GIN trigram index; if `unaccent` is not immutable, use a generated column `search_text`.
- Cursor: `(created_at, id)` or `(name, id)` depending on the sort; base64 opaque.
- Perf test 10k; EXPLAIN must use a bitmap index scan, not a seq scan.

## Kanban move design

```text
PATCH /deals/:id/move { stageId, position, version, lostReason? }

1. Load the deal by (orgId,id) + the target stage in the same pipeline.
2. If the target stage is_won/is_lost: validate lostReason; set status/closed_at.
3. Compute the new position:
   - take the neighbors by position/id in the target stage (excluding the current deal)
   - clamp the index; midpoint; rebalance if precision < 1e-9
4. UPDATE ... WHERE id AND org_id AND version = :version
   - rowCount 0 → re-read → 409 currentVersion / 404
5. Audit DEAL_MOVED (before/after stage/position/status) in the same tx.
6. After commit: emit deal.moved (old/new owner + managers).
```

## Frontend

- `/contacts`: table, search debounce 300ms, filter owner/source, cursor "Load more", create/edit dialog.
- `/pipelines`: admin list, stage editor, drag reorder (dnd-kit), won/lost toggle, delete guard.
- `/deals`: kanban columns by stage, card value/owner/expected close, dnd-kit; optimistic update; 409 →
  toast + invalidate; assign menu (manager/admin); win/loss modal (lost reason required).
- Deal detail drawer: fields + timeline placeholder (004).
- Query keys: `['contacts', filters]`, `['deals', pipelineId, filters]`, `['deal', id]`.
- Optimistic move: snapshot, patch cache, rollback on error; version from the deal.

## Audit & events

- Audit actions: `CONTACT_CREATED/UPDATED/DELETED`, `PIPELINE_*`, `STAGE_*`, `DEAL_CREATED/UPDATED/MOVED/
  ASSIGNED/WON/LOST/REOPENED`.
- `before/after` diff of the changed fields; redact email/phone? The audit needs the email for tracing; keep the
  email, never log secrets. (PII policy: internal audit, Admin-only.)
- Domain event interface `DealMovedEvent` emitted through an internal `EventBus`; feature 005 connects Socket.IO.

## Testing

| Group | Test |
| --- | --- |
| Contacts | CRUD, search, pagination, soft delete, duplicate, role/tenant, perf |
| Pipeline | CRUD, reorder, delete guards, won/lost, role/tenant |
| Deals | CRUD, board, move, version 409, concurrency, assign, validation, audit |
| Win/loss | won/lost/reopen, reason required, closed_at |
| UI | kanban optimistic + rollback, search, pipeline admin |
| E2E | login → contact → deal → move → won |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Composite FK/migration complexity | Write SQL migrations, test from an empty DB; table order |
| Trigram/unaccent index | Try the migration on PG16; fallback to a generated column |
| Position precision/rebalance | Unit test 100 inserts; property-based if needed |
| N+1 board | Query deals + stage once; include the minimum owner/contact |
| Optimistic UI wrong on 409 | Rollback + invalidate; E2E with 2 contexts |
| Stale access after a role change | Guard reads DB/cache (002) |

## Complexity Tracking

No violations. Fractional position and composite FK are deliberate complexity, already covered by ADR-014/ADR-002.
