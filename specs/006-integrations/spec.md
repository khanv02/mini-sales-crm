# Feature Specification: Integrations (Import, Webhook, Email)

**Feature Branch**: `006-integrations`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-10, FR-11, FR-12; ADR-004, ADR-008, ADR-011; SCR-003, SCR-006

## User Scenarios & Testing

### US-1 — Import CSV contacts (Priority: P1)

Manager/Admin tải CSV 5.000 dòng; nhận job id ngay; theo dõi tiến độ; tải báo cáo lỗi; chạy lại không trùng.

**Vì sao P1**: FR-10 có AC hiệu năng/idempotency rõ; là cách đưa dữ liệu thật vào CRM.

**Kiểm thử độc lập**: Upload file seed 5.000 dòng; poll job; tải error report; upload lại; đếm contact.

**Acceptance Scenarios**:

1. **AC-FR10-01** Given Manager/Admin, When upload CSV hợp lệ ≤ 5.000 dòng/10MB, Then `202` trong < 1s,
   trả `jobId`; xử lý nền.
2. **AC-FR10-02** Given job đang chạy, When `GET /imports/:id`, Then `status/total/success/failed/progress`;
   khi xong `COMPLETED` hoặc `PARTIAL`/`FAILED`.
3. **AC-FR10-03** Given job có dòng lỗi, When `GET /imports/:id/errors`, Then tải CSV gồm `row,error_code,
   error_message`; URL ký hết hạn; job chưa xong → `409 IMPORT_NOT_READY`.
4. **AC-FR10-04** Given email đã tồn tại trong org, When import dòng đó, Then bỏ qua, tăng `failed`, ghi lỗi
   `DUPLICATE_EMAIL`; không tạo trùng; các dòng khác vẫn xử lý.
5. **AC-FR10-05** Given cùng file (SHA-256) đã upload trong 24h, When upload lại, Then trả cùng `jobId`
   (hoặc job mới nhưng 0 contact trùng); contact không tăng; `failed` ghi lý do.
6. **AC-FR10-06** Given file sai header/quá 5.000 dòng/rỗng, When upload, Then `400` với code tương ứng
   (`IMPORT_INVALID_HEADER`/`IMPORT_TOO_MANY_ROWS`/`IMPORT_EMPTY`); file quá 10MB → `413 PAYLOAD_TOO_LARGE`
   (xem `docs/error-codes.md`); không tạo job.
7. **AC-FR10-07** Given Sales, When upload/đọc job, Then `403`; Manager/Admin org khác → `404`.
8. **AC-FR10-08** Given Admin org B, When đọc job org A, Then `404`; worker không ghi chéo org.

---

### US-2 — Webhook nhận lead (Priority: P1)

Form web bên ngoài gửi lead bằng public key + HMAC; hệ thống trả nhanh, xử lý nền, chống trùng/retry.

**Vì sao P1**: FR-11 có nhiều AC bảo mật/idempotency; là điểm tích hợp thực tế.

**Kiểm thử độc lập**: Tạo source; ký payload; gửi 2 lần; kiểm tra 1 contact; thử sai chữ ký/replay; xem DLQ.

**Acceptance Scenarios**:

1. **AC-FR11-01** Given source active + chữ ký HMAC đúng + timestamp mới, When POST lead, Then `202` nhanh,
   event `RECEIVED`, worker tạo contact (owner = default nếu có), audit, event `PROCESSED`.
2. **AC-FR11-02** Given chữ ký sai/thiếu, When POST, Then `401 WEBHOOK_SIGNATURE_INVALID`; không tạo event.
3. **AC-FR11-03** Given timestamp lệch > 300s hoặc replay, When POST, Then `401 WEBHOOK_TIMESTAMP_INVALID`;
   không tạo event.
4. **AC-FR11-04** Given cùng `Idempotency-Key` gửi 2 lần, When POST, Then cả hai `202` cùng `eventId`;
   chỉ 1 contact/1 event; payload khác cùng key → `409 WEBHOOK_EVENT_CONFLICT`.
5. **AC-FR11-05** Given payload thiếu name/email sai format, When POST, Then `400 WEBHOOK_PAYLOAD_INVALID`;
   event không vào queue hoặc vào `FAILED` với lý do (không retry vô hạn).
6. **AC-FR11-06** Given worker lỗi tạm, When retry, Then tối đa 3 lần backoff; hết → `DEAD`, thông báo Admin,
   không tạo contact trùng.
7. **AC-FR11-07** Given source inactive/public key sai, When POST, Then `401 WEBHOOK_SOURCE_INACTIVE`/
   `404 WEBHOOK_SOURCE_NOT_FOUND`.
8. **AC-FR11-08** Given Admin tạo source, When response, Then trả `publicKey` + secret **một lần**;
   `GET /webhook-sources` không trả secret; rotate giữ secret cũ grace 24h.
9. **AC-FR11-09** Given Admin org B, When quản lý source org A, Then `404`; webhook org A không tạo contact org B.

---

### US-3 — Email nhắc việc qua queue (Priority: P2)

Task đến hạn/quá hạn gửi email nội bộ qua queue; lỗi email không ảnh hưởng task.

**Vì sao P2**: FR-12; cần Mailpit/queue, nhưng notification DB + realtime đã đủ cho demo.

**Kiểm thử độc lập**: Tạo task due gần; chạy scheduler; xem Mailpit; chạy lại không gửi trùng; tắt Mailpit.

**Acceptance Scenarios**:

1. **AC-FR12-01** Given task due trong 24h, When scheduler chạy, Then enqueue email nhắc assignee; Mailpit
   nhận đúng subject/recipient.
2. **AC-FR12-02** Given job email đã gửi, When scheduler/retry chạy lại, Then không gửi trùng (dedupeKey).
3. **AC-FR12-03** Given Mailpit/provider lỗi, When gửi, Then retry 3 lần; task/deal không đổi; notification
   vẫn còn; log lỗi.
4. **AC-FR12-04** Given assignee inactive hoặc không có email, When nhắc, Then bỏ qua email, ghi log;
   không fail scheduler.
5. **AC-FR12-05** Given an overdue task, When the scheduler runs, Then the email is sent once for the
   `task:{id}:overdue` bucket; no repeats every minute.
6. **AC-FR12-06** Given Admin org B, When xem email/log org A, Then không có endpoint/không thấy; job chỉ
   dùng dữ liệu org A.

### Edge Cases

- CSV có BOM, CRLF, dấu tiếng Việt → parse đúng; UTF-8.
- CSV có dòng trùng email trong cùng file → dòng đầu thắng, dòng sau lỗi `DUPLICATE_IN_FILE`.
- Import bị dừng giữa chừng (worker restart) → job `PROCESSING` được retry; không nhân đôi contact.
- File hash trùng nhưng nội dung đổi 1 byte → job mới; unique email vẫn bảo vệ.
- Webhook body quá lớn → 413; JSON sai → 400.
- Webhook gửi đồng thời cùng key → unique DB, một event; request còn lại trả cùng event.
- Rotate secret đang có request bay → grace 24h chấp nhận cả secret cũ/mới.
- Email template lỗi → job fail/DLQ; không chặn task.
- Recipient không tồn tại → log, không retry vô hạn.

## Requirements

### Functional Requirements

**Import**

- **FR-10.1**: `POST /imports/contacts` multipart; Manager/Admin; validate extension/MIME/size/rows; hash file;
  trả 202 job.
- **FR-10.2**: Worker `imports` đọc stream, chunk 500, validate từng dòng, upsert/skip theo email; cập nhật
  progress; retry 3; DLQ.
- **FR-10.3**: Idempotency theo `(org_id,file_hash)` 24h; unique email; báo cáo lỗi CSV lưu storage, URL ký.
- **FR-10.4**: Header cố định `name,email,phone,company,source,owner_email`; email bắt buộc cho import;
  owner mặc định actor; owner_email lạ → row error.
- **FR-10.5**: Không block request; không giữ file trong RAM quá chunk; xóa file tạm sau xử lý.

**Webhook**

- **FR-11.1**: `POST /webhooks/leads/:publicKey` public; raw body; HMAC-SHA256 `${t}.${body}`; timestamp
  ±300s; timing-safe; body ≤ 256KB.
- **FR-11.2**: `Idempotency-Key` bắt buộc; unique `(org_id,key)`; insert event trước, enqueue sau; 202.
- **FR-11.3**: Worker retry 3 backoff; `DEAD` + notification Admin; contact upsert theo email; audit.
- **FR-11.4**: Admin CRUD webhook source; secret mã hóa AES-256-GCM; rotate grace 24h; không trả lại secret.
- **FR-11.5**: source inactive/public key sai → 401/404; payload validate; không log secret/body đầy đủ.

**Email**

- **FR-12.1**: Queue `emails`; Mailpit dev; adapter provider; template tiếng Việt; retry 3; DLQ.
- **FR-12.2**: Scheduler task due/overdue tạo notification (004) + email; dedupe bucket; không gửi trùng.
- **FR-12.3**: Email lỗi không ảnh hưởng task/deal; không gửi cho user inactive/không email.
- **FR-12.4**: Không gửi email ra ngoài org trong M2; chỉ user nội bộ.

### Key Entities

- ImportJob, WebhookSource, WebhookEvent, Notification; chi tiết `docs/data-model.md` mục 4.9–4.12.
- Storage abstraction cho file CSV/error report (local dev, S3-compatible prod).

## Success Criteria

- **SC-001**: Upload 5.000 dòng trả 202 < 1s; xử lý xong < 2 phút local.
- **SC-002**: 0 contact trùng khi chạy lại cùng file; 0 event trùng khi gửi lại cùng key.
- **SC-003**: 100% webhook sai chữ ký/replay bị chặn; secret không xuất hiện trong log/response.
- **SC-004**: Email lỗi không làm fail task; 0 email trùng khi scheduler chạy 10 lần.
- **SC-005**: 100% AC có test; 100% endpoint có role/tenant test.

## Assumptions

- File CSV do người dùng cung cấp; không có UI mapping cột ở MVP.
- Import chỉ contacts, không import deal/activity.
- Webhook chỉ tạo/cập nhật contact, không tạo deal.
- Owner mặc định của webhook = `default_owner_id`; nếu null → contact chưa gán (Manager/Admin thấy).
- Email chỉ nhắc task; email follow-up thủ công/AI draft thuộc 008 (chưa auto-send).
- Storage local dùng volume; production dùng S3-compatible (chưa implement adapter đầy đủ nếu không cần).

## Out of Scope

- Import deal/activity, Excel, Google Sheets.
- Field mapping UI, preview, undo import.
- Webhook outbound (ta chỉ nhận), chữ ký phía ta gửi đi.
- Email marketing, unsubscribe, bounce/complaint handling.
- Gửi email thật tới khách hàng ngoài org.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-10 | AC-FR10-01..08 | T500–T508, T519–T520 |
| FR-11 | AC-FR11-01..09 | T500, T509–T515, T519–T520 |
| FR-12 | AC-FR12-01..06 | T516–T520 |
| NFR-03 | AC-NFR03-01..03 | T501, T519 |
