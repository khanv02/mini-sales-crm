# Tasks: Contacts, Pipeline & Deals

**Input**: `specs/003-contacts-pipeline/`
**Prerequisites**: 001, 002, plan.md, spec.md
**Tests**: Mandatory (C8). Tests first; every endpoint has happy/error/role/tenant.

## Phase 1 — Schema & shared

- [ ] **T200** Prisma/migration `0002_crm_core`: contacts, pipelines, stages, deals (including `closed_at`);
      composite FK; check constraints; trigram index; partial unique email; update data-model.
- [ ] **T201** [P] `packages/shared/src/schemas/{contact,pipeline,deal}.ts`; cursor/filter/sort types.
- [ ] **T202** [P] Factories `test/factories/{contact,pipeline,deal}.ts`; seed default pipeline.
- [ ] **T203** [P] `common/events/domain-event-bus.ts`; `AuditService` helpers for the 3 entities; unit test.

## Phase 2 — US1 Contacts (P1)

### Tests first

- [ ] **T204** `apps/api/test/integration/contacts.spec.ts`: create/list/get/update/delete, search, filter,
      pagination, duplicate email, soft delete, Sales owner, Manager/Admin all, tenant.
- [ ] **T205** `apps/api/test/perf/contacts-search.perf.ts`: seed 10k, p95 < 300ms.

### Implementation

- [ ] **T206** `modules/contacts/contact.repository.ts`: org-scoped CRUD; search trigram/unaccent; cursor.
- [ ] **T207** `contact.service.ts` + `contact.controller.ts`: validation, scope, audit, duplicate mapping.
- [ ] **T208** `apps/api/test/unit/contact-search.spec.ts`; EXPLAIN check; fix the index if it is a seq scan.

## Phase 3 — US2 Pipeline (P2)

### Tests first

- [ ] **T209** `apps/api/test/integration/pipelines.spec.ts`: CRUD pipeline/stage, reorder, delete guards,
      won/lost invariant, name duplicate, role/tenant.

### Implementation

- [ ] **T210** `modules/pipeline/{pipeline.repository,pipeline.service,pipeline.controller}.ts`: transaction
      reorder; guards 409; audit.
- [ ] **T211** Integration fix + `pipelines.spec.ts` pass; frontend API hooks.

## Phase 4 — US3 Deals & Kanban (P1)

### Tests first

- [ ] **T212** `apps/api/test/integration/deals.spec.ts`: create/list/get/update, validation, RBAC/tenant,
      audit, assign.
- [ ] **T213** `apps/api/test/integration/deals-concurrency.spec.ts`: two parallel moves same version →
      one 200/one 409; audit 1; board correct.
- [ ] **T214** `apps/api/test/unit/position.spec.ts`: insert head/middle/end, 100 inserts, rebalance.

### Implementation

- [ ] **T215** `modules/deals/deal.repository.ts`: org/pipeline/stage joins; versioned update; board query.
- [ ] **T216** `modules/deals/position.service.ts`: midpoint/rebalance; clamp; transaction.
- [ ] **T217** `deal.service.ts` + `deal.controller.ts`: create/move/assign; lost validation; audit; publish
      `deal.moved/assigned` after commit.

## Phase 5 — US4 Win/Loss (P2)

### Tests first

- [ ] **T218** `apps/api/test/integration/deals-win-loss.spec.ts`: won, lost require reason, reopen, closed_at,
      report consistency, audit.

### Implementation

- [ ] **T219** `deal.service`: derive status/closed_at; clear lost_reason; DB check alignment.
- [ ] **T220** Integration pass; seed WON/LOST data for 004.

## Phase 6 — Frontend & E2E

- [ ] **T221** [P] `apps/web/src/features/contacts`: list/search/filter/create/edit/delete, pagination.
- [ ] **T222** [P] `apps/web/src/features/pipelines`: admin stage editor, dnd reorder, won/lost, delete guard.
- [ ] **T223** `apps/web/src/features/deals/KanbanBoard.tsx`: dnd-kit, optimistic move, 409 rollback/toast,
      assign menu.
- [ ] **T224** Deal drawer/form: create/edit, win/loss modal, validation, currency format.
- [ ] **T225** `apps/web/e2e/core-flow.spec.ts`: login → contact → deal → move → won.
- [ ] **T226** [P] Perf + docs: run 10k/5k, record; update traceability; PR checklist.

## Dependencies

- T200 → T201–T203.
- T204–T208 (contacts) are independent after T200.
- T209–T211 (pipeline) after T200.
- T212–T217 (deals) need pipeline + contact.
- T218–T220 after move.
- T221 after the contacts API; T222 after the pipeline API; T223–T224 after the deals API; T225 after the UI.

## MVP checkpoint

After T217: create contact/deal, move on the kanban, 409 passes, audit/event pass. After T225: core M1 demo.

## Notes

- Do not build import/export/activity in this feature (004/006/007).
- Every mutation must be audited in the transaction; test rollback.
- Position is numeric; the client sends the index, the server returns the actual position.
- If trigram search misses p95, add a generated `search_text` and re-index.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR03-01..08 | T200–T208, T221, T226 |
| AC-FR04-01..07 | T209–T211, T222 |
| AC-FR05-01..10 | T212–T217, T223–T224 |
| AC-FR06-01..05 | T218–T220, T224 |
| AC-NFR01-01..02 | T205, T226 |
