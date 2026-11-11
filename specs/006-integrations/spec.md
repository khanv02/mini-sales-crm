# Feature Specification: Integrations (Import, Webhook, Email)

**Feature Branch**: `006-integrations`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-10, FR-11, FR-12; ADR-004, ADR-008, ADR-011; SCR-003, SCR-006

## User Scenarios & Testing

### US-1 — Import CSV contacts (Priority: P1)

Manager/Admin uploads a 5,000-row CSV; receives a job id immediately; tracks progress; downloads the error
report; re-running creates no duplicates.

**Why P1**: FR-10 has clear performance/idempotency AC; it is how real data enters the CRM.

**Independent test**: Upload a 5,000-row seed file; poll the job; download the error report; upload again; count
contacts.

**Acceptance Scenarios**:

1. **AC-FR10-01** Given Manager/Admin, When uploading a valid CSV ≤ 5,000 rows/10MB, Then `202` within < 1s,
   returning `jobId`; processing happens in the background.
2. **AC-FR10-02** Given a running job, When `GET /imports/:id`, Then `status/total/success/failed/progress`;
   when done `COMPLETED` or `PARTIAL`/`FAILED`.
3. **AC-FR10-03** Given a job with failed rows, When `GET /imports/:id/errors`, Then download a CSV containing
   `row,error_code,error_message`; signed URL with expiry; job not finished → `409 IMPORT_NOT_READY`.
4. **AC-FR10-04** Given the email already exists in the org, When importing that row, Then skip it, increment
   `failed`, record the `DUPLICATE_EMAIL` error; no duplicate created; other rows are still processed.
5. **AC-FR10-05** Given the same file (SHA-256) was uploaded within 24h, When uploading again, Then return the
   same `jobId` (or a new job but with 0 duplicate contacts); contacts do not increase; `failed` records the
   reason.
6. **AC-FR10-06** Given a file with a wrong header/over 5,000 rows/empty, When uploading, Then `400` with the
   corresponding code (`IMPORT_INVALID_HEADER`/`IMPORT_TOO_MANY_ROWS`/`IMPORT_EMPTY`); file over 10MB →
   `413 PAYLOAD_TOO_LARGE` (see `docs/error-codes.md`); no job created.
7. **AC-FR10-07** Given Sales, When uploading/reading a job, Then `403`; Manager/Admin of another org → `404`.
8. **AC-FR10-08** Given Admin of org B, When reading a job of org A, Then `404`; the worker does not write across
   orgs.

---

### US-2 — Webhook lead intake (Priority: P1)

An external web form sends leads using a public key + HMAC; the system responds fast, processes in the
background, prevents duplicates/retries.

**Why P1**: FR-11 has many security/idempotency AC; it is the realistic integration point.

**Independent test**: Create a source; sign the payload; send twice; check 1 contact; try a wrong signature/replay;
inspect the DLQ.

**Acceptance Scenarios**:

1. **AC-FR11-01** Given an active source + a correct HMAC signature + a fresh timestamp, When POSTing a lead,
   Then `202` fast, event `RECEIVED`, the worker creates the contact (owner = default if set), audit, event
   `PROCESSED`.
2. **AC-FR11-02** Given a wrong/missing signature, When POSTing, Then `401 WEBHOOK_SIGNATURE_INVALID`; no event
   created.
3. **AC-FR11-03** Given a timestamp skew > 300s or a replay, When POSTing, Then `401 WEBHOOK_TIMESTAMP_INVALID`;
   no event created.
4. **AC-FR11-04** Given the same `Idempotency-Key` sent twice, When POSTing, Then both return `202` with the same
   `eventId`; only 1 contact/1 event; a different payload with the same key → `409 WEBHOOK_EVENT_CONFLICT`.
5. **AC-FR11-05** Given a payload missing name/an email in the wrong format, When POSTing, Then
   `400 WEBHOOK_PAYLOAD_INVALID`; the event does not enter the queue or enters `FAILED` with the reason (no
   infinite retry).
6. **AC-FR11-06** Given a transient worker error, When retrying, Then at most 3 attempts with backoff; after that
   → `DEAD`, notify Admin, no duplicate contact.
7. **AC-FR11-07** Given an inactive source/wrong public key, When POSTing, Then `401 WEBHOOK_SOURCE_INACTIVE`/
   `404 WEBHOOK_SOURCE_NOT_FOUND`.
8. **AC-FR11-08** Given Admin creates a source, When responding, Then return `publicKey` + secret **once**;
   `GET /webhook-sources` does not return the secret; rotation keeps the old secret with a 24h grace.
9. **AC-FR11-09** Given Admin of org B, When managing a source of org A, Then `404`; a webhook of org A does not
   create a contact in org B.

---

### US-3 — Reminder email via queue (Priority: P2)

Due/overdue tasks send an internal email through the queue; email failures do not affect the task.

**Why P2**: FR-12; needs Mailpit/queue, but the DB notification + realtime is already enough for a demo.

**Independent test**: Create a task due soon; run the scheduler; check Mailpit; run again without duplicate
sending; stop Mailpit.

**Acceptance Scenarios**:

1. **AC-FR12-01** Given a task due within 24h, When the scheduler runs, Then enqueue a reminder email for the
   assignee; Mailpit receives the correct subject/recipient.
2. **AC-FR12-02** Given an email job already sent, When the scheduler/retry runs again, Then no duplicate send
   (dedupeKey).
3. **AC-FR12-03** Given Mailpit/provider failure, When sending, Then retry 3 times; task/deal unchanged;
   notification remains; log the error.
4. **AC-FR12-04** Given an inactive assignee or one without an email, When reminding, Then skip the email, log;
   do not fail the scheduler.
5. **AC-FR12-05** Given an overdue task, When the scheduler runs, Then the email is sent once for the
   `task:{id}:overdue` bucket; no repeats every minute.6. **AC-FR12-06** Given Admin of org B, When viewing an email/log of org A, Then there is no endpoint/nothing is
   visible; the job only uses org A data.

### Edge Cases

- CSV with BOM, CRLF, Vietnamese diacritics → parsed correctly; UTF-8.
- CSV with duplicate emails in the same file → the first row wins, later rows fail with `DUPLICATE_IN_FILE`.
- Import interrupted midway (worker restart) → the `PROCESSING` job is retried; contacts are not doubled.
- Same file hash but content changed by 1 byte → new job; the unique email still protects.
- Webhook body too large → 413; invalid JSON → 400.
- Webhook sent concurrently with the same key → DB unique, one event; the remaining request returns the same
  event.
- Rotating a secret while requests are in flight → 24h grace accepts both old/new secret.
- Email template error → job fails/DLQ; does not block the task.
- Recipient does not exist → log, no infinite retry.

## Requirements

### Functional Requirements

**Import**

- **FR-10.1**: `POST /imports/contacts` multipart; Manager/Admin; validate extension/MIME/size/rows; hash the
  file; return a 202 job.
- **FR-10.2**: `imports` worker reads the stream, chunks of 500, validates each row, upserts/skips by email;
  updates progress; retry 3; DLQ.
- **FR-10.3**: Idempotency by `(org_id,file_hash)` for 24h; unique email; error report CSV stored in storage,
  signed URL.
- **FR-10.4**: Fixed header `name,email,phone,company,source,owner_email`; email required for import; default
  owner is the actor; unknown owner_email → row error.
- **FR-10.5**: Do not block the request; do not hold the file in RAM beyond a chunk; delete the temp file after
  processing.

**Webhook**

- **FR-11.1**: `POST /webhooks/leads/:publicKey` public; raw body; HMAC-SHA256 `${t}.${body}`; timestamp
  ±300s; timing-safe; body ≤ 256KB.
- **FR-11.2**: `Idempotency-Key` required; unique `(org_id,key)`; insert the event first, enqueue after; 202.
- **FR-11.3**: Worker retries 3 with backoff; `DEAD` + Admin notification; contact upsert by email; audit.
- **FR-11.4**: Admin CRUD webhook source; secret encrypted with AES-256-GCM; rotate with 24h grace; never return
  the secret again.
- **FR-11.5**: inactive source/wrong public key → 401/404; payload validated; never log the secret/full body.

**Email**

- **FR-12.1**: Queue `emails`; Mailpit in dev; provider adapter; Vietnamese templates; retry 3; DLQ.
- **FR-12.2**: The task due/overdue scheduler creates a notification (004) + email; dedupe bucket; no duplicate
  sending.
- **FR-12.3**: Email failure does not affect task/deal; do not send to inactive users/users without email.
- **FR-12.4**: Do not send email outside the org in M2; internal users only.

### Key Entities

- ImportJob, WebhookSource, WebhookEvent, Notification; details in `docs/data-model.md` sections 4.9–4.12.
- Storage abstraction for CSV/error report files (local dev, S3-compatible prod).

## Success Criteria

- **SC-001**: Uploading 5,000 rows returns 202 < 1s; processing finishes < 2 minutes locally.
- **SC-002**: 0 duplicate contacts when re-running the same file; 0 duplicate events when resending the same key.
- **SC-003**: 100% of webhooks with a wrong signature/replay are blocked; the secret never appears in
  logs/responses.
- **SC-004**: Email failure does not fail the task; 0 duplicate emails when the scheduler runs 10 times.
- **SC-005**: 100% of AC have tests; 100% of endpoints have role/tenant tests.

## Assumptions

- The CSV file is provided by the user; there is no column mapping UI in the MVP.
- Import is contacts only, no deal/activity import.
- The webhook only creates/updates contacts, never deals.
- The webhook default owner = `default_owner_id`; if null → contact unassigned (visible to Manager/Admin).
- Email only reminds about tasks; manual follow-up email/AI draft belongs to 008 (no auto-send yet).
- Local storage uses a volume; production uses S3-compatible (full adapter not implemented unless needed).

## Out of Scope

- Import of deals/activities, Excel, Google Sheets.
- Field mapping UI, preview, import undo.
- Outbound webhook (we only receive), signing on our outgoing side.
- Email marketing, unsubscribe, bounce/complaint handling.
- Sending real email to contacts outside the org.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-10 | AC-FR10-01..08 | T500–T508, T519–T520 |
| FR-11 | AC-FR11-01..09 | T500, T509–T515, T519–T520 |
| FR-12 | AC-FR12-01..06 | T516–T520 |
| NFR-03 | AC-NFR03-01..03 | T501, T519 |
