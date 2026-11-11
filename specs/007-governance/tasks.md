# Tasks: Governance (Audit, Export, Rate Limit, Cache)

**Input**: `specs/007-governance/`
**Prerequisites**: 003, 004; plan.md, spec.md
**Tests**: Mandatory. Cache invalidation/rate limit boundary must be tested first.

## Phase 1 — Audit

- [ ] **T600** Verify `audit_logs`/index from `0001_init`; add indexes if missing;
      `test/integration/audit.spec.ts`: list/filter/pagination, Admin only, tenant, no mutation, redaction.
- [ ] **T601** `modules/audit/{repository,service,controller}.ts`: filters, cursor, DTO; frontend admin page
      table/diff; p95 test with 100k.

## Phase 2 — Export

- [ ] **T602** `backend/test/integration/exports.spec.ts` + `modules/exports`: contacts/deals, filters,
      stream, BOM, injection escape, 100k, role/tenant, audit EXPORT; frontend export button.

## Phase 3 — Rate limit

- [ ] **T603** `backend/test/integration/rate-limit.spec.ts` + `common/rate-limit`: user 300/minute, auth
      5/15m; generic limiter for webhook (wired in 006 T512); headers; Redis down fail-closed/open; frontend 429
      toast.

## Phase 4 — Cache

- [ ] **T604** `backend/test/integration/cache.spec.ts` + `common/cache`: canonical key, TTL 60s, hit/miss,
      role/user/org isolation, Redis down bypass.
- [ ] **T605** Apply the cache to `reports.summary`; bump `org:{id}:data_version` after every contact/
      deal/activity mutation; test move → summary shows new numbers.
- [ ] **T606** [P] Frontend audit page, export buttons, 429 handling; cache does not affect the UI.

## Phase 5 — Verification

- [ ] **T607** Perf: audit 100k, export 100k RAM, dashboard hit/miss; write the report.
- [ ] **T608** Docs/traceability/checklists; security review (cache/export/rate limit).

## Dependencies

- T600–T601 after audit 003/004.
- T602 independent after data.
- T603 after auth (002); the generic limiter is used for webhook in 006 T512.
- T604–T605 after reports (004).
- T606 after the API.

## MVP checkpoint

After T605: audit/export/rate limit/cache cover FR-13/14/15; the dashboard invalidates correctly.

## Notes

- Cache only for the dashboard; do not cache list/kanban.
- Export streaming; no OOM.
- Rate limit auth/webhook fail-closed; reads fail-open.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR13-01..05 | T600–T601, T606, T608 |
| AC-FR14-01..05 | T602, T606–T608 |
| AC-FR15-01..07 | T603–T607 |
| AC-NFR01-01..02 | T607 |
| AC-NFR02-01..04 | T603 |
- Audit has no edit/delete endpoint.
