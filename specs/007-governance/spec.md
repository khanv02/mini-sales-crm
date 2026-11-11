# Feature Specification: Governance (Audit, Export, Rate Limit, Cache)

**Feature Branch**: `007-governance`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-13, FR-14, FR-15; C4; NFR-01, NFR-02; SCR-013, SCR-014

## User Scenarios & Testing

### US-1 — Audit log (Priority: P1)

Admin sees who did what, when, before/after; filters by entity/actor/time.

**Why P1**: C4 and FR-13; it is trustworthy evidence/portfolio.

**Independent test**: Perform a mutation; open the audit; filter; try role/tenant; try to modify/delete an audit
record.

**Acceptance Scenarios**:

1. **AC-FR13-01** Given Admin, When `GET /audit-logs`, Then the list is newest first, cursor, with
   actor/entity/action/before/after/createdAt/requestId.
2. **AC-FR13-02** Given filters `entity`, `entityId`, `actorId`, `action`, `from/to`, When querying, Then correct
   results; invalid filter → 400; filters can be combined.
3. **AC-FR13-03** Given many records, When paginating, Then the cursor is stable, with no duplicates/gaps when new
   records arrive.
4. **AC-FR13-04** Given Manager/Sales, When calling audit, Then `403`; Admin of org B → `404`/cannot see org A.
5. **AC-FR13-05** Given any request to modify/delete an audit record, When calling it, Then `404/405`; the audit
   is unchanged. Audit has already redacted password/token/secret.

---

### US-2 — Export CSV (Priority: P2)

Manager/Admin exports contacts/deals by filter; correct file, safe from CSV injection.

**Why P2**: FR-14; operationally useful but does not block the demo.

**Independent test**: Export with a filter; open the file; check columns/row count/escaping; try Sales.

**Acceptance Scenarios**:

1. **AC-FR14-01** Given Manager/Admin, When exporting contacts with a filter, Then `200 text/csv`, UTF-8 BOM,
   correct row count, no soft-deleted contacts.
2. **AC-FR14-02** Given Manager/Admin, When exporting deals, Then columns `title,contact,stage,value,currency,
   owner,status,expectedClose,closedAt,createdAt`; the filter matches the list.
3. **AC-FR14-03** Given a cell starting with `=,+,-,@`, When exporting, Then it is escaped (prefix `'`) and
   wrapped in quotes; opening in Excel does not execute formulas.
4. **AC-FR14-04** Given Sales, When exporting, Then `403`; other org → no data visible; the export is audited.
5. **AC-FR14-05** Given > 100,000 rows, When exporting, Then `400 EXPORT_TOO_LARGE`; the stream does not hold
   everything in RAM.

---

### US-3 — Rate limit & cache (Priority: P1)

The system limits per user/IP; the dashboard cache lasts 60s and is invalidated when data changes.

**Why P1**: FR-15/NFR-01; protects the API and keeps p95.

**Independent test**: Fire requests beyond the threshold; measure headers; call the dashboard twice; move a deal;
call again.

**Acceptance Scenarios**:

1. **AC-FR15-01** Given a signed-in user, When exceeding 300 requests/minute, Then `429 RATE_LIMITED` +
   `Retry-After` + limit headers; other users are unaffected.
2. **AC-FR15-02** Given 5 failed logins/15 minutes, When trying again, Then `429 TOO_MANY_ATTEMPTS` (FR-01).
3. **AC-FR15-03** Given a webhook source, When exceeding 60 requests/minute, Then `429`; no event created.
4. **AC-FR15-04** Given the dashboard is called for the first time, When calling within 60s, Then the second call
   uses the cache (fast, same numbers); TTL 60s.
5. **AC-FR15-05** Given the dashboard cache, When creating/editing/moving a deal or contact/activity, Then the
   cache is invalidated; the next call returns the new numbers (without waiting for the TTL).
6. **AC-FR15-06** Given Redis failure, When calling a read API, Then data is still returned (cache bypass);
   login/webhook fail-closed; log warn; `/health/ready` 503.
7. **AC-FR15-07** Given Sales A/B, When calling the dashboard, Then the cache key is split by org/user/role/filter;
   A does not receive B's/another org's numbers.

### Edge Cases

- Cache key with different filter orders → canonicalize to hit.
- Mutation rollback → no version bump/invalidate (only after commit).
- Several instances → invalidation via Redis version, no local cache.
- Rate limit burst/boundary → token bucket; do not wrongly block the whole org.
- Audit time filter very wide → limited to 366 days/400.
- Export while data changes → consistent snapshot (repeatable read transaction if needed).
- CSV with newlines in content → quoted correctly.
- Audit before/after too large → truncate + `truncated` flag.

## Requirements

### Functional Requirements

**Audit**

- **FR-13.1**: `GET /audit-logs` Admin; filters entity/entityId/actorId/action/from/to; cursor; max 100.
- **FR-13.2**: Audit append-only; no mutation endpoint; secret/PII redaction; requestId/ip.
- **FR-13.3**: Index by org/time/entity/actor; p95 < 300ms with 100k records (if any).

**Export**

- **FR-14.1**: `GET /exports/contacts`, `/exports/deals` Manager/Admin; filters same as the list.
- **FR-14.2**: Stream CSV, UTF-8 BOM, injection escape, max 100k, filename includes the date.
- **FR-14.3**: Audit `EXPORT` with filter/rowCount; do not log file contents.
- **FR-14.4**: Sales 403; tenant isolation.

**Rate limit & cache**

- **FR-15.1**: Redis token bucket per user (300/minute, burst 60), IP for public/auth, source for webhook.
- **FR-15.2**: 429 + `Retry-After` + `X-RateLimit-*`; auth fail-closed, reads fail-open.
- **FR-15.3**: Dashboard cache 60s, key `report:{orgId}:{role}:{userId|all}:{filtersHash}:{dataVersion}`;
  invalidate by bumping `org:{orgId}:data_version` after every contact/deal/activity mutation.
- **FR-15.4**: Redis failure → bypass cache/limit per the rules; never return another org's data.
- **FR-15.5**: Do not cache other sensitive data besides the dashboard (except the AI cache in 008).

### Key Entities

- AuditLog (4.13); cache key/version in Redis; no new tables.
- Export uses existing Contact/Deal data.

## Success Criteria

- **SC-001**: Dashboard cache hit < 50ms; miss < 300ms p95.
- **SC-002**: 0 cache keys leaking data between users/orgs (test).
- **SC-003**: Rate limit accurate ±1 request at the boundary; correct headers.
- **SC-004**: 100% of mutations invalidate the cache within < 100ms after commit.
- **SC-005**: 100% of AC have tests; exporting 100k rows does not OOM (< 200MB).

## Assumptions

- Redis is the cache/rate limit store; not the source of truth.
- Dashboard cache only for `GET /reports/summary`; list/kanban are not cached in the MVP.
- Export runs synchronous streaming; 100k rows take a few seconds; larger volumes move to a queue later.
- Audit retention is not automated yet (Q9).
- Rate limit uses the `rate-limiter-flexible` library or an atomic Redis implementation.

## Out of Scope

- Audit retention/archival job, SIEM export.
- Export Excel/PDF, scheduled export.
- Per-org custom rate limit UI.
- Caching the whole API, CDN.
- Anomaly detection.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-13 | AC-FR13-01..05 | T600–T601, T606, T608 |
| FR-14 | AC-FR14-01..05 | T602, T606–T608 |
| FR-15 | AC-FR15-01..07 | T603–T607 |
| NFR-01 | AC-NFR01-01..02 | T607 |
| NFR-02 | AC-NFR02-01..04 | T603 |
