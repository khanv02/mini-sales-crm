# Tasks: Integrations (Import, Webhook, Email)

**Input**: `specs/006-integrations/`
**Prerequisites**: 002, 003, 004; plan.md, spec.md
**Tests**: Mandatory. Idempotency/retry/HMAC must have tests first.

## Phase 1 — Infrastructure

- [ ] **T500** Prisma/migration: import_jobs fields, webhook_sources secret encrypted/previous/default_owner,
      webhook_events attempts/processed; indexes; update data-model.
- [ ] **T501** Extend `common/queue` from 001 T020: queues `imports/webhooks/emails`, worker bootstrap,
      retry/DLQ, graceful shutdown; unit test config.
- [ ] **T502** [P] `common/storage`: ObjectStorage interface, local adapter, signed URL; test put/get/ttl.
- [ ] **T503** [P] Shared schemas: import row, webhook payload, email template data; CSV escape helper + test.

## Phase 2 — US1 Import CSV (P1)

### Tests first

- [ ] **T504** `backend/test/integration/imports.spec.ts`: 5k upload 202, progress, error report, duplicate
      email, same file, invalid header/size/rows, Sales 403, tenant.
- [ ] **T505** `backend/test/unit/import-worker.spec.ts`: chunk/retry/partial, duplicate in file, owner_email.

### Implementation

- [ ] **T506** `modules/imports/import.controller.ts` + service: multipart, role, hash, dedupe 24h, create job,
      save file, enqueue; 202.
- [ ] **T507** `import.worker.ts`: stream CSV, validate, insert/skip, audit per contact + summary, progress,
      error report, status; idempotent; emit `import.completed` after commit.
- [ ] **T508** `GET /imports/:id`, `/errors`; frontend upload/progress/error download.

## Phase 3 — US2 Webhook (P1)

### Tests first

- [ ] **T509** `backend/test/integration/webhooks.spec.ts`: valid, invalid/missing signature, replay, duplicate
      key, conflict payload, inactive/unknown source, payload invalid, tenant.
- [ ] **T510** `backend/test/unit/webhook-worker.spec.ts`: retry 3, DEAD, no duplicate, upsert contact.

### Implementation

- [ ] **T511** `modules/webhooks/signature.service.ts`: raw body, timestamp, HMAC timing-safe, secret decrypt
      (AES-GCM), previous grace; unit test.
- [ ] **T512** `webhook.controller.ts`: public key/source, validate, insert event ON CONFLICT, enqueue, 202/
      409/401; body limit; apply the webhook rate limit from 007 T603.
- [ ] **T513** `webhook.worker.ts`: conditional PROCESSING, upsert contact, audit, status; DLQ; emit
      `webhook.failed` when `DEAD`.
- [ ] **T514** `webhook-source` Admin CRUD/rotate; one-time secret; frontend admin page.
- [ ] **T515** Sweeper for `RECEIVED` > 60s; test enqueue failure; docs.

## Phase 4 — US3 Email (P2)

### Tests first

- [ ] **T516** `backend/test/unit/mailer.spec.ts`: adapter/template/dedupe; Mailpit integration test.

### Implementation

- [ ] **T517** `modules/emails/mailer.service.ts` + templates `task-due`, `task-overdue`; queue; retry/DLQ.
- [ ] **T518** Wire scheduler 004 → email; dedupeKey; inactive/no email skip; test failure isolation.

## Phase 5 — Verification

- [ ] **T519** Full integration: upload 5k < 2 minutes; webhook twice → 1 contact; email over 10 scheduler runs
      with no duplicates.
- [ ] **T520** Docs: events/queue, error codes, traceability; security review secret/log; PR checklist.

## Dependencies

- T500 → T501–T503.
- T504–T508 (import) after T501/T502.
- T509–T515 (webhook) after T501; T511 is needed before the controller.
- T516–T518 after T501 and scheduler 004.
- T512 needs the generic limiter from 007 T603 (007 runs before 006 in the recommended order).

## MVP checkpoint

After T508: 5k import works. After T515: webhook idempotent/retry passes. After T518: reminder email.

## Notes

- Do not send real email outside the org; Mailpit in dev.
- The secret is returned only once; do not log the body/secret.
- Import writes audit per contact (batch insert) to comply with C4; measure perf.
- The worker can be a separate process; keep the queue/job names.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR10-01..08 | T500–T508, T519–T520 |
| AC-FR11-01..09 | T500, T509–T515, T519–T520 |
| AC-FR12-01..06 | T516–T520 |
| AC-NFR03-01..03 | T501, T519 |
