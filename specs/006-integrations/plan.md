# Implementation Plan: Integrations (Import, Webhook, Email)

**Branch**: `006-integrations` | **Date**: 2026-11-08 | **Spec**: `specs/006-integrations/spec.md`

## Summary

Add BullMQ workers for CSV import, webhook leads and reminder email. Focus: idempotency, safe HMAC,
retry/DLQ, no request blocking, no secret leakage.

## Technical Context

- **Backend**: `@nestjs/bullmq`, BullMQ, Redis; `csv-parse`, `busboy`/multer, `nodemailer`.
- **Storage**: import_jobs, webhook_sources/events; local/S3 storage adapter.
- **Crypto**: AES-256-GCM for webhook secret; HMAC-SHA256 timing-safe.
- **Testing**: Jest + real Redis; Mailpit; fake worker; Supertest raw body.
- **Performance**: upload 5k → 202 < 1s; processing < 2 minutes locally.

## Constitution Check

| Gate | How it is satisfied | Status |
| --- | --- | --- |
| C1 strict | zod payload/CSV types; no any | Pass |
| C2 layering | controller → service → repo; worker calls the service | Pass |
| C3 org_id | job/event carry orgId; worker re-checks | Pass |
| C4 audit | import contact/webhook contact create audit | Pass |
| C5 validate/error | CSV/HMAC/payload codes | Pass |
| C6 secret | AES key env; secret not logged/returned | Pass |
| C7 async | all heavy work through the queue | Pass |
| C8 test | idempotency/retry/tenant/role | Pass |
| C9 small PR | T500–T520 | Pass |

## Data Model

- `import_jobs`: file_hash, created_by, progress, error_report_key, timestamps.
- `webhook_sources`: secret_ciphertext, last4, previous_* (grace), default_owner, active.
- `webhook_events`: idempotency unique, status, attempts, last_error, processed_at.
- Details in `docs/data-model.md` 4.10–4.12.

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

- Audit: one aggregate `IMPORT_CONTACTS` record + one per contact? C4 says every change; to avoid 5k audit rows,
  writing audit per contact is correct but heavy. Decision: write audit per contact (batch insert) to comply with
  C4; add a job summary audit. If it is too heavy, optimize the batch insert.
- Retry: the job is idempotent by unique email + status; when re-run, skip contacts already created by the job
  (use `source`/audit? simpler: unique email + upsert skip).

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
- Body limit 256KB; JSON parse error → 400; do not log the full body.
- Replay: timestamp + idempotency key; same key with a different payload → 409.

## Email flow

```text
Scheduler (004) creates TASK_DUE/OVERDUE notification
  → enqueue emails/send-email { to, template, data, dedupeKey }
  → jobId = email:{dedupeKey}; worker checks sent/dedupe
  → Mailer adapter (Mailpit dev) → success log
  → fail: retry 3 backoff → DLQ; task unaffected
```

- Templates: `task-due`, `task-overdue`; Vietnamese; link to the deal.
- Do not send if the assignee is inactive/has no email.
- Do not log the full subject/body; only template/to/dedupeKey.

## Storage

- Interface `ObjectStorage { put(key, stream), getSignedUrl(key, ttl), delete(key) }`.
- Dev: local volume `./.data/uploads`; prod: S3-compatible (MinIO/S3) via env.
- Key: `org/{orgId}/imports/{jobId}/errors.csv`; signed URL 15 minutes.
- Delete the temp file after processing; keep the error report for 7 days (proposed retention).

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/imports/contacts` | Manager/Admin |
| GET | `/imports/:id` | progress |
| GET | `/imports/:id/errors` | signed URL or stream |
| POST | `/webhooks/leads/:publicKey` | public + HMAC |
| GET/POST | `/webhook-sources` | Admin |
| PATCH/DELETE | `/webhook-sources/:id` | Admin |
| POST | `/webhook-sources/:id/rotate-secret` | returns the secret once |

## Testing

| Group | Test |
| --- | --- |
| Import | 5k, progress, error report, duplicate, same file, invalid, role/tenant |
| Webhook | signature/replay/idempotency/retry/DLQ/secret rotate |
| Email | Mailpit, dedupe, failure isolation, inactive |
| Queue | retry/backoff, worker restart, sweeper |
| Security | secret not in log/response; body limit; timing-safe |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| HMAC raw body parsed by Nest | `rawBody: true`; verify before JSON parse |
| Secret leak | AES-GCM, no logging, return once; test |
| 5k import audit too heavy | Batch insert inside the transaction; measure perf |
| Duplicate worker | unique + conditional status + jobId |
| DLQ full | Alert/metric; Admin UI/script retry |
| Large file/zip bomb | Size/row limits; stream; no decompression |
| Email spam | Internal only; dedupe; no sending outside the org |

## Complexity Tracking

No violation. Secret encryption and the outbox/sweeper are complexity required to satisfy FR-11.
