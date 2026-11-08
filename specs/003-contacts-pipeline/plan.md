# Implementation Plan: Contacts, Pipeline & Deals

**Branch**: `003-contacts-pipeline` | **Date**: 2026-11-08 | **Spec**: `specs/003-contacts-pipeline/spec.md`

## Summary

Xây module contacts (CRUD/search/soft delete), pipeline/stage admin, deal CRUD + kanban move với fractional
position và optimistic lock, win/loss. Đây là lõi nghiệp vụ M1; audit + event là first-class.

## Technical Context

- **Backend**: NestJS modules `contacts`, `pipeline`, `deals`; Prisma; PostgreSQL trigram.
- **Frontend**: React Router, TanStack Query, dnd-kit, react-hook-form + zod, shadcn/ui.
- **Storage**: contacts, pipelines, stages, deals; composite FK; audit_logs.
- **Testing**: Jest/Supertest; Playwright; perf seed 10k/5k.
- **Performance**: list/search/board p95 < 300ms; move < 500ms.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | zod DTO/shared types; no any | Pass |
| C2 phân lớp | controller → service → repository; raw SQL trong repo | Pass |
| C3 org_id | Composite FK; repo nhận orgId; test tenant | Pass |
| C4 audit | transaction + AuditService cho mọi mutation | Pass |
| C5 validate/error | zod; conflict/validation codes | Pass |
| C6 secret | không secret ở feature | Pass |
| C7 async | event realtime sau commit; không block | Pass |
| C8 test | happy/lỗi/role/tenant + concurrency | Pass |
| C9 PR nhỏ | T200–T226 theo nhóm | Pass |

## Data Model (delta)

- `contacts`: partial unique lower(email); soft delete; trigram indexes.
- `pipelines`, `stages` (org_id, composite FK, won/lost partial unique).
- `deals`: composite FK `(org_id, pipeline_id, stage_id)`, version, position numeric, closed_at, status,
  lost_reason, check constraints.
- Chi tiết `docs/data-model.md` 4.4–4.7.

## API

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET/POST | `/contacts` | search/filter/cursor |
| GET/PATCH/DELETE | `/contacts/:id` | soft delete |
| GET/POST | `/pipelines` | Sales read; Admin write |
| PATCH/DELETE | `/pipelines/:id` | 409 nếu còn deal |
| POST | `/pipelines/:id/stages` | Admin |
| PATCH/DELETE | `/stages/:id` | reorder/won/lost |
| GET/POST | `/deals` | board/list |
| GET/PATCH | `/deals/:id` | version |
| PATCH | `/deals/:id/move` | stageId, position, version |
| PATCH | `/deals/:id/assign` | Manager/Admin |
| GET/POST | `/deals/:id/activities` | (feature 004 triển khai; route thuộc deals) |

## Search design

- Normalize term: trim, lowercase, unaccent (nếu dùng), escape `%`/`_`.
- Query contact trong org + owner scope + deleted null; `ILIKE` trên name/email/company.
- GIN trigram index; nếu `unaccent` không immutable, dùng generated column `search_text`.
- Cursor: `(created_at, id)` hoặc `(name, id)` tùy sort; base64 opaque.
- Perf test 10k; EXPLAIN phải dùng bitmap index scan, không seq scan.

## Kanban move design

```text
PATCH /deals/:id/move { stageId, position, version, lostReason? }

1. Load deal theo (orgId,id) + stage đích cùng pipeline.
2. Nếu stage đích is_won/is_lost: validate lostReason; set status/closed_at.
3. Tính position mới:
   - lấy neighbor theo position/id trong stage đích (loại deal hiện tại)
   - clamp index; midpoint; rebalance nếu precision < 1e-9
4. UPDATE ... WHERE id AND org_id AND version = :version
   - rowCount 0 → đọc lại → 409 currentVersion / 404
5. Audit DEAL_MOVED (before/after stage/position/status) cùng tx.
6. Sau commit: emit deal.moved (owner cũ/mới + managers).
```

## Frontend

- `/contacts`: table, search debounce 300ms, filter owner/source, cursor “Tải thêm”, create/edit dialog.
- `/pipelines`: admin list, stage editor, drag reorder (dnd-kit), won/lost toggle, delete guard.
- `/deals`: kanban columns theo stage, card value/owner/expected close, dnd-kit; optimistic update; 409 →
  toast + invalidate; assign menu (manager/admin); win/loss modal (lost reason required).
- Deal detail drawer: fields + timeline placeholder (004).
- Query keys: `['contacts', filters]`, `['deals', pipelineId, filters]`, `['deal', id]`.
- Optimistic move: snapshot, patch cache, rollback on error; version from deal.

## Audit & events

- Audit actions: `CONTACT_CREATED/UPDATED/DELETED`, `PIPELINE_*`, `STAGE_*`, `DEAL_CREATED/UPDATED/MOVED/
  ASSIGNED/WON/LOST/REOPENED`.
- `before/after` diff các field thay đổi; redact email/phone? Audit cần email để truy vết; giữ email, không
  log secret. (PII policy: audit nội bộ, Admin-only.)
- Domain event interface `DealMovedEvent` phát qua `EventBus` nội bộ; feature 005 nối Socket.IO.

## Testing

| Nhóm | Test |
| --- | --- |
| Contacts | CRUD, search, pagination, soft delete, duplicate, role/tenant, perf |
| Pipeline | CRUD, reorder, delete guards, won/lost, role/tenant |
| Deals | CRUD, board, move, version 409, concurrency, assign, validation, audit |
| Win/loss | won/lost/reopen, reason required, closed_at |
| UI | kanban optimistic + rollback, search, pipeline admin |
| E2E | login → contact → deal → move → won |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| Composite FK/migration phức tạp | Viết SQL migration, test từ DB trống; thứ tự bảng |
| Trigram/unaccent index | Thử migration trên PG16; fallback generated column |
| Position precision/rebalance | Unit test 100 chèn; property-based nếu cần |
| N+1 board | Query deals + stage một lần; include owner/contact tối thiểu |
| Optimistic UI sai khi 409 | Rollback + invalidate; E2E 2 context |
| Stale access sau đổi role | Guard đọc DB/cache (002) |

## Complexity Tracking

Không có vi phạm. Fractional position và composite FK là phức tạp có chủ đích, đã có ADR-014/ADR-002.
