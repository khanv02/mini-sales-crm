# Tasks: Integrations (Import, Webhook, Email)

**Input**: `specs/006-integrations/`
**Prerequisites**: 002, 003, 004; plan.md, spec.md
**Tests**: Bắt buộc. Idempotency/retry/HMAC phải có test trước.

## Phase 1 — Infrastructure

- [ ] **T500** Prisma/migration: import_jobs fields, webhook_sources secret encrypted/previous/default_owner,
      webhook_events attempts/processed; indexes; cập nhật data-model.
- [ ] **T501** Mở rộng `common/queue` từ 001 T020: queues `imports/webhooks/emails`, worker bootstrap,
      retry/DLQ, graceful shutdown; unit test config.
- [ ] **T502** [P] `common/storage`: ObjectStorage interface, local adapter, signed URL; test put/get/ttl.
- [ ] **T503** [P] Shared schemas: import row, webhook payload, email template data; CSV escape helper + test.

## Phase 2 — US1 Import CSV (P1)

### Tests first

- [ ] **T504** `apps/api/test/integration/imports.spec.ts`: 5k upload 202, progress, error report, duplicate
      email, same file, invalid header/size/rows, Sales 403, tenant.
- [ ] **T505** `apps/api/test/unit/import-worker.spec.ts`: chunk/retry/partial, duplicate in file, owner_email.

### Implementation

- [ ] **T506** `modules/imports/import.controller.ts` + service: multipart, role, hash, dedupe 24h, create job,
      save file, enqueue; 202.
- [ ] **T507** `import.worker.ts`: stream CSV, validate, insert/skip, audit per contact + summary, progress,
      error report, status; idempotent; emit `import.completed` sau commit.
- [ ] **T508** `GET /imports/:id`, `/errors`; frontend upload/progress/error download.

## Phase 3 — US2 Webhook (P1)

### Tests first

- [ ] **T509** `apps/api/test/integration/webhooks.spec.ts`: valid, invalid/missing signature, replay, duplicate
      key, conflict payload, inactive/unknown source, payload invalid, tenant.
- [ ] **T510** `apps/api/test/unit/webhook-worker.spec.ts`: retry 3, DEAD, no duplicate, upsert contact.

### Implementation

- [ ] **T511** `modules/webhooks/signature.service.ts`: raw body, timestamp, HMAC timing-safe, secret decrypt
      (AES-GCM), previous grace; unit test.
- [ ] **T512** `webhook.controller.ts`: public key/source, validate, insert event ON CONFLICT, enqueue, 202/
      409/401; body limit; áp rate limit webhook từ 007 T603.
- [ ] **T513** `webhook.worker.ts`: conditional PROCESSING, upsert contact, audit, status; DLQ; emit
      `webhook.failed` khi `DEAD`.
- [ ] **T514** `webhook-source` Admin CRUD/rotate; secret one-time; frontend admin page.
- [ ] **T515** Sweeper `RECEIVED` > 60s; test enqueue failure; docs.

## Phase 4 — US3 Email (P2)

### Tests first

- [ ] **T516** `apps/api/test/unit/mailer.spec.ts`: adapter/template/dedupe; Mailpit integration test.

### Implementation

- [ ] **T517** `modules/emails/mailer.service.ts` + templates `task-due`, `task-overdue`; queue; retry/DLQ.
- [ ] **T518** Nối scheduler 004 → email; dedupeKey; inactive/no email skip; test failure isolation.

## Phase 5 — Verification

- [ ] **T519** Full integration: upload 5k < 2 phút; webhook 2 lần 1 contact; email 10 scheduler runs no dup.
- [ ] **T520** Docs: events/queue, error codes, traceability; security review secret/log; PR checklist.

## Dependencies

- T500 → T501–T503.
- T504–T508 (import) sau T501/T502.
- T509–T515 (webhook) sau T501; cần T511 trước controller.
- T516–T518 sau T501 và scheduler 004.
- T512 cần limiter generic 007 T603 (007 chạy trước 006 theo thứ tự khuyến nghị).

## MVP checkpoint

Sau T508: import 5k chạy. Sau T515: webhook idempotent/retry pass. Sau T518: email nhắc việc.

## Notes

- Không gửi email thật ra ngoài org; Mailpit dev.
- Secret chỉ trả một lần; không log body/secret.
- Import ghi audit từng contact (batch insert) để tuân C4; đo perf.
- Worker có thể tách process; giữ queue/job name.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR10-01..08 | T500–T508, T519–T520 |
| AC-FR11-01..09 | T500, T509–T515, T519–T520 |
| AC-FR12-01..06 | T516–T520 |
| AC-NFR03-01..03 | T501, T519 |
