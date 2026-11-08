# Feature Specification: Governance (Audit, Export, Rate Limit, Cache)

**Feature Branch**: `007-governance`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-13, FR-14, FR-15; C4; NFR-01, NFR-02; SCR-013, SCR-014

## User Scenarios & Testing

### US-1 — Audit log (Priority: P1)

Admin xem ai đã làm gì, khi nào, trước/sau; lọc theo entity/actor/thời gian.

**Vì sao P1**: C4 và FR-13; là bằng chứng tin cậy/portfolio.

**Kiểm thử độc lập**: Thực hiện mutation; mở audit; filter; thử role/tenant; thử sửa/xóa audit.

**Acceptance Scenarios**:

1. **AC-FR13-01** Given Admin, When `GET /audit-logs`, Then danh sách mới nhất trước, cursor, có
   actor/entity/action/before/after/createdAt/requestId.
2. **AC-FR13-02** Given filter `entity`, `entityId`, `actorId`, `action`, `from/to`, When query, Then đúng
   kết quả; filter sai → 400; kết hợp được.
3. **AC-FR13-03** Given nhiều bản ghi, When phân trang, Then cursor ổn định, không trùng/thiếu khi có bản ghi mới.
4. **AC-FR13-04** Given Manager/Sales, When gọi audit, Then `403`; Admin org B → `404`/không thấy org A.
5. **AC-FR13-05** Given bất kỳ request sửa/xóa audit, When gọi, Then `404/405`; audit không đổi. Audit đã
   redact password/token/secret.

---

### US-2 — Export CSV (Priority: P2)

Manager/Admin export contacts/deals theo filter; file đúng, an toàn CSV injection.

**Vì sao P2**: FR-14; hữu ích vận hành nhưng không chặn demo.

**Kiểm thử độc lập**: Export với filter; mở file; kiểm tra cột/số dòng/escape; thử Sales.

**Acceptance Scenarios**:

1. **AC-FR14-01** Given Manager/Admin, When export contacts với filter, Then `200 text/csv`, UTF-8 BOM, đúng
   số dòng, không có contact đã xóa.
2. **AC-FR14-02** Given Manager/Admin, When export deals, Then cột `title,contact,stage,value,currency,owner,
   status,expectedClose,closedAt,createdAt`; filter khớp list.
3. **AC-FR14-03** Given ô bắt đầu `=,+,-,@`, When export, Then được escape (prefix `'`) và bọc quote; mở
   Excel không thực thi công thức.
4. **AC-FR14-04** Given Sales, When export, Then `403`; org khác → không thấy dữ liệu; export được audit.
5. **AC-FR14-05** Given > 100.000 dòng, When export, Then `400 EXPORT_TOO_LARGE`; stream không giữ toàn bộ
   trong RAM.

---

### US-3 — Rate limit & cache (Priority: P1)

Hệ thống giới hạn theo user/IP; dashboard cache 60s và vô hiệu khi dữ liệu đổi.

**Vì sao P1**: FR-15/NFR-01; bảo vệ API và giữ p95.

**Kiểm thử độc lập**: Bắn request vượt ngưỡng; đo headers; gọi dashboard 2 lần; move deal; gọi lại.

**Acceptance Scenarios**:

1. **AC-FR15-01** Given user đã đăng nhập, When vượt 300 request/phút, Then `429 RATE_LIMITED` +
   `Retry-After` + headers limit; các user khác không bị ảnh hưởng.
2. **AC-FR15-02** Given login sai 5 lần/15 phút, When thử tiếp, Then `429 TOO_MANY_ATTEMPTS` (FR-01).
3. **AC-FR15-03** Given webhook source, When vượt 60 request/phút, Then `429`; không tạo event.
4. **AC-FR15-04** Given dashboard gọi lần đầu, When gọi trong 60s, Then lần 2 lấy cache (nhanh, cùng số);
   TTL 60s.
5. **AC-FR15-05** Given cache dashboard, When tạo/sửa/move deal hoặc contact/activity, Then cache bị vô hiệu;
   lần gọi sau trả số mới (không chờ TTL).
6. **AC-FR15-06** Given Redis lỗi, When gọi API đọc, Then vẫn trả dữ liệu (bypass cache); login/webhook
   fail-closed; log warn; `/health/ready` 503.
7. **AC-FR15-07** Given Sales A/B, When gọi dashboard, Then cache key tách theo org/user/role/filter; A không
   nhận số của B/org khác.

### Edge Cases

- Cache key chứa filter order khác nhau → canonicalize để hit.
- Mutation rollback → không bump version/invalidate (chỉ sau commit).
- Nhiều instance → invalidation qua Redis version, không cache local.
- Rate limit burst/boundary → token bucket; không chặn nhầm toàn org.
- Audit filter thời gian rất rộng → giới hạn 366 ngày/400.
- Export trong lúc dữ liệu đổi → snapshot nhất quán (transaction read repeatable nếu cần).
- CSV có newline trong content → quote đúng.
- Audit before/after quá lớn → cắt + cờ `truncated`.

## Requirements

### Functional Requirements

**Audit**

- **FR-13.1**: `GET /audit-logs` Admin; filters entity/entityId/actorId/action/from/to; cursor; max 100.
- **FR-13.2**: Audit append-only; không endpoint mutation; redaction secret/PII; requestId/ip.
- **FR-13.3**: Index theo org/time/entity/actor; p95 < 300ms với 100k bản ghi (nếu có).

**Export**

- **FR-14.1**: `GET /exports/contacts`, `/exports/deals` Manager/Admin; filter giống list.
- **FR-14.2**: Stream CSV, UTF-8 BOM, escape injection, max 100k, filename có ngày.
- **FR-14.3**: Audit `EXPORT` với filter/rowCount; không log nội dung file.
- **FR-14.4**: Sales 403; tenant isolation.

**Rate limit & cache**

- **FR-15.1**: Redis token bucket theo user (300/phút, burst 60), IP cho public/auth, source cho webhook.
- **FR-15.2**: 429 + `Retry-After` + `X-RateLimit-*`; auth fail-closed, đọc fail-open.
- **FR-15.3**: Dashboard cache 60s, key `report:{orgId}:{role}:{userId|all}:{filtersHash}:{dataVersion}`;
  invalidate bằng bump `org:{orgId}:data_version` sau mọi mutation contact/deal/activity.
- **FR-15.4**: Redis lỗi → bypass cache/limit theo quy tắc; không trả dữ liệu org khác.
- **FR-15.5**: Không cache dữ liệu nhạy cảm khác ngoài dashboard (trừ AI cache ở 008).

### Key Entities

- AuditLog (4.13); cache key/version trong Redis; không thêm bảng.
- Export dùng dữ liệu Contact/Deal hiện có.

## Success Criteria

- **SC-001**: Dashboard hit cache < 50ms; miss < 300ms p95.
- **SC-002**: 0 cache key rò dữ liệu giữa user/org (test).
- **SC-003**: Rate limit chính xác ±1 request tại boundary; headers đúng.
- **SC-004**: 100% mutation invalidate cache trong < 100ms sau commit.
- **SC-005**: 100% AC có test; export 100k dòng không OOM (< 200MB).

## Assumptions

- Redis là cache/rate limit store; không phải nguồn sự thật.
- Dashboard cache chỉ cho `GET /reports/summary`; list/kanban không cache ở MVP.
- Export chạy đồng bộ streaming; 100k dòng chấp nhận vài giây; nếu lớn hơn sẽ chuyển queue sau.
- Audit retention chưa tự động (Q9).
- Rate limit dùng thư viện `rate-limiter-flexible` hoặc implementation Redis atomic.

## Out of Scope

- Audit retention/archival job, SIEM export.
- Export Excel/PDF, scheduled export.
- Per-org custom rate limit UI.
- Cache toàn bộ API, CDN.
- Anomaly detection.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-13 | AC-FR13-01..05 | T600–T601, T606, T608 |
| FR-14 | AC-FR14-01..05 | T602, T606–T608 |
| FR-15 | AC-FR15-01..07 | T603–T607 |
| NFR-01 | AC-NFR01-01..02 | T607 |
| NFR-02 | AC-NFR02-01..04 | T603 |
