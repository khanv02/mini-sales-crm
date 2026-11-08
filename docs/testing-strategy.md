# Testing Strategy

**Goal**: every AC has test evidence; every endpoint has happy + error/permission + tenant coverage; CI blocks
regressions. Section 10 of the source spec is the requirement; this document is how it is executed.

## 1. Tooling

| Layer | Tool | Note |
| --- | --- | --- |
| Backend unit | Jest (Nest default) | service, guard, mapper, token, prompt |
| Backend integration | Jest + Supertest + real PostgreSQL/Redis | Docker service; no DB mocks |
| Contract | Supertest + zod/OpenAPI check | response/error shape |
| E2E | Playwright | Chromium; 3–5 main flows |
| Frontend unit | Vitest + Testing Library | important hooks/components |
| Perf | autocannon/k6 + seed script | manual/nightly |
| AI eval | Node script + dataset JSON | calls the mock/real provider and compares |

SQLite is not used for integration: partial-unique behaviour, jsonb, trigram and `timestamptz` differ from
PostgreSQL.

## 2. Pyramid & scope

```text
        E2E (Playwright)        3–5 flows
      Integration (Supertest)   every endpoint
    Unit (Jest/Vitest)          service/guard/prompt
```

- **Unit**: pipeline rules (won/lost), position midpoint, version conflict, report formulas, token
  rotation/reuse, HMAC verify, quota, prompt truncation, CSV escape.
- **Integration**: controller → service → repository → PostgreSQL/Redis; real auth; the queue worker runs inside
  the test (no BullMQ UI needed).
- **E2E**: login → create contact/deal → drag the kanban → another client sees it in realtime; import → view
  errors; webhook → lead; AI summary stream (mock provider).

## 3. Test data

- Each test file uses its own database or schema; migrations run once and data is truncated between tests.
- Factories in `apps/api/test/factories`:
  - `createOrg({ name })`
  - `createUser({ org, role, active })`
  - `createContact({ org, owner })`
  - `createPipeline({ org, won/lost })`
  - `createDeal({ org, stage, owner, version })`
  - `createActivity({ deal, type, assignee, dueAt })`
  - `loginAs(user)` → access token + cookie.
- Every tenant test creates **2 orgs** with users in both; never share an org.
- The perf seed is separate and does not run in the default CI.
- Never use production data; never log tokens/passwords.

## 4. Mandatory matrix per endpoint

| Case | Assert |
| --- | --- |
| Happy path | Status + body schema + side effect (DB/audit/event) |
| Validation | 400 `VALIDATION_ERROR`, details.field |
| Auth | 401 when the token is missing/expired |
| Lower role | 403 `FORBIDDEN` (or 404 when existence is hidden) |
| Different tenant | 404 `NOT_FOUND`, no DB change |
| Sales accessing another owner's record | 404 |
| Idempotency (when applicable) | Sent twice → 1 side effect |
| Audit (mutation) | 1 row with the right actor/entity/before/after |
| No leakage | Response/log never contain password_hash/token/secret |

## 5. Special tests

### 5.1 Optimistic locking

```ts
const [a, b] = await Promise.all([
  moveDeal(deal.id, { stageId: s2, position: 0, version: 1 }),
  moveDeal(deal.id, { stageId: s3, position: 0, version: 1 }),
]);
expect([a.status, b.status].sort()).toEqual([200, 409]);
```

- One request wins, the other receives `409 DEAL_VERSION_CONFLICT` with `currentVersion`.
- The DB holds a single final stage; only one move audit row exists.

### 5.2 Audit transaction

- Mock/force a failure after the update inside the transaction → rollback; assert there is no audit row and the
  data is unchanged.
- A successful update → correct, redacted `before/after` audit.

### 5.3 Realtime

- Use 2 socket clients (Sales A, Sales B) + Manager.
- A moves a deal → B does not receive it; Manager and the owner do.
- Measure the time from HTTP 200 until client B/Manager receives the event; p95 ≤ 1000ms (CI allows 1500ms).
- A socket reconnect invalidates/refetches queries; no event replay is required.

### 5.4 Webhook

- Correct signature → 202; wrong → 401; stale timestamp → 401; missing idempotency → 400.
- Sending the same key twice → 202 both times, 1 contact, 1 event.
- A different payload with the same key → 409 `WEBHOOK_EVENT_CONFLICT` (nothing new is created).
- A worker failing 3 times → status `DEAD`; retry creates no duplicate contact.

### 5.5 Import

- A 5,000-row file → 202 in < 1s; poll the job → progress; the error report lists the failing rows.
- Re-running the same file → same job / no duplicate contacts.
- Duplicate emails inside the file → skip + report; never abort the whole file.
- Wrong header / too many rows → 400.

### 5.6 AI

- Mock provider:
  - Summary: first token < 3s (simulated delay); org isolation; truncation; provider error.
  - The email draft never calls a send endpoint; it never auto-sends.
  - Score returns 0–100 + reason; history; a cache hit does not call the provider.
  - Quota: exceeding it → 429 and the provider is never called.
- The real provider only runs in manual evals, never in CI.

## 6. E2E Playwright

Minimum flows:

1. **Core**: login → create contact → create deal → drag the kanban → open the deal → add a note → close as won.
2. **Realtime**: 2 browser contexts; A moves; B sees the card change column within ≤ 1s.
3. **Conflict**: 2 contexts on the same deal; A moves; B moves with a stale version → 409 toast + reload.
4. **Import**: upload a 5,000-row CSV → progress → download the error report.
5. **AI**: open a deal → the summary stream renders; provider error → friendly message.

E2E uses its own seed and turns rate limiting off except for the rate-limit tests. It runs headless in CI with
PostgreSQL/Redis.

## 7. Performance (NFR-01)

- Seed: 10,000 contacts, 5,000 deals, 20,000 activities, 2 orgs.
- Scripts: `apps/api/test/perf/seed-perf.ts` (deterministic seed), `run-perf.ts` (runner) and per-suite scenario
  files such as `contacts-search.perf.ts` (003 T205) and `reports.perf.ts` (004 T312); results are written to
  `docs/perf/` (see `docs/nfr.md` NFR-01).
- Measure p50/p95/p99 for:
  - `GET /contacts?search=...&limit=50`
  - `GET /deals?pipelineId=...`
  - `GET /reports/summary?from=...&to=...`
  - `PATCH /deals/:id/move`
- Thresholds: p95 < 300ms for reads, < 500ms for writes; run 3 times and take the median.
- Cold start is excluded; record the machine CPU/RAM; store the results in `docs/perf/`.
- On failure: `EXPLAIN ANALYZE`, check indexes; never optimise blindly.

## 8. AI eval (FR-18)

- Dataset `evals/lead-scoring.json`: ≥ 30 leads with a human-approved label/expected band (0–100).
- Run 3 times with the same input and compute:
  - MAE between runs (stability) — target average ≤ 10 points.
  - Share of results inside the expected band ≥ 80%.
  - Average tokens/cost.
- It never blocks CI; run it before an AI release and store results in `evals/reports/`.
- Changing the prompt/model → re-run the eval; record an ADR when the model changes.

## 9. CI

```yaml
jobs:
  quality:
    - pnpm install --frozen-lockfile
    - pnpm lint
    - pnpm typecheck
    - pnpm test:unit
    - pnpm test:integration   # services: postgres:16, redis:7
    - pnpm build
    - coverage check (service layer ≥ 70%)
  e2e:
    needs: quality
    - docker compose up -d postgres redis mailpit
    - pnpm db:migrate && pnpm db:seed
    - pnpm test:e2e
```

- Cache the pnpm store; upload coverage + the Playwright report.
- Perf/AI evals do not run by default; nightly/manual only.
- Flaky tests: at most 1 retry in E2E; if still flaky → open an issue, never raise retries indefinitely.

## 10. Coverage

- Measure the service layer (excluding generated Prisma code, DTOs and module boilerplate).
- Global threshold: 70% line/branch for `apps/api/src/modules/**/*.service.ts` and important repositories.
- Coverage never replaces behaviour tests; ACs come first.
- A PR that drops coverage below the threshold fails CI unless the PR records a justification.

## 11. Test data & privacy

- Never use real emails/phone numbers; use `@example.test`.
- Seed passwords are for local/test only.
- Test logs never contain tokens; mask them when needed.
- Drop the test database after CI runs.
