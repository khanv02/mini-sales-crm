# NFR Acceptance Criteria

**Purpose**: define measurable acceptance criteria for NFR-01…NFR-07 (source spec section 9). Feature specs
reference `AC-NFRxx-yy`; this file is the single source of definition. `AC-M0-*` in
`specs/001-foundation/spec.md` are the corresponding M0 delivery scenarios.

**Convention**: every AC must have automated evidence (test/perf/CI) or an explicitly documented manual check.
Thresholds may only be relaxed by an ADR.

## Quick mapping

| NFR | AC | Verifying feature | Evidence |
| --- | --- | --- | --- |
| NFR-01 Performance | AC-NFR01-01..02 | 003, 004, 007 | `test/perf/*.perf.ts`, `docs/perf/` |
| NFR-02 Security | AC-NFR02-01..04 | 001, 002, 003, 007 | integration/security tests, checklist |
| NFR-03 Reliability | AC-NFR03-01..03 | 001, 006 | `health.spec.ts`, `queue.spec.ts`, shutdown test |
| NFR-04 Observability | AC-NFR04-01..02 | 001 | `logger.spec.ts`, Sentry smoke |
| NFR-05 Data | AC-NFR05-01..02 | 001 | migration test, backup/restore |
| NFR-06 Delivery | AC-NFR06-01..02 | 001 | `docs/quickstart.md`, `scripts/check-infra` |
| NFR-07 Quality | AC-NFR07-01..03 | 001 | CI workflow, coverage, secret scan |

## NFR-01 — Performance

- **AC-NFR01-01**: Given a seed of 10,000 contacts, 5,000 deals and 20,000 activities, When measuring 3 runs of
  `GET /contacts?search=…&limit=50`, `GET /deals?pipelineId=…` and `GET /reports/summary?from=…&to=…` with
  autocannon/k6, Then p95 < 300ms (median of the 3 runs), no cold start; results are recorded in `docs/perf/`.
- **AC-NFR01-02**: Given the same seed, When measuring `PATCH /deals/:id/move`, Then p95 < 500ms; audit and
  events do not push p95 above the threshold; `EXPLAIN (ANALYZE, BUFFERS)` shows no sequential scan on large
  tables.

## NFR-02 — Security

- **AC-NFR02-01**: Given a registration or a password change, When stored in the database, Then the password
  exists only as argon2id (or bcrypt with cost ≥ 12); response/log/audit never contain the password or its hash.
- **AC-NFR02-02**: Given the running app, When a request is sent, Then helmet headers are present; CORS allows
  only whitelisted origins and never `*` while credentials are enabled; the refresh cookie is `HttpOnly`,
  `SameSite=Lax`, `Secure` in production (see `ADR-015`, which is the deciding record for this attribute).
- **AC-NFR02-03**: Given input carrying an SQL-injection style payload such as `<script>alert(1)</script>` or
  `' OR 1=1`, When it is stored and rendered back, Then queries use parameterized/ORM access, data is rendered
  escaped, no script executes; validation rejects wrong types/lengths.
- **AC-NFR02-04**: Given 2 orgs A/B, When a user of org B calls any endpoint with a resource of org A (even with
  a guessable ID), Then 404 `NOT_FOUND`, no DB change, no existence leak; the test is repeated for every
  endpoint listed in `docs/traceability.md` section 3.

## NFR-03 — Reliability

- **AC-NFR03-01**: Given the running app, When calling `/health/live` and `/health/ready`, Then live returns 200
  while the process is alive; ready checks DB + Redis and returns 503 with the failing component when a
  dependency is down, without leaking connection strings.
- **AC-NFR03-02**: Given in-flight requests/jobs, When `SIGTERM` is received, Then no new request is accepted,
  in-flight work finishes within ≤ 30s, and DB/Redis/queue connections close cleanly; no response is cut and no
  job is lost.
- **AC-NFR03-03**: Given a failed BullMQ job, When it retries, Then exponential backoff runs at most 3 times
  before moving to `DEAD`; `DEAD` jobs can be inspected/retried; a retry never duplicates side effects
  (idempotent).

## NFR-04 — Observability

- **AC-NFR04-01**: Given a request with or without `X-Request-Id`, When it is handled, Then one-line JSON logs
  include requestId (echoing the header), method, route, status, latency and userId/orgId when authenticated;
  password, token, cookie and secret are redacted; sensitive bodies are not logged.
- **AC-NFR04-02**: Given a 5xx error, When it happens, Then Sentry receives an event with requestId, release,
  route and orgId; the response only contains `{code,message,requestId}` with no stack/SQL/internal path.

## NFR-05 — Data & migration

- **AC-NFR05-01**: Given an empty database, When all migrations run, Then the schema matches the expected
  version order; re-running changes nothing; a mid-way failure never leaves a half-applied schema
  (transaction/rollback or explicit repair instructions).
- **AC-NFR05-02**: Given existing data, When running `scripts/backup.ps1` and restoring it into a temporary
  database, Then the backup opens and data/schema match; the procedure is documented in `docs/quickstart.md`.

## NFR-06 — Delivery

- **AC-NFR06-01**: Given a clean machine with Node/pnpm/Docker, When following `docs/quickstart.md`, Then the
  app runs within ≤ 15 minutes on Windows/macOS/Linux without asking the author; common failures are documented.
- **AC-NFR06-02**: Given infrastructure that is not ready, When running `scripts/check-infra`, Then it exits
  non-zero with a message naming which DB/Redis is unreachable; it exits 0 when everything is ready.

## NFR-07 — Quality

- **AC-NFR07-01**: Given a new PR, When CI runs, Then lint, typecheck, unit, integration (real PostgreSQL +
  Redis) and build are mandatory; any red job blocks the merge.
- **AC-NFR07-02**: Given a test run, When coverage is computed, Then the service layer
  `backend/src/modules/**/*.service.ts` is ≥ 70% line and branch; below the threshold fails CI (unless a
  reviewed justification is recorded).
- **AC-NFR07-03**: Given a commit containing `.env` or a secret, When CI/pre-commit runs, Then the secret scan
  fails and blocks the merge; 0 real secrets in the branch history.

## AC-M0 ↔ AC-NFR traceability

| AC-M0 | AC-NFR |
| --- | --- |
| AC-M0-02, AC-M0-10 | AC-NFR03-01 |
| AC-M0-07 | AC-NFR04-01 |
| AC-M0-09 | AC-NFR04-02 |
| AC-M0-11 | AC-NFR05-01 |
| AC-M0-13 | AC-NFR05-02 |
| AC-M0-01, AC-M0-03 | AC-NFR06-01 |
| AC-M0-04 | AC-NFR07-01 |
| AC-M0-05 | AC-NFR07-02 |
| AC-M0-06 | AC-NFR07-03 |

AC-M0-08 (fail fast on missing env) and AC-M0-12 (idempotent seed) are additional M0 requirements that do not
belong to NFR-01…07.
