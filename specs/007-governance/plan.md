# Implementation Plan: Governance (Audit, Export, Rate Limit, Cache)

**Branch**: `007-governance` | **Date**: 2026-11-08 | **Spec**: `specs/007-governance/spec.md`

## Summary

Hoàn thiện lớp tin cậy/vận hành: audit viewer, export CSV streaming an toàn, rate limit theo user/IP/source,
và cache dashboard 60s với invalidation theo version. Đây là nền để 005/006/008 dùng lại.

## Technical Context

- **Backend**: modules `audit`, `exports`, `common/rate-limit`, `common/cache`.
- **Redis**: token bucket, cache key/version, single-flight (AI).
- **CSV**: stream + escape; `csv-stringify` hoặc tự implement.
- **Testing**: Jest/Supertest; fake Redis; perf audit 100k; export 100k.
- **Performance**: audit p95 < 300ms; cache hit < 50ms.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | DTO/filter typed | Pass |
| C2 phân lớp | AuditRepository/ExportService; controller mỏng | Pass |
| C3 org_id | mọi query org; cache key org | Pass |
| C4 audit | audit read-only; export ghi audit | Pass |
| C5 validate/error | filter/date/limit validate | Pass |
| C6 secret | không secret; audit redaction | Pass |
| C7 async | export stream; cache background? không cần | Pass |
| C8 test | role/tenant/cache invalidation | Pass |
| C9 PR nhỏ | T600–T608 | Pass |

## Audit

- Query `audit_logs` theo org + filter; cursor `(created_at,id)`; limit ≤ 100.
- `before/after` đã redact từ 003; audit viewer không trả secret.
- Không có route mutation; Nest không expose PATCH/DELETE.
- Index: `(org_id, created_at)`, `(org_id, entity, entity_id, created_at)`, `(org_id, actor_id, created_at)`.
- UI Admin: bảng, filter entity/actor/action/date, drawer diff.

## Export

```text
GET /exports/contacts?search=&ownerId=&source=
  → role Manager/Admin
  → count > 100k → 400
  → set headers text/csv, BOM
  → stream rows từ cursor (batch 500) → escape → response
  → audit EXPORT { filter, rowCount }
```

- Escape: nếu ô bắt đầu `= + - @ \t \r` → prefix `'`; luôn quote nếu chứa `, " \n`.
- Deals export join contact/stage/owner; không select cột secret.
- Không dùng `findMany` toàn bộ; dùng cursor/batch.
- Nếu client disconnect → dừng stream, log.

## Rate limit

- Redis key:
  - `rl:user:{userId}:{minute}` → count/token bucket.
  - `rl:ip:{ip}:{minute}` cho public/auth.
  - `rl:source:{sourceId}:{minute}` cho webhook.
- Dùng `rate-limiter-flexible` (Redis) hoặc Lua atomic; TTL 2 phút.
- Headers: `X-RateLimit-Limit/Remaining/Reset`, `Retry-After`.
- Middleware/guard order: auth → tenant → rate limit (trừ health/webhook).
- Redis lỗi:
  - auth/login + webhook: fail-closed 503/429.
  - đọc thường: fail-open, log warn, metric.
- Test boundary ±1; hai user độc lập; header đúng.

## Cache

```text
key = report:{orgId}:{role}:{userId|all}:{hash(canonical filters)}:{dataVersion}
dataVersion = GET org:{orgId}:data_version (default 0)
TTL = 60s

On mutation contact/deal/activity (after commit):
  INCR org:{orgId}:data_version
```

- Canonical filters: sort keys, bỏ undefined, date ISO.
- Cache value JSON; không cache lỗi.
- Redis lỗi → query DB trực tiếp.
- Không cache cross-user: Sales key có userId; Manager/Admin `all` nhưng vẫn org.
- Invalidation chỉ sau commit; rollback không bump.
- Single-flight (optional): lock `lock:report:{key}` 5s để tránh stampede; nếu không lấy được lock → query DB.

## API

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/audit-logs` | Admin |
| GET | `/exports/contacts` | Manager/Admin |
| GET | `/exports/deals` | Manager/Admin |

Rate limit/cache áp dụng middleware, không endpoint riêng.

## Testing

| Nhóm | Test |
| --- | --- |
| Audit | list/filter/pagination, role/tenant, no mutation, redaction |
| Export | columns/filters/100k/stream, injection, role/tenant, audit |
| Rate limit | 429/headers, boundary, Redis down fail modes |
| Cache | hit/miss/TTL, invalidation, key isolation, Redis down |
| Perf | audit 100k, export 100k memory |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| Cache key thiếu filter gây sai số | Canonicalize + test từng filter |
| Invalidation trễ | Bump sau commit; test E2E move → summary |
| Rate limit chặn nhầm | Key/user; burst; test nhiều user |
| Export OOM | Stream batch; test 100k |
| Audit lộ PII | Redaction + Admin-only + test |
| Redis single point | Bypass cache/fail-open đọc; health ready |

## Complexity Tracking

Không vi phạm. Cache chỉ cho dashboard; không cache dữ liệu nhạy cảm khác.
