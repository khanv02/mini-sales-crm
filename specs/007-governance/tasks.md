# Tasks: Governance (Audit, Export, Rate Limit, Cache)

**Input**: `specs/007-governance/`
**Prerequisites**: 003, 004; plan.md, spec.md
**Tests**: Bắt buộc. Cache invalidation/rate limit boundary phải test trước.

## Phase 1 — Audit

- [ ] **T600** Verify `audit_logs`/index từ `0001_init`; bổ sung index nếu thiếu;
      `test/integration/audit.spec.ts`: list/filter/pagination, Admin only, tenant, no mutation, redaction.
- [ ] **T601** `modules/audit/{repository,service,controller}.ts`: filters, cursor, DTO; frontend admin page
      bảng/diff; test p95 với 100k.

## Phase 2 — Export

- [ ] **T602** `apps/api/test/integration/exports.spec.ts` + `modules/exports`: contacts/deals, filters,
      stream, BOM, injection escape, 100k, role/tenant, audit EXPORT; frontend nút export.

## Phase 3 — Rate limit

- [ ] **T603** `apps/api/test/integration/rate-limit.spec.ts` + `common/rate-limit`: user 300/phút, auth
      5/15m; limiter generic cho webhook (wire ở 006 T512); headers; Redis down fail-closed/open; frontend 429 toast.

## Phase 4 — Cache

- [ ] **T604** `apps/api/test/integration/cache.spec.ts` + `common/cache`: key canonical, TTL 60s, hit/miss,
      role/user/org isolation, Redis down bypass.
- [ ] **T605** Apply cache vào `reports.summary`; bump `org:{id}:data_version` sau mọi mutation contact/
      deal/activity; test move → summary số mới.
- [ ] **T606** [P] Frontend audit page, export buttons, 429 handling; cache không ảnh hưởng UI.

## Phase 5 — Verification

- [ ] **T607** Perf: audit 100k, export 100k RAM, dashboard hit/miss; ghi báo cáo.
- [ ] **T608** Docs/traceability/checklists; security review (cache/export/rate limit).

## Dependencies

- T600–T601 sau audit 003/004.
- T602 độc lập sau data.
- T603 sau auth (002); limiter generic dùng cho webhook ở 006 T512.
- T604–T605 sau reports (004).
- T606 sau API.

## MVP checkpoint

Sau T605: audit/export/rate limit/cache đủ FR-13/14/15; dashboard invalidate đúng.

## Notes

- Cache chỉ dashboard; không cache list/kanban.
- Export streaming; không OOM.
- Rate limit auth/webhook fail-closed; đọc fail-open.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR13-01..05 | T600–T601, T606, T608 |
| AC-FR14-01..05 | T602, T606–T608 |
| AC-FR15-01..07 | T603–T607 |
| AC-NFR01-01..02 | T607 |
| AC-NFR02-01..04 | T603 |
- Audit không có endpoint sửa/xóa.
