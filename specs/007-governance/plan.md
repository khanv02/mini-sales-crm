# Implementation Plan: Governance (Audit, Export, Rate Limit, Cache)

**Branch**: `007-governance` | **Date**: 2026-11-08 | **Spec**: `specs/007-governance/spec.md`

## Summary

Complete the trust/operations layer: audit viewer, safe streaming CSV export, rate limit per user/IP/source,
and a 60s dashboard cache with version-based invalidation. This is the foundation 005/006/008 reuse.

## Technical Context

- **Backend**: modules `audit`, `exports`, `common/rate-limit`, `common/cache`.
- **Redis**: token bucket, cache key/version, single-flight (AI).
- **CSV**: stream + escape; `csv-stringify` or a custom implementation.
- **Testing**: Jest/Supertest; fake Redis; audit perf 100k; export 100k.
- **Performance**: audit p95 < 300ms; cache hit < 50ms.

## Constitution Check

| Gate | How it is satisfied | Status |
| --- | --- | --- |
| C1 strict | DTO/filter typed | Pass |
| C2 layering | AuditRepository/ExportService; thin controller | Pass |
| C3 org_id | every query scoped to org; cache key includes org | Pass |
| C4 audit | audit read-only; export writes audit | Pass |
| C5 validate/error | filter/date/limit validation | Pass |
| C6 secret | no secrets; audit redaction | Pass |
| C7 async | export stream; cache background? not needed | Pass |
| C8 test | role/tenant/cache invalidation | Pass |
| C9 small PR | T600–T608 | Pass |

## Audit

- Query `audit_logs` by org + filter; cursor `(created_at,id)`; limit ≤ 100.
- `before/after` already redacted since 003; the audit viewer never returns secrets.
- No mutation route; Nest does not expose PATCH/DELETE.
- Index: `(org_id, created_at)`, `(org_id, entity, entity_id, created_at)`, `(org_id, actor_id, created_at)`.
- Admin UI: table, filter entity/actor/action/date, diff drawer.

## Export

```text
GET /exports/contacts?search=&ownerId=&source=
  → role Manager/Admin
  → count > 100k → 400
  → set headers text/csv, BOM
  → stream rows from cursor (batch 500) → escape → response
  → audit EXPORT { filter, rowCount }
```

- Escape: if a cell starts with `= + - @ \t \r` → prefix `'`; always quote if it contains `, " \n`.
- Deals export joins contact/stage/owner; do not select secret columns.
- Do not use `findMany` on everything; use cursor/batch.
- If the client disconnects → stop the stream, log.

## Rate limit

- Redis key:
  - `rl:user:{userId}:{minute}` → count/token bucket.
  - `rl:ip:{ip}:{minute}` for public/auth.
  - `rl:source:{sourceId}:{minute}` for webhook.
- Use `rate-limiter-flexible` (Redis) or atomic Lua; TTL 2 minutes.
- Headers: `X-RateLimit-Limit/Remaining/Reset`, `Retry-After`.
- Middleware/guard order: auth → tenant → rate limit (except health/webhook).
- Redis failure:
  - auth/login + webhook: fail-closed 503/429.
  - normal reads: fail-open, log warn, metric.
- Test boundary ±1; two independent users; correct headers.

## Cache

```text
key = report:{orgId}:{role}:{userId|all}:{hash(canonical filters)}:{dataVersion}
dataVersion = GET org:{orgId}:data_version (default 0)
TTL = 60s

On mutation contact/deal/activity (after commit):
  INCR org:{orgId}:data_version
```

- Canonical filters: sort keys, drop undefined, ISO dates.
- Cache value JSON; do not cache errors.
- Redis failure → query the DB directly.
- No cross-user caching: Sales keys include userId; Manager/Admin use `all` but still per org.
- Invalidation only after commit; rollback does not bump.
- Single-flight (optional): lock `lock:report:{key}` for 5s to avoid stampede; if the lock is not acquired →
  query the DB.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/audit-logs` | Admin |
| GET | `/exports/contacts` | Manager/Admin |
| GET | `/exports/deals` | Manager/Admin |

Rate limit/cache are applied by middleware, not dedicated endpoints.

## Testing

| Group | Test |
| --- | --- |
| Audit | list/filter/pagination, role/tenant, no mutation, redaction |
| Export | columns/filters/100k/stream, injection, role/tenant, audit |
| Rate limit | 429/headers, boundary, Redis down fail modes |
| Cache | hit/miss/TTL, invalidation, key isolation, Redis down |
| Perf | audit 100k, export 100k memory |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Cache key missing a filter causes wrong numbers | Canonicalize + test each filter |
| Invalidation lag | Bump after commit; E2E test move → summary |
| Rate limit wrongly blocks | Key/user; burst; test many users |
| Export OOM | Stream in batches; test 100k |
| Audit leaks PII | Redaction + Admin-only + test |
| Redis single point | Bypass cache/fail-open reads; health ready |

## Complexity Tracking

No violation. Cache only for the dashboard; no caching of other sensitive data.
