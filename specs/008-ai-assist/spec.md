# Feature Specification: AI Assist

**Feature Branch**: `008-ai-assist`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-16, FR-17, FR-18, FR-19; FR-20 deferred (ADR-009); NFR-01, NFR-02; SCR-005, SCR-012

## User Scenarios & Testing

### US-1 — Deal history summary (Priority: P1)

Sales opens a deal, clicks “Summary”; the server streams tokens immediately (< 3s), using only the current org's
data.

**Why P1**: FR-16 is the main AI demo; streaming is the portfolio technical highlight.

**Independent test**: Mock provider; call SSE; measure the first token; check the prompt contains no other org;
provider error.

**Acceptance Scenarios**:

1. **AC-FR16-01** Given own deal, When `POST /ai/deals/:id/summary`, Then SSE `meta` then `token`; first token
   p95 < 3s; ends with `done` carrying usage.
2. **AC-FR16-02** Given input, When building the prompt, Then only the current org's contact/deal/activity; no
   other org; email/phone are masked.
3. **AC-FR16-03** Given history that is too long, When building the prompt, Then truncate to ≤ 8,000 estimated
   tokens; keep the newest part + summary; do not exceed the limit.
4. **AC-FR16-04** Given provider error/timeout, When streaming, Then an `error` event with a friendly code; the
   deal/DB are unchanged; the user can retry.
5. **AC-FR16-05** Given client disconnect, When streaming, Then abort the provider; record usage
   `ERROR/CANCELLED`; do not hang the connection.
6. **AC-FR16-06** Given the summary finished, When checking `ai_usage`, Then it has token/cost/latency/user/org/
   feature.
7. **AC-FR16-07** Given Sales B, When summarizing Sales A's deal, Then `404`; Manager/Admin allowed; other org
   `404`.

---

### US-2 — Follow-up email draft (Priority: P2)

Sales creates an email draft from a deal; the system does not send it; the user edits and sends it outside the
system (MVP).

**Why P2**: FR-17; high value but depends on summary/context.

**Independent test**: Call the endpoint; receive the draft; check no email was sent; edit the content in the UI.

**Acceptance Scenarios**:

1. **AC-FR17-01** Given a deal, When creating a draft, Then return `subject`, `body`, `tone`, `language`; the
   content is based on the contact/deal/activity in the org.
2. **AC-FR17-02** Given a draft, When checking the email queue/log, Then **no** email was sent; only text is
   returned.
3. **AC-FR17-03** Given the UI, When the user edits subject/body, Then save the draft locally/do not overwrite the
   deal; it can be copied.
4. **AC-FR17-04** Given Sales B/another org, When creating a draft for deal A, Then `404`; the prompt contains no
   data outside the org.

---

### US-3 — Lead scoring (Priority: P2)

The system scores 0–100 with a reason, stores history, and has an eval set of 30 leads to measure stability.

**Why P2**: FR-18; needs queue/eval, done after summary.

**Independent test**: Score 1 contact; check score/reason/history; score again; cache; run the 30-lead eval.

**Acceptance Scenarios**:

1. **AC-FR18-01** Given own contact, When `POST /ai/contacts/:id/score`, Then `202 runId`; the worker processes it;
   `GET /ai/runs/:id` returns `score` 0–100 + `reason` + `model`.
2. **AC-FR18-02** Given several scorings, When viewing history, Then each run is one `ai_results` record; no
   overwrite.
3. **AC-FR18-03** Given an eval set of ≥ 30 leads, When running `pnpm eval:score`, Then report the MAE across 3
   runs + the in-band rate; store the report.
4. **AC-FR18-04** Given the eval, When 3 runs use the same input, Then the average MAE ≤ 10 points; if exceeded,
   record a warning (do not block CI).
5. **AC-FR18-05** Given the same input hash within 24h, When scoring again, Then return the cache (no provider
   call), record `cache_hit=true`; history still has a cache record.
6. **AC-FR18-06** Given Sales B/another org, When scoring contact A, Then `404`; the score leaks no data.

---

### US-4 — Cost control (Priority: P1)

Count tokens per user/org, daily quota, input cache, return 429 when exceeded.

**Why P1**: FR-19; without a quota there is LLM cost risk.

**Independent test**: Set a low quota; call AI until 429; check the provider was not called; cache hit.

**Acceptance Scenarios**:

1. **AC-FR19-01** Given every AI call, When it finishes, Then `ai_usage` records input/output tokens, cost, user,
   org, feature, latency, status.
2. **AC-FR19-02** Given the org/user exceeds the daily quota, When calling AI, Then `429 AI_QUOTA_EXCEEDED` before
   calling the provider; `Retry-After` until the new day.
3. **AC-FR19-03** Given the same input hash, When calling a second time within the TTL, Then cache hit, cost 0/the
   provider is not called.
4. **AC-FR19-04** Given the model price table, When computing cost, Then `cost_usd` matches `tokens * price`
   (rounded to 6 digits); not hard-coded.
5. **AC-FR19-05** Given a new day (org timezone), When calling, Then the quota resets; old usage remains.
6. **AC-FR19-06** Given a user, When `GET /ai/usage`, Then they see their own usage; Admin/Manager see the
   org/aggregate; Sales do not see others.
7. **AC-FR19-07** Given org B, When viewing org A's usage, Then `404`/nothing visible; quotas are split per org.

### Edge Cases

- The provider returns partway then drops → save partial usage, status ERROR; not counted as success.
- The model returns JSON score missing a field/outside 0–100 → retry once then `AI_OUTPUT_INVALID`; do not store a
  junk score.
- Empty/too-short input → return a friendly message, do not call the provider.
- Prompt injection in a note (“ignore the instructions…”) → treat it as data; the system prompt is fixed; output
  is not executed.
- Email/phone masked but the company name kept; do not send secrets/audit.
- Redis quota lost → reconcile from the DB; may be slower but does not overshoot much.
- Several concurrent requests with the same input → single-flight lock (Redis) to avoid duplicate calls.
- Client disconnects mid-stream → abort; do not count the full output.
- RAG (FR-20) has no endpoint; return 404/do not display.

## Requirements

### Functional Requirements

- **FR-16.1**: `POST /ai/deals/:id/summary` SSE; event `meta/token/done/error`; first token p95 < 3s;
  timeout 30s; abort on disconnect.
- **FR-16.2**: Prompt uses only the current org's data; mask email/phone; input ≤ 8,000 estimated tokens; the
  system prompt is fixed; CRM content is untrusted.
- **FR-16.3**: Provider errors do not affect the deal; return a friendly message; log requestId.
- **FR-17.1**: `POST /ai/deals/:id/follow-up-email` returns a draft JSON; does **not** send email; the user
  edits/copies.
- **FR-18.1**: `POST /ai/contacts/:id/score` → 202 runId; worker `ai`; `GET /ai/runs/:id`; score 0–100 + reason;
  history `ai_results`.
- **FR-18.2**: Eval dataset ≥ 30 leads; script measuring MAE/band/cost; run manually.
- **FR-19.1**: `ai_usage` on every call; daily quota org 200k/user 50k (env); 429 before the provider; cache 24h.
- **FR-19.2**: `GET /ai/usage` per permission; cost from the configured price table; not hard-coded.
- **FR-19.3**: Single-flight/cache by input hash; no cross-org caching.
- **FR-20**: Not implemented (ADR-009); no route/UI.

### Key Entities

- `ai_usage` (cost ledger), `ai_results` (output/history/cache); details in `docs/data-model.md` 4.14–4.15.
- Deal/Contact/Activity are the context source; not copied into AI tables.

## Success Criteria

- **SC-001**: First token p95 < 3s with the mock; < 5s with a real provider (state the environment).
- **SC-002**: 0 other-org data in the prompt (test + review).
- **SC-003**: 100% of calls have usage; the quota blocks before the provider; cache hits cost nothing.
- **SC-004**: The 30-lead eval runs; MAE ≤ 10; the report is stored.
- **SC-005**: 100% of AC have tests; mock provider in CI.

## Assumptions

- `AI_PROVIDER=mock` by default in dev/test; production configures a real provider.
- Model/prices are configured via env/JSON table; not hard-coded.
- Summary/draft use limited context; no RAG yet.
- Score runs through the queue; summary streams directly (C7 allows streaming).
- Email drafts are not sent; real sending is out of scope (Q3/Q5).
- Simple PII masking (email/phone) before sending; can be improved.

## Out of Scope

- RAG/FR-20, embedding, pgvector.
- Auto-send email, editing and sending inside the system (needs a new FR).
- Fine-tuning, self-hosted models.
- Complex multi-model routing/fallback.
- Free-form AI chat beyond the 3 use cases.
- Billing/payment for AI.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-16 | AC-FR16-01..07 | T700–T708, T718 |
| FR-17 | AC-FR17-01..04 | T709–T710, T718 |
| FR-18 | AC-FR18-01..06 | T711–T715, T718 |
| FR-19 | AC-FR19-01..07 | T703, T714, T716–T718 |
| FR-20 | — | ADR-009 (deferred) |
