# Implementation Plan: Integrations (Import, Webhook, Email)

**Branch**: `006-integrations` | **Date**: 2026-11-08 | **Spec**: `specs/006-integrations/spec.md`

## Summary

Thêm BullMQ worker cho import CSV, webhook lead và email nhắc việc. Trọng tâm: idempotency, HMAC an toàn,
retry/DLQ, không chặn request, không rò secret.

## Technical Context

- **Backend**: `@nestjs/bullmq`, BullMQ, Redis; `csv-parse`, `busboy`/multer, `nodemailer`.
- **Storage**: import_jobs, webhook_sources/events; storage local/S3 adapter.
- **Crypto**: AES-256-GCM cho webhook secret; HMAC-SHA256 timing-safe.
- **Testing**: Jest + Redis thật; Mailpit; fake worker; Supertest raw body.
- **Performance**: upload 5k → 202 < 1s; xử lý < 2 phút local.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | zod payload/CSV types; no any | Pass |
| C2 phân lớp | controller → service → repo; worker gọi service | Pass |
| C3 org_id | job/event mang orgId; worker re-check | Pass |
| C4 audit | import contact/webhook contact create audit | Pass |
| C5 validate/error | CSV/HMAC/payload codes | Pass |
| C6 secret | AES key env; secret không log/response | Pass |
| C7 async | toàn bộ nặng qua queue | Pass |
| C8 test | idempotency/retry/tenant/role | Pass |
| C9 PR nhỏ | T500–T520 | Pass |

## Data Model

- `import_jobs`: file_hash, created_by, progress, error_report_key, timestamps.
- `webhook_sources`: secret_ciphertext, last4, previous_* (grace), default_owner, active.
- `webhook_events`: idempotency unique, status, attempts, last_error, processed_at.
- Chi tiết `docs/data-model.md` 4.10–4.12.

## Import flow

```text
POST /imports/contacts (multipart)
  → role Manager/Admin
  → validate size/type/rows; hash file
  → if same (org,hash) in 24h: return existing job
  → create job PENDING; save file to storage; enqueue import-contacts
  → 202 { jobId }

Worker:
  → set PROCESSING/started_at; stream CSV (chunk 500)
  → validate header; for each row:
      normalize email; validate; lookup owner_email
      insert/upsert contact (skip duplicate); audit per created (or batch audit)
      count success/failed; append error CSV
  → set COMPLETED/PARTIAL/FAILED; finished_at; store error report
  → emit import.completed (005)
```

- Audit: một bản ghi `IMPORT_CONTACTS` tổng hợp + từng contact? C4 nói mọi thay đổi; để tránh 5k audit row,
  ghi audit từng contact là đúng nhưng nặng. Quyết định: ghi audit từng contact (batch insert) để tuân C4;
  thêm audit job summary. Nếu quá tải, tối ưu batch insert.
- Retry: job idempotent theo unique email + status; nếu chạy lại, bỏ qua contact đã tạo bởi job (dùng
  `source`/audit? đơn giản: unique email + upsert skip).

## Webhook flow

```text
POST /webhooks/leads/:publicKey (raw body)
  → find source by publicKey + active (404/401)
  → parse X-Pulse-Signature t,v1; check |now-t|<=300
  → HMAC(secret or previous grace) timingSafeEqual → 401
  → require Idempotency-Key
  → validate payload (name, email)
  → insert webhook_events ON CONFLICT DO NOTHING
      - existing same key: if payload same → 202 same id; else 409
  → enqueue process-webhook; 202
  → if enqueue fails: event RECEIVED; 500; sweeper retries

Worker:
  → set PROCESSING (conditional)
  → upsert contact by (org,email): create or update missing fields
  → audit CONTACT_UPSERTED
  → PROCESSED; emit
  → on error: attempts++, FAILED; if attempts>=3 → DEAD + notify Admin
```

- Secret: AES-256-GCM; `secret_last4`; plaintext only on create/rotate; previous secret grace 24h.
- Body limit 256KB; JSON parse lỗi → 400; không log body đầy đủ.
- Replay: timestamp + idempotency key; cùng key khác payload → 409.

## Email flow

```text
Scheduler (004) tạo notification TASK_DUE/OVERDUE
  → enqueue emails/send-email { to, template, data, dedupeKey }
  → jobId = email:{dedupeKey}; worker checks sent/dedupe
  → Mailer adapter (Mailpit dev) → success log
  → fail: retry 3 backoff → DLQ; task unaffected
```

- Templates: `task-due`, `task-overdue`; tiếng Việt; link tới deal.
- Không gửi nếu assignee inactive/không email.
- Không log subject/body đầy đủ; chỉ template/to/dedupeKey.

## Storage

- Interface `ObjectStorage { put(key, stream), getSignedUrl(key, ttl), delete(key) }`.
- Dev: local volume `./.data/uploads`; prod: S3-compatible (MinIO/S3) qua env.
- Key: `org/{orgId}/imports/{jobId}/errors.csv`; signed URL 15 phút.
- Xóa file tạm sau xử lý; error report giữ 7 ngày (retention đề xuất).

## API

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/imports/contacts` | Manager/Admin |
| GET | `/imports/:id` | progress |
| GET | `/imports/:id/errors` | signed URL hoặc stream |
| POST | `/webhooks/leads/:publicKey` | public + HMAC |
| GET/POST | `/webhook-sources` | Admin |
| PATCH/DELETE | `/webhook-sources/:id` | Admin |
| POST | `/webhook-sources/:id/rotate-secret` | trả secret một lần |

## Testing

| Nhóm | Test |
| --- | --- |
| Import | 5k, progress, error report, duplicate, same file, invalid, role/tenant |
| Webhook | signature/replay/idempotency/retry/DLQ/secret rotate |
| Email | Mailpit, dedupe, failure isolation, inactive |
| Queue | retry/backoff, worker restart, sweeper |
| Security | secret not in log/response; body limit; timing-safe |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| HMAC raw body bị Nest parse | `rawBody: true`; verify trước JSON parse |
| Secret lộ | AES-GCM, không log, chỉ trả một lần; test |
| Import 5k audit nặng | Batch insert trong transaction; đo perf |
| Worker trùng | unique + status conditional + jobId |
| DLQ đầy | Alert/metric; Admin UI/script retry |
| File lớn/zip bomb | Giới hạn size/row; stream; không giải nén |
| Email spam | Chỉ nội bộ; dedupe; không gửi ngoài org |

## Complexity Tracking

Không vi phạm. Encryption secret và outbox/sweeper là phức tạp bắt buộc để đáp ứng FR-11.
