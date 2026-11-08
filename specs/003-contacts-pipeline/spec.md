# Feature Specification: Contacts, Pipeline & Deals

**Feature Branch**: `003-contacts-pipeline`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-03, FR-04, FR-05, FR-06; ADR-005, ADR-013, ADR-014; SCR-001, SCR-002

## User Scenarios & Testing

### US-1 — Quản lý contact (Priority: P1)

Sales tạo, tìm, sửa, xóa mềm contact của mình; Manager/Admin thấy toàn org.

**Vì sao P1**: Contact là nguồn lead; không có contact thì không có deal.

**Kiểm thử độc lập**: Tạo contact, search theo tên/email/công ty, sửa, xóa; kiểm tra Sales khác không thấy.

**Acceptance Scenarios**:

1. **AC-FR03-01** Given Sales, When tạo contact có name + email hợp lệ, Then `201`, owner = mình, audit
   `CONTACT_CREATED`, email lowercase.
2. **AC-FR03-02** Given 10.000 contact, When search `?search=...` + filter + `limit`, Then trả đúng, phân trang
   cursor, không trả contact đã xóa; p95 < 300ms.
3. **AC-FR03-03** Given Sales A và Sales B cùng org, When A list contact, Then chỉ thấy contact owner A;
   Manager/Admin thấy cả A và B; contact chưa gán chỉ Manager/Admin thấy.
4. **AC-FR03-04** Given contact của mình, When Sales cập nhật name/phone/company, Then `200`, audit
   before/after; When Sales B cập nhật contact A, Then `404`.
5. **AC-FR03-05** Given contact tồn tại, When DELETE, Then soft delete (`deleted_at`), biến mất khỏi list/search;
   contact cùng email được tạo lại sau đó.
6. **AC-FR03-06** Given email đã có trong org (chưa xóa), When tạo/sửa contact trùng, Then `409
   CONTACT_EMAIL_EXISTS`; email khác org được phép.
7. **AC-FR03-07** Given Sales, When tạo contact với `ownerId` người khác, Then `403`/`400`; owner luôn là mình.
8. **AC-FR03-08** Given Admin org B, When đọc/sửa/xóa contact org A bằng ID, Then `404`; DB không đổi.

---

### US-2 — Cấu hình pipeline & stage (Priority: P2)

Admin tạo pipeline, thêm/sửa/sắp xếp stage; không xóa stage còn deal; mỗi pipeline có stage thắng/thua.

**Vì sao P2**: Cần cho kanban; org mới có pipeline seed nên có thể demo trước khi làm UI admin.

**Kiểm thử độc lập**: Tạo pipeline 4 stage, reorder, thử xóa stage có deal, thử xóa stage cuối.

**Acceptance Scenarios**:

1. **AC-FR04-01** Given Admin, When tạo pipeline + stage, Then `201`, `org_id` đúng, position tăng dần, audit.
2. **AC-FR04-02** Given stage, When Admin đổi tên/position hoặc reorder, Then `200`, thứ tự đúng, audit;
   `is_won`/`is_lost` tối đa một mỗi pipeline.
3. **AC-FR04-03** Given stage còn deal, When Admin xóa, Then `409 STAGE_HAS_DEALS`, stage còn nguyên.
4. **AC-FR04-04** Given pipeline còn 1 stage hoặc thiếu stage won/lost, When xóa/đổi cờ, Then `409
   LAST_STAGE`/`WON_STAGE_REQUIRED`/`LOST_STAGE_REQUIRED`.
5. **AC-FR04-05** Given pipeline còn deal, When Admin xóa pipeline, Then `409 PIPELINE_HAS_DEALS`.
6. **AC-FR04-06** Given Manager/Sales, When gọi endpoint pipeline/stage ghi, Then `403`; đọc pipeline được.
7. **AC-FR04-07** Given Admin org B, When sửa pipeline/stage org A, Then `404`; không đổi DB.

---

### US-3 — Deal & kanban kéo thả (Priority: P1)

Sales tạo deal, kéo giữa stage; Manager/Admin xem toàn org; xung đột phiên bản trả 409.

**Vì sao P1**: Đây là giá trị cốt lõi (G1) và demo chính M1.

**Kiểm thử độc lập**: Tạo deal, list board, move, thử 2 move cùng version, kiểm tra audit + version.

**Acceptance Scenarios**:

1. **AC-FR05-01** Given contact + stage hợp lệ, When tạo deal, Then `201`, status `OPEN`, version 1, owner =
   current (hoặc người được Manager/Admin gán), currency = org, position cuối stage, audit.
2. **AC-FR05-02** Given pipeline, When `GET /deals?pipelineId=...`, Then trả deal theo stage/position; Sales
   chỉ deal của mình; Manager/Admin toàn org.
3. **AC-FR05-03** Given deal version N, When move `{stageId, position, version:N}`, Then `200`, stage/position/
   version N+1, audit `DEAL_MOVED` trong cùng transaction; event phát sau commit.
4. **AC-FR05-04** Given hai người cùng version N, When move đồng thời, Then một `200`, một `409
   DEAL_VERSION_CONFLICT` kèm `currentVersion`; DB chỉ có một kết quả; audit chỉ 1 bản ghi move.
5. **AC-FR05-05** Given người khác đã move, When client gửi version cũ, Then `409`; UI tải lại trạng thái mới.
6. **AC-FR05-06** Given Sales A và Sales B, When A move deal của B, Then `404`; Manager/Admin move được.
7. **AC-FR05-07** Given Manager/Admin, When `PATCH /deals/:id/assign` sang owner active cùng org, Then owner
   đổi, version tăng, audit `DEAL_ASSIGNED`, event; gán owner inactive/khác org → `400 INVALID_OWNER`.
8. **AC-FR05-08** Given value âm, currency khác org, stage khác pipeline, hoặc thiếu field, When tạo/sửa,
   Then `400` với code tương ứng; không ghi DB.
9. **AC-FR05-09** Given Admin org B, When move/read deal org A, Then `404`; không đổi DB.
10. **AC-FR05-10** Given 5.000 deal, When list board, Then p95 < 300ms; không N+1; index được dùng.

---

### US-4 — Chốt thắng/thua (Priority: P2)

Deal chuyển vào stage won/lost; thua bắt buộc lý do; reopen được.

**Vì sao P2**: Cần cho báo cáo và vòng đời deal; có thể làm sau kanban vài ngày.

**Kiểm thử độc lập**: Move sang won/lost; kiểm tra status, closed_at, lost_reason; reopen.

**Acceptance Scenarios**:

1. **AC-FR06-01** Given deal OPEN, When move sang stage `is_won`, Then `status=WON`, `closed_at` set,
   `lost_reason=null`, audit.
2. **AC-FR06-02** Given deal OPEN, When move sang stage `is_lost` thiếu `lostReason`, Then `400
   LOST_REASON_REQUIRED`; deal không đổi.
3. **AC-FR06-03** Given move sang lost có lý do, Then `status=LOST`, `closed_at` set, `lost_reason` lưu, audit.
4. **AC-FR06-04** Given deal WON/LOST, When move về stage OPEN, Then `status=OPEN`, `closed_at=null`,
   `lost_reason=null`, audit; báo cáo cập nhật.
5. **AC-FR06-05** Given deal WON, When đọc dashboard/report (004), Then tính theo `closed_at`; không dùng
   `updated_at`; audit và status nhất quán.

### Edge Cases

- Contact bị xóa mềm nhưng còn deal → deal vẫn đọc được; tạo deal mới với contact đã xóa → 400.
- Stage bị xóa khi có deal → chặn 409; deal không mồ côi.
- Move sang stage cùng pipeline nhưng position ngoài range → clamp đầu/cuối, không lỗi.
- Position giữa hai card quá nhỏ → rebalance stage, vẫn giữ thứ tự.
- Xóa stage won/lost cuối → chặn; đổi cờ won/lost khi đã có stage khác → 409.
- Sales tạo deal với contact không sở hữu → 404 (che tồn tại).
- Hai request tạo contact cùng email đồng thời → unique DB, một 409.
- Search term rỗng/ký tự đặc biệt → trả list mặc định hoặc 400; không SQL injection.
- Pipeline không có stage → không cho tạo deal; seed luôn có stage.

## Requirements

### Functional Requirements

**Contacts**

- **FR-03.1**: CRUD contact; name bắt buộc; email/phone optional; email lowercase; soft delete.
- **FR-03.2**: List/search/filter theo `search` (name/email/company), `ownerId`, `source`, `createdFrom/To`;
  cursor pagination; limit ≤ 100.
- **FR-03.3**: Sales chỉ owner; Manager/Admin toàn org; contact chưa gán chỉ Manager/Admin.
- **FR-03.4**: Unique `(org_id, lower(email))` khi chưa xóa; map lỗi `CONTACT_EMAIL_EXISTS`.
- **FR-03.5**: Search dùng trigram + unaccent; p95 < 300ms với 10k; index như data-model.
- **FR-03.6**: Sales không đổi owner; Manager/Admin được assign qua `PATCH /deals/:id/assign` (bắt buộc, AC-FR05-07).

**Pipeline**

- **FR-04.1**: Admin CRUD pipeline/stage; stage position numeric; reorder transaction.
- **FR-04.2**: Mỗi pipeline tối đa 1 won + 1 lost; ít nhất 1 stage; không xóa stage cuối.
- **FR-04.3**: Không xóa stage/pipeline còn deal → 409.
- **FR-04.4**: Sales đọc pipeline/stage; không ghi.

**Deals**

- **FR-05.1**: Create/read/update deal; status do server; version; currency = org; owner hợp lệ.
- **FR-05.2**: Board query theo pipeline, group stage, sort position/id; cursor theo stage nếu cần.
- **FR-05.3**: Move `{stageId, position, version}`; fractional position; audit + domain event sau commit.
- **FR-05.4**: Optimistic lock; 0 row → 409 kèm currentVersion; không retry tự động.
- **FR-05.5**: Assign owner Manager/Admin; Sales không.
- **FR-05.6**: RBAC/tenant như permissions matrix.

**Win/loss**

- **FR-06.1**: `status` suy ra từ stage; `closed_at` set/clear; `lost_reason` bắt buộc khi LOST.
- **FR-06.2**: Reopen hợp lệ; audit.
- **FR-06.3**: DB check constraint khớp service.

### Key Entities

- Contact, Pipeline, Stage, Deal; chi tiết `docs/data-model.md` mục 4.4–4.7.
- Audit log cho mọi mutation; domain event `deal.moved`, `deal.assigned` (tiêu thụ ở 005).

## Success Criteria

- **SC-001**: Luồng tạo contact → deal → kéo stage → won chạy < 30s thao tác.
- **SC-002**: 100% AC có test; 100% endpoint có tenant/role test.
- **SC-003**: p95 list/search/board < 300ms với seed 10k/5k.
- **SC-004**: 0 mất dữ liệu khi 2 người move đồng thời; luôn có 409 cho người sau.
- **SC-005**: Mọi mutation có audit đúng before/after (đã redact).

## Assumptions

- Mỗi deal gắn đúng 1 contact, 1 pipeline, 1 stage; contact có thể có nhiều deal.
- Deal không có API xóa cứng trong MVP; kết thúc bằng WON/LOST.
- Một org có thể có nhiều pipeline; UI MVP mặc định pipeline đầu tiên.
- Currency = org currency; chưa đa tiền tệ.
- Position do server tính; client gửi index đích.
- Event realtime được phát ngay cả khi feature 005 chưa có (dùng event bus nội bộ; gateway sau).

## Out of Scope

- Custom fields, tags, attachments.
- Merge contact, import (feature 006), bulk edit.
- Deal products/line items, discount, tax.
- Multi-currency/FX.
- Pipeline probability/weighted forecast.
- Hard delete/restore deal.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-03 | AC-FR03-01..08 | T200–T208, T221, T226 |
| FR-04 | AC-FR04-01..07 | T209–T211, T222 |
| FR-05 | AC-FR05-01..10 | T212–T217, T223–T224 |
| FR-06 | AC-FR06-01..05 | T218–T220, T224 |
| NFR-01 | AC-NFR01-01..02 | T205, T226 |
