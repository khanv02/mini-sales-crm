# Feature Specification: Contacts, Pipeline & Deals

**Feature Branch**: `003-contacts-pipeline`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-03, FR-04, FR-05, FR-06; ADR-005, ADR-013, ADR-014; SCR-001, SCR-002

## User Scenarios & Testing

### US-1 — Manage contacts (Priority: P1)

Sales create, find, edit and soft-delete their own contacts; Manager/Admin see the whole org.

**Why P1**: contacts are the lead source; without contacts there are no deals.

**Independent test**: create a contact, search by name/email/company, edit, delete; check that another Sales
cannot see it.

**Acceptance Scenarios**:

1. **AC-FR03-01** Given Sales, When creating a contact with a valid name + email, Then `201`, owner = self, audit
   `CONTACT_CREATED`, email lowercased.
2. **AC-FR03-02** Given 10,000 contacts, When searching `?search=...` + filter + `limit`, Then the correct results
   are returned, cursor pagination, soft-deleted contacts are not returned; p95 < 300ms.
3. **AC-FR03-03** Given Sales A and Sales B in the same org, When A lists contacts, Then A sees only contacts owned
   by A; Manager/Admin see both A and B; unassigned contacts are visible only to Manager/Admin.
4. **AC-FR03-04** Given a contact of their own, When Sales updates name/phone/company, Then `200`, audit
   before/after; When Sales B updates contact A, Then `404`.
5. **AC-FR03-05** Given a contact exists, When DELETE, Then soft delete (`deleted_at`), it disappears from
   list/search; a contact with the same email can be created again afterwards.
6. **AC-FR03-06** Given an email already in the org (not deleted), When creating/editing a duplicate contact, Then
   `409 CONTACT_EMAIL_EXISTS`; an email from another org is allowed.
7. **AC-FR03-07** Given Sales, When creating a contact with someone else's `ownerId`, Then `403`/`400`; the owner is
   always self.
8. **AC-FR03-08** Given Admin of org B, When reading/editing/deleting an org A contact by ID, Then `404`; the DB is
   unchanged.

---

### US-2 — Pipeline & stage configuration (Priority: P2)

Admin creates pipelines, adds/edits/reorders stages; a stage that still has deals is not deleted; each pipeline has
a won/lost stage.

**Why P2**: needed for the kanban; a new org has a seeded pipeline so it can be demoed before the admin UI exists.

**Independent test**: create a 4-stage pipeline, reorder, try to delete a stage with deals, try to delete the last
stage.

**Acceptance Scenarios**:

1. **AC-FR04-01** Given Admin, When creating a pipeline + stage, Then `201`, correct `org_id`, increasing position,
   audit.
2. **AC-FR04-02** Given a stage, When Admin renames/repositions or reorders, Then `200`, correct order, audit;
   `is_won`/`is_lost` at most one each per pipeline.
3. **AC-FR04-03** Given a stage that still has deals, When Admin deletes it, Then `409 STAGE_HAS_DEALS`, the stage is
   intact.
4. **AC-FR04-04** Given a pipeline with 1 stage left or missing the won/lost stage, When deleting/changing the flag,
   Then `409 LAST_STAGE`/`WON_STAGE_REQUIRED`/`LOST_STAGE_REQUIRED`.
5. **AC-FR04-05** Given a pipeline that still has deals, When Admin deletes the pipeline, Then `409
   PIPELINE_HAS_DEALS`.
6. **AC-FR04-06** Given Manager/Sales, When calling a pipeline/stage write endpoint, Then `403`; reading pipelines is
   allowed.
7. **AC-FR04-07** Given Admin of org B, When editing an org A pipeline/stage, Then `404`; the DB is unchanged.

---

### US-3 — Deals & drag-and-drop kanban (Priority: P1)

Sales create deals and drag them between stages; Manager/Admin see the whole org; a version conflict returns 409.

**Why P1**: this is the core value (G1) and the main M1 demo.

**Independent test**: create a deal, list the board, move, try 2 moves with the same version, check audit + version.

**Acceptance Scenarios**:

1. **AC-FR05-01** Given a valid contact + stage, When creating a deal, Then `201`, status `OPEN`, version 1, owner =
   current (or the person assigned by Manager/Admin), currency = org, position at the end of the stage, audit.
2. **AC-FR05-02** Given a pipeline, When `GET /deals?pipelineId=...`, Then deals are returned by stage/position;
   Sales see only their own deals; Manager/Admin see the whole org.
3. **AC-FR05-03** Given deal version N, When moving `{stageId, position, version:N}`, Then `200`, stage/position/
   version N+1, audit `DEAL_MOVED` in the same transaction; the event is emitted after commit.
4. **AC-FR05-04** Given two people with the same version N, When moving concurrently, Then one `200`, one `409
   DEAL_VERSION_CONFLICT` with `currentVersion`; the DB holds only one result; the audit has only 1 move row.
5. **AC-FR05-05** Given someone else has already moved it, When the client sends an old version, Then `409`; the UI
   reloads the new state.
6. **AC-FR05-06** Given Sales A and Sales B, When A moves B's deal, Then `404`; Manager/Admin can move it.
7. **AC-FR05-07** Given Manager/Admin, When `PATCH /deals/:id/assign` to an active owner in the same org, Then the
   owner changes, the version increments, audit `DEAL_ASSIGNED`, event; assigning an inactive/other-org owner →
   `400 INVALID_OWNER`.
8. **AC-FR05-08** Given a negative value, a currency other than the org's, a stage from another pipeline, or a
   missing field, When creating/editing, Then `400` with the corresponding code; nothing is written to the DB.
9. **AC-FR05-09** Given Admin of org B, When moving/reading an org A deal, Then `404`; the DB is unchanged.
10. **AC-FR05-10** Given 5,000 deals, When listing the board, Then p95 < 300ms; no N+1; indexes are used.

---

### US-4 — Win/loss close (Priority: P2)

A deal moves into the won/lost stage; a loss requires a reason; it can be reopened.

**Why P2**: needed for reporting and the deal lifecycle; it can come a few days after the kanban.

**Independent test**: move to won/lost; check status, closed_at, lost_reason; reopen.

**Acceptance Scenarios**:

1. **AC-FR06-01** Given deal OPEN, When moving to a stage with `is_won`, Then `status=WON`, `closed_at` set,
   `lost_reason=null`, audit.
2. **AC-FR06-02** Given deal OPEN, When moving to a stage with `is_lost` without `lostReason`, Then `400
   LOST_REASON_REQUIRED`; the deal is unchanged.
3. **AC-FR06-03** Given a move to lost with a reason, Then `status=LOST`, `closed_at` set, `lost_reason` stored,
   audit.
4. **AC-FR06-04** Given deal WON/LOST, When moving back to an OPEN stage, Then `status=OPEN`, `closed_at=null`,
   `lost_reason=null`, audit; reports update.
5. **AC-FR06-05** Given deal WON, When reading the dashboard/report (004), Then it is counted by `closed_at`;
   `updated_at` is not used; audit and status are consistent.

### Edge Cases

- A contact is soft-deleted but still has deals → the deals remain readable; creating a new deal with a deleted
  contact → 400.
- A stage is deleted while it has deals → blocked with 409; deals are never orphaned.
- A move to a stage in the same pipeline but with a position out of range → clamp to the start/end, no error.
- The position between two cards is too small → rebalance the stage, keeping the order.
- Deleting the last won/lost stage → blocked; changing the won/lost flag when another stage already has it → 409.
- Sales creates a deal with a contact they do not own → 404 (hide existence).
- Two requests create a contact with the same email concurrently → DB unique, one 409.
- An empty search term/special characters → return the default list or 400; no SQL injection.
- A pipeline with no stage → deals cannot be created; the seed always has stages.

## Requirements

### Functional Requirements

**Contacts**

- **FR-03.1**: Contact CRUD; name required; email/phone optional; email lowercase; soft delete.
- **FR-03.2**: List/search/filter by `search` (name/email/company), `ownerId`, `source`, `createdFrom/To`;
  cursor pagination; limit ≤ 100.
- **FR-03.3**: Sales only their own; Manager/Admin the whole org; unassigned contacts only Manager/Admin.
- **FR-03.4**: Unique `(org_id, lower(email))` while not deleted; map the error to `CONTACT_EMAIL_EXISTS`.
- **FR-03.5**: Search uses trigram + unaccent; p95 < 300ms with 10k; indexes as in data-model.
- **FR-03.6**: Sales cannot change the owner; Manager/Admin can assign via `PATCH /deals/:id/assign` (mandatory,
  AC-FR05-07).

**Pipeline**

- **FR-04.1**: Admin CRUD pipeline/stage; stage position numeric; reorder transaction.
- **FR-04.2**: Each pipeline has at most 1 won + 1 lost; at least 1 stage; the last stage cannot be deleted.
- **FR-04.3**: A stage/pipeline that still has deals cannot be deleted → 409.
- **FR-04.4**: Sales read pipeline/stage; no writes.

**Deals**

- **FR-05.1**: Create/read/update deal; status set by the server; version; currency = org; valid owner.
- **FR-05.2**: Board query by pipeline, group by stage, sort by position/id; cursor by stage when needed.
- **FR-05.3**: Move `{stageId, position, version}`; fractional position; audit + domain event after commit.
- **FR-05.4**: Optimistic lock; 0 rows → 409 with currentVersion; no automatic retry.
- **FR-05.5**: Assign owner by Manager/Admin; Sales cannot.
- **FR-05.6**: RBAC/tenant as in the permissions matrix.

**Win/loss**

- **FR-06.1**: `status` derived from the stage; `closed_at` set/cleared; `lost_reason` required when LOST.
- **FR-06.2**: Reopen is allowed; audit.
- **FR-06.3**: DB check constraint matches the service.

### Key Entities

- Contact, Pipeline, Stage, Deal; details in `docs/data-model.md` sections 4.4–4.7.
- Audit log for every mutation; domain events `deal.moved`, `deal.assigned` (consumed in 005).

## Success Criteria

- **SC-001**: The flow create contact → deal → drag stage → won takes < 30s of interaction.
- **SC-002**: 100% of ACs have tests; 100% of endpoints have tenant/role tests.
- **SC-003**: p95 list/search/board < 300ms with a 10k/5k seed.
- **SC-004**: 0 data loss when 2 people move concurrently; the later one always gets 409.
- **SC-005**: Every mutation has a correct before/after audit (redacted).

## Assumptions

- Each deal is attached to exactly 1 contact, 1 pipeline, 1 stage; a contact can have many deals.
- Deals have no hard-delete API in the MVP; they end as WON/LOST.
- An org can have multiple pipelines; the MVP UI defaults to the first pipeline.
- Currency = org currency; no multi-currency yet.
- Position is computed by the server; the client sends the target index.
- Realtime events are emitted even before feature 005 exists (using an internal event bus; the gateway comes later).

## Out of Scope

- Custom fields, tags, attachments.
- Contact merge, import (feature 006), bulk edit.
- Deal products/line items, discount, tax.
- Multi-currency/FX.
- Pipeline probability/weighted forecast.
- Hard delete/restore deal.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-03 | AC-FR03-01..08 | T200–T208, T221, T226 |
| FR-04 | AC-FR04-01..07 | T209–T211, T222 |
| FR-05 | AC-FR05-01..10 | T212–T217, T223–T224 |
| FR-06 | AC-FR06-01..05 | T218–T220, T224 |
| NFR-01 | AC-NFR01-01..02 | T205, T226 |
