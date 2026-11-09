# Spec Critique & Decision Log

**Reviewed document**: `Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md` v0.1
**Date**: 2026-11-08
**Reviewer**: AI (as requested by section 12 of the spec)
**Status**: Proposal — needs human sign-off before M1 coding starts

Purpose: surface ambiguities, contradictions, edge cases and security risks **before any code is written**, and
record the decisions already applied in this SDD. Large decisions have their own ADR; smaller changes live in the
SCR table.

> Rule: while an item below is unapproved, the related code must not start. The source spec remains the source of
> truth; the SCRs must be merged into spec v0.2.

## 1. Critical findings (P0 — must be fixed before coding)

### 1.1 `webhook_sources.secret_hash` cannot verify an HMAC

The spec requires HMAC signature verification (FR-11) but the schema only stores `secret_hash`. HMAC needs the
**original secret** to recompute the signature; a one-way hash cannot be used. If only the hash is stored, the
server can never verify a request.

**Decision**: store the secret encrypted with AES-256-GCM using a key from `WEBHOOK_SECRET_ENC_KEY`; add
`secret_last4` for display and `rotated_at` for rotation. Never return the secret through the API after creation.
Details: `ADR-011`, `SCR-003`.

### 1.2 Org-wide realtime rooms leak other Sales users' data

Section 5 of the spec says events are emitted to `room org_id`. If Sales users in the same org receive
`deal.moved` for a deal someone else owns, they learn that the deal exists, its stage and its value — violating
the rule "Sales only see data they own". Even a minimal payload leaks IDs and activity.

**Decision**: route by permission instead of broadcasting to the org:

- `user:{userId}`: the current owner and the previous owner (deal.moved, deal.assigned).
- `org:{orgId}:managers`: Manager/Admin receive every deal event in the org.
- `user:{assigneeId}`: task.due, notification.
- `org:{orgId}:system`: events carrying no business data (for example maintenance).

Details: `ADR-012`, `docs/events.md`, `SCR-008`.

### 1.3 `stages` has no `org_id`, violating C3

C3 says every business table has `org_id`, but `stages` only has `pipeline_id`. Looking up a stage by ID while
forgetting to join the pipeline can expose a stage from another org. `activities` does have `org_id`, but
`deal_id` alone is not enough to filter a tenant without a join.

**Decision**: add `org_id` to `stages`; use composite FKs `(org_id, pipeline_id)` and `(org_id, id)`; every
business table has `org_id`. Details: `SCR-001`, `docs/data-model.md`.

### 1.4 `closed_at` is missing on deals

FR-08 needs win rate and revenue by month; FR-06 closes deals as won/lost. Relying on `updated_at` or `status`
alone cannot answer "won within this period" accurately, nor distinguish an old closed deal that was edited.

**Decision**: add `closed_at timestamptz null`, set when moving to WON/LOST and cleared on reopen. Check
constraint: `closed_at` is non-null if and only if `status != OPEN`. Details: `SCR-002`.

### 1.5 No table/history for AI results

FR-18 requires storing scoring history; FR-19 requires caching by identical input. `ai_usage` only has
token/cost — no output, score, reason or input hash.

**Decision**: add `ai_results` (each run stores output/score/reason/input_hash) next to `ai_usage` (the cost
ledger). The cache reads the latest row by `input_hash`; history stays complete. Details: `SCR-005`, `ADR-009`
(RAG deferred).

### 1.6 Tasks have no table of their own but there is a `/tasks` endpoint

The schema only has `activities` with `type=task`, `due_at`, `done_at`, `assignee_id`, while the API exposes
`GET /tasks?status=overdue`. Creating a new `tasks` table would duplicate the timeline; keeping `activities`
requires defining tasks clearly as a projection.

**Decision**: keep **one** table, `activities`; a task is an activity with `type='task'`, a required `due_at` and
a required `assignee_id`. `/tasks` is a projection of `activities`, not a new entity. Deal-less tasks, if needed
later, require a new ADR. Details: `SCR-004`.

### 1.7 Missing idempotency/file hash for import; missing attempts for webhooks

FR-10 requires re-running the same file to create no duplicates, but `import_jobs` has no `file_hash`,
`created_by`, `started_at`, `finished_at` or `error_report_key`. FR-11 requires retry/dead-letter, but
`webhook_events` lacks `attempts`, `last_error` and `processed_at`.

**Decision**: add those columns; unique `(org_id, idempotency_key)` for webhooks; import checks
`(org_id, file_hash)` within 24 hours and returns the existing job. Details: `SCR-006`.

## 2. High-severity findings (P1)

### 2.1 `deals.status` and `stage.is_won/is_lost` can diverge

The spec has both `status` on the deal and flags on the stage. Setting only one of them makes reports wrong.

**Decision**: `status` is business state that the **service** derives from the stage on move and persists for
queries/reports; DB checks constrain `lost_reason`/`closed_at`. Clients never send `status` directly.

### 2.2 Multi-currency, but reports say nothing about FX

Deals carry `currency`; the "total pipeline value" and "forecast revenue" dashboard figures say nothing about
conversion.

**Decision**: in the MVP each org has one currency (`organizations.currency`, default `VND`) and a deal must use
the org currency. Reports do not convert. Multi-currency + FX rates are out of scope and need a new ADR.

### 2.3 Dashboard formulas were undefined

"New leads", "win rate" and "forecast revenue by month" can be read in several ways.

**Decision** (details in `SCR-011`):

- New leads = count of `contacts.created_at` inside the filter range.
- Deals by stage = current snapshot of `OPEN` deals, grouped by stage.
- Pipeline value = `sum(deals.value)` of `OPEN` deals.
- Win rate = `WON / (WON + LOST)` by `closed_at` inside the range.
- Forecast by month = `sum(value)` of `OPEN` deals grouped by the `expected_close` month, unweighted.
- The date filter applies per metric as above; state it in the tooltip/README.
- Sales: `owner_id = currentUser`; Manager/Admin: the whole org.

### 2.4 Contact email uniqueness and soft delete

The spec says unique `(org_id, email)` for contacts that are not deleted. This must be case-insensitive and must
allow re-creating the contact after deletion.

**Decision**: normalise email to lowercase/trimmed; partial unique index
`(org_id, lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL`. Delete is a soft delete; no restore in
the MVP.

### 2.5 Refresh token in the body or in a cookie?

The spec says access/refresh tokens are returned; keeping the refresh token in localStorage increases XSS risk.

**Decision**: the access token is returned in the body and used via `Authorization: Bearer`; the refresh token
goes into a cookie `HttpOnly; Secure; SameSite=Lax` with path `/api/v1/auth`. Non-browser API clients may send
the refresh token in the body for tests/integration. The refresh token is never stored in localStorage. Details:
`SCR-009`, `ADR-015`.

### 2.6 No forgot/change-password or email-verification flow

The spec has none. UI/endpoints must not be invented.

**Decision**: out of scope for M1–M3; the Admin creates users with a temporary password and asks them to change
it outside the system (or a new FR is added before M1 if needed). Recorded in `docs/spec-review.md` as an
operational risk.

### 2.7 Deleting stages/pipelines and the "last stage" constraint

FR-04 only says a stage with deals returns 409. It says nothing about deleting the last stage, deleting a
pipeline, or the uniqueness of `is_won`/`is_lost`.

**Decision**:

- Do not delete a stage that still has deals (409 `STAGE_HAS_DEALS`).
- Do not delete the last stage of a pipeline (409 `LAST_STAGE`).
- Every pipeline must keep at least one `is_won` and one `is_lost` stage; deleting or flipping flags is rejected
  when it would break that.
- Deleting a pipeline that has deals → 409 `PIPELINE_HAS_DEALS`.
- Admin may create several pipelines; a new org is seeded with "Sales Pipeline" (New/Qualified/Proposal/Won/Lost).

### 2.8 Position and concurrent drag-and-drop

The spec has `position` but says nothing about its type or insertion strategy. Integers plus a full-stage
reindex write many rows and conflict easily.

**Decision**: `position numeric(20,10)` (fractional index). On move the server computes the midpoint between two
neighbours; when there is not enough room it rebalances the stage inside the transaction. Sort tie-break is
`(position, id)`. The client sends the target index as `position`; the server returns the real position.
Optimistic locking via `version` protects each deal; two different deals may share a position and sort stably.

### 2.9 Audit can contain PII/secrets

The `before/after` JSONB of users/contacts/webhooks can contain password hashes, tokens and secrets.

**Decision**: `AuditService` redacts the keys `password*, token*, secret*, authorization`, caps depth and size,
and never stores the full webhook payload. User audit only records email/name/role/active, never the hash.
Details: `SCR-013`.

### 2.10 Rate limiting when Redis fails

The spec does not say fail-open or fail-closed.

**Decision**: auth/login fail-closed (controlled 503/429) for security; ordinary reads fail-open (skip the limit,
log a warning) so the app stays up; webhooks fail-closed to stop abuse. Recorded in `docs/error-codes.md`.

### 2.11 Missing notification and webhook-source management APIs

FR-09 needs reading/marking notifications; FR-11 needs Admin management of public keys/secrets, but the API table
in section 8 has neither.

**Decision**: add the endpoints (treated as a mandatory part of FR-09/FR-11, not a new feature):

- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`.
- `GET/POST /webhook-sources`, `PATCH /webhook-sources/:id`, `POST /webhook-sources/:id/rotate-secret`,
  `DELETE /webhook-sources/:id` (Admin).

### 2.12 Vietnamese search and full-text

PostgreSQL default full-text does not handle Vietnamese with or without diacritics well. The spec requires
searching name/email/company with p95 < 300ms over 10k rows.

**Decision**: use `pg_trgm` + `unaccent` (when needed) with GIN indexes on `lower(name/email/company)` and
`ILIKE '%term%'` queries. This is "full-text search" in the product sense; recorded in ADR-013. At 10k rows
trigram comfortably reaches the p95 target.

### 2.13 Measuring "under 1 second" and p95

The realtime AC "other users see it within 1 second" cannot be measured with unit tests; p95 needs a method.

**Decision**: Playwright E2E measures from the move click until the other DOM updates; p95 over 20 runs
≤ 1000ms (CI may relax to 1500ms). NFR-01 is measured with the seed script + autocannon/k6, recording p50/p95/p99,
on local Docker, excluding start-up time. Details in `docs/testing-strategy.md`.

### 2.14 Pagination, time and IDs

Previously unspecified.

**Decision**: cursor pagination (`cursor`, `limit` default 50, max 100) with the response
`{ data, nextCursor, hasMore }`; times in ISO-8601 UTC, displayed in the org timezone (default
`Asia/Ho_Chi_Minh`); UUID v4 IDs, non-sequential to avoid enumeration. Details in `docs/api-conventions.md`.

### 2.15 AI cost/quota had no numbers

FR-19 requires limits but gives no thresholds.

**Decision**: configured through env, defaulting to 200,000 tokens/day per org and 50,000 tokens/day per user;
exceeding → 429 `AI_QUOTA_EXCEEDED`. Input-hash cache for 24 hours. Model prices come from a configuration table,
never hard-coded. Details: `SCR-012`, `docs/error-codes.md`.

### 2.16 Webhook secret rotation and replay

Timestamp/replay were unspecified.

**Decision**: header `X-Pulse-Signature: t=<unix>,v1=<hex>`; HMAC-SHA256 over `${t}.${rawBody}`; reject when the
skew is > 300 seconds; timing-safe comparison; `Idempotency-Key` required; body limited to 256KB.

### 2.17 CSV export and CSV injection

**Decision**: escape cells starting with `=`, `+`, `-`, `@`, tab or CR; wrap in quotes; UTF-8 BOM so Excel reads
Vietnamese correctly; limit 100,000 rows per export; stream so nothing is held fully in RAM; audit the export.

### 2.18 AI sends PII outside

**Decision**: mask email/phone before calling the LLM; send only the current org's data; never send
secrets/audit rows; fixed prompt template with CRM content placed inside delimiters and treated as untrusted;
the model may not call tools. Recorded in `ADR-009`/the feature 008 plan.

## 3. Open questions in the source spec

| ID | Question | Proposed decision | ADR |
| --- | --- | --- | --- |
| Q1 | Prisma or Drizzle? | **Prisma** — type-safe, clear migrations, widely used; slightly less flexible with raw SQL but sufficient. | ADR-006 |
| Q2 | Socket.IO or SSE for realtime? | **Socket.IO** for kanban/notifications; **SSE** only for AI streaming (one-way). | ADR-007 |
| Q3 | Real email or a fake mailer? | **Mailpit in dev/test**; provider adapter; no real email until an operations decision is made. | ADR-008 |
| Q4 | Do we build FR-20 (RAG)? | **Defer** beyond M3; keep the schema ready for pgvector, implement only with separate approval. | ADR-009 |

## 4. New questions to settle

| ID | Question | SDD default | Impact if changed |
| --- | --- | --- | --- |
| Q5 | Do we need password reset/email verification in M1? | No; Admin sets a temporary password | Adds an FR + token table + email |
| Q6 | Multi-currency? | No; 1 org = 1 currency | Needs an FX table + conversion formulas |
| Q7 | Multiple pipelines? | Yes; the seed creates one default pipeline | Pipeline selector in the UI, reports per pipeline |
| Q8 | Hard delete for deal/contact? | Contact soft delete; no delete API for deals | Needs soft delete + restore + audit |
| Q9 | How long is audit kept? | No auto-delete in the MVP; 12 months proposed for production | Needs a retention job + policy |
| Q10 | FR-20 RAG? | Deferred | Needs pgvector + embeddings + eval |

## 5. Spec Change Requests (SCR)

Status: **Applied in SDD** = already reflected in spec/plan/tasks; **Pending** = the source spec still needs the
edit.

| ID | Change | Reason | Impact | Status |
| --- | --- | --- | --- | --- |
| SCR-001 | Add `stages.org_id`; composite FK `(org_id, id)` for business tables | C3, tenant-leak prevention | Schema, repositories, tests | Applied in SDD |
| SCR-002 | Add `deals.closed_at`, `organizations.currency`; check constraint on status/lost_reason/closed_at | Accurate FR-06/FR-08 | Schema, reports | Applied in SDD |
| SCR-003 | Replace `webhook_sources.secret_hash` with `secret_ciphertext`, `secret_last4`, `rotated_at` | HMAC needs the original secret | Schema, API, security | Applied in SDD; Pending spec |
| SCR-004 | Task is an activity with `type='task'`, no separate `tasks` table | Avoid a duplicated model | `/tasks` API, queries | Applied in SDD |
| SCR-005 | Add `ai_results`; extend `ai_usage` | FR-18 history, FR-19 cache/cost | Schema, AI service | Applied in SDD |
| SCR-006 | Add `import_jobs.file_hash/created_by/started_at/finished_at/error_report_key`; `webhook_events.attempts/last_error/processed_at` | Idempotency/retry | Schema, workers | Applied in SDD |
| SCR-007 | Add `notifications.dedupe_key`; notification endpoints | FR-09, anti-spam | Schema, API | Applied in SDD; Pending spec |
| SCR-008 | Realtime rooms by role/user, no org broadcast | RBAC, Sales privacy | Gateway, events | Applied in SDD; Pending spec |
| SCR-009 | Refresh token via HttpOnly cookie; access token in the body | Reduce XSS | Auth API, web | Applied in SDD |
| SCR-010 | Search with `pg_trgm` + `unaccent` instead of default full-text | Vietnamese, p95 | Indexes, queries | Applied in SDD |
| SCR-011 | Define dashboard formulas + filters | FR-08 must be verifiable | Report service/UI | Applied in SDD |
| SCR-012 | Fix default AI quotas + usage/score endpoints | FR-18/FR-19 | AI module, env | Applied in SDD |
| SCR-013 | Audit redaction, append-only, no secret/PII in logs | C4, security | Audit service | Applied in SDD |
| SCR-014 | Cursor pagination, UUID v4, ISO UTC, org timezone | API consistency | Whole API | Applied in SDD |
| SCR-015 | Add webhook-source management + notification endpoints | FR-09/FR-11 lacked APIs | API, RBAC | Applied in SDD; Pending spec |
| SCR-016 | Remove SDD links and internal details from README; confine to quickstart | Constitution compliance; keep README client-facing | 001 tasks/spec | Applied in SDD |
| SCR-017 | Accept ADR-006..015; document original concept PRD as frozen v0.1 reference | Establish legal baseline before M1; clarify language policy | ADRs, constitution, AGENTS.md, SDD index | Applied in SDD |

## 6. Out of scope / deferred

- Real payments, marketing automation, mobile app, ERP/accounting, microservices, Zalo/Messenger.
- Forgot/change password, email verification, SSO, 2FA (unless a new FR is added).
- Multi-currency, FX rates, tax.
- RAG/FR-20 (ADR-009).
- Sending real email to external customers; internal email only via Mailpit/queue in M2.
- Automatic data retention, GDPR delete requests, restoring soft-deleted records.
- Multi-region, HA, horizontal worker scaling (can be added later).

## 7. Spec review checklist (reuse on every spec change)

- [ ] Every FR has a measurable AC, an ID, and no duplicates.
- [ ] Every AC maps to at least one test.
- [ ] Every business table has `org_id` and composite FKs.
- [ ] Every mutation writes audit in the same transaction.
- [ ] Every input has a schema; errors are uniform.
- [ ] Everything heavy or external goes through a queue/stream.
- [ ] No secret/PII in logs, audit rows or errors.
- [ ] Tenant + lower-role tests exist.
- [ ] There is a fallback plan for Redis/LLM/provider failures.
- [ ] There is an ADR for every new architectural decision.
