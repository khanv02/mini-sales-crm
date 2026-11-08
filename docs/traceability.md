# Traceability Matrix

This matrix links the source spec, feature specs and tests. When an AC is added or changed, update this file in
the same PR. Convention: `AC-FRxx-yy`; task IDs use per-feature ranges (see `specs/README.md`).

## 1. Functional requirements

| Source | AC | Feature | Main tasks | Test/evidence | Status |
| --- | --- | --- | --- | --- | --- |
| FR-01 Register/login | AC-FR01-01..11 | 002 | T100–T113, T117–T119 | `test/integration/auth.spec.ts`, `test/unit/token.service.spec.ts` | Draft |
| FR-02 Member management | AC-FR02-01..07 | 002 | T114–T117, T119 | `test/integration/users.spec.ts`, `test/integration/rbac.spec.ts` | Draft |
| FR-03 Contacts | AC-FR03-01..08 | 003 | T200–T208, T221, T226 | `test/integration/contacts.spec.ts`, `test/perf/contacts-search.perf.ts` | Draft |
| FR-04 Pipeline/stage | AC-FR04-01..07 | 003 | T209–T211, T222 | `test/integration/pipelines.spec.ts` | Draft |
| FR-05 Deals/kanban | AC-FR05-01..10 | 003, 005 | T212–T217, T223–T224, T406 | `test/integration/deals.spec.ts`, `deals-concurrency.spec.ts`, `e2e/kanban-realtime.spec.ts` | Draft |
| FR-06 Win/loss | AC-FR06-01..05 | 003 | T218–T220, T224 | `test/integration/deals-win-loss.spec.ts` | Draft |
| FR-07 Activities/reminders | AC-FR07-01..10 | 004, 005 | T300–T310, T316–T317, T319, T410–T411 | `test/integration/activities.spec.ts`, `tasks.spec.ts`, `realtime.spec.ts` | Draft |
| FR-08 Dashboard | AC-FR08-01..09 | 004, 007 | T311–T315, T318–T319 | `test/integration/reports.spec.ts`, `test/perf/reports.perf.ts` | Draft |
| FR-09 Realtime | AC-FR09-01..12 | 005 | T400–T419 | `test/integration/realtime.spec.ts`, `notifications.spec.ts`, `e2e/kanban-realtime.spec.ts` | Draft |
| FR-10 CSV import | AC-FR10-01..08 | 006 | T500–T508, T519–T520 | `test/integration/imports.spec.ts`, `test/unit/import-worker.spec.ts` | Draft |
| FR-11 Webhook | AC-FR11-01..09 | 006 | T500, T509–T515, T519–T520 | `test/integration/webhooks.spec.ts`, `test/unit/webhook-worker.spec.ts` | Draft |
| FR-12 Task reminder email | AC-FR12-01..06 | 006 | T516–T520 | `test/integration/reminders.spec.ts`, `test/unit/mailer.spec.ts` | Draft |
| FR-13 Audit log | AC-FR13-01..05 | 007 | T600–T601, T606, T608 | `test/integration/audit.spec.ts` | Draft |
| FR-14 CSV export | AC-FR14-01..05 | 007 | T602, T606–T608 | `test/integration/exports.spec.ts` | Draft |
| FR-15 Rate limit/cache | AC-FR15-01..07 | 007 | T603–T607 | `test/integration/rate-limit.spec.ts`, `cache.spec.ts` | Draft |
| FR-16 AI summary | AC-FR16-01..07 | 008 | T700–T708, T718 | `test/integration/ai-summary.spec.ts`, `test/unit/ai-prompt.spec.ts` | Draft |
| FR-17 AI email draft | AC-FR17-01..04 | 008 | T709–T710, T718 | `test/integration/ai-email-draft.spec.ts` | Draft |
| FR-18 AI lead score | AC-FR18-01..06 | 008 | T711–T715, T718 | `test/integration/ai-score.spec.ts`, `evals/score-stability.ts` | Draft |
| FR-19 AI cost/quota | AC-FR19-01..07 | 008 | T703, T714, T716–T718 | `test/integration/ai-quota.spec.ts`, `ai-cache.spec.ts` | Draft |
| FR-20 RAG (optional) | — | 008 | Not implemented | `ADR-009` | Deferred |

## 2. Non-functional requirements

The AC definitions for NFR-01…NFR-07 live in [`docs/nfr.md`](nfr.md); the table below only maps them to
feature/task/test.

| Source | AC | Feature | Main tasks | Test/evidence | Status |
| --- | --- | --- | --- | --- | --- |
| NFR-01 Read performance | AC-NFR01-01..02 | 003, 004, 007 | T205, T226, T312, T607 | `test/perf/*.perf.ts`, p50/p95/p99 report | Draft |
| NFR-02 Security | AC-NFR02-01..04 | 001, 002, 003, 007 | T102, T115, T119, T603 | `test/integration/rbac.spec.ts`, `tenant-isolation.spec.ts`, security checklist | Draft |
| NFR-03 Reliability | AC-NFR03-01..03 | 001, 006 | T010, T020, T501, T519 | `test/integration/health.spec.ts`, `test/unit/queue.spec.ts` | Draft |
| NFR-04 Observability | AC-NFR04-01..02 | 001 | T009, T011 | `test/unit/logger.spec.ts`, Sentry smoke | Draft |
| NFR-05 Data/migration | AC-NFR05-01..02 | 001 | T007, T016 | migration from empty DB; `scripts/backup.ps1` | Draft |
| NFR-06 Delivery | AC-NFR06-01..02 | 001 | T005, T015, T017, T018 | `docs/quickstart.md`, `scripts/check-infra` | Draft |
| NFR-07 Quality | AC-NFR07-01..03 | 001 | T013, T014, T019 | CI workflow, coverage report, secret scan | Draft |

## 3. Endpoint → mandatory test matrix (C8)

Every endpoint must have at least: happy path, validation failure, lower role, different tenant. Endpoints with
extra ACs are annotated.

| Endpoint | Happy | Error/permission | Tenant | Extra |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | ✓ | duplicate/weak password | — | creates org+admin+audit |
| `POST /auth/login` | ✓ | wrong password, 429 | — | lockout, no email-existence leak |
| `POST /auth/refresh` | ✓ | expired, reuse, inactive user | — | rotate family |
| `POST /auth/logout` | ✓ | invalid token | — | revoke current family |
| `GET /auth/me` | ✓ | 401 | — | returns role/org |
| `GET/POST /users` | ✓ | Sales 403 | ✓ | audit |
| `PATCH /users/:id` | ✓ | last admin 409 | ✓ | role/active/audit |
| `GET/POST /contacts` | ✓ | validation | ✓ | Sales owner filter |
| `GET/PATCH/DELETE /contacts/:id` | ✓ | other Sales owner 404 | ✓ | soft delete |
| `GET/POST /pipelines` | ✓ | Sales 403 | ✓ | — |
| `PATCH/DELETE /pipelines/:id` | ✓ | deals remain 409 | ✓ | won/lost invariant |
| `POST /pipelines/:id/stages` | ✓ | missing won/lost, role 403 | ✓ | reorder/position |
| `POST/PATCH/DELETE /stages` | ✓ | deals remain 409, last stage 409 | ✓ | reorder |
| `GET/POST /deals` | ✓ | validation | ✓ | — |
| `GET/PATCH /deals/:id` | ✓ | other Sales owner 404 | ✓ | version |
| `PATCH /deals/:id/move` | ✓ | stale version 409 | ✓ | audit + realtime |
| `PATCH /deals/:id/assign` | ✓ | owner inactive/other org 400 | ✓ | Manager/Admin, audit/event |
| `GET/POST /deals/:id/activities` | ✓ | other Sales owner 404 | ✓ | task validation |
| `PATCH /activities/:id` | ✓ | 404 when the deal is not visible; 403 when visible but not creator/assignee | ✓ | audit before/after |
| `GET /tasks` | ✓ | — | ✓ | overdue |
| `PATCH /tasks/:id` | ✓ | not assignee 403 | ✓ | done_at |
| `GET /reports/summary` | ✓ | bad filter 400 | ✓ | Sales own scope |
| `GET /notifications` | ✓ | 401 | ✓ | unread filter |
| `PATCH /notifications/:id/read` | ✓ | another user's notification 404 | ✓ | idempotent |
| `POST /notifications/read-all` | ✓ | 401 | ✓ | own notifications only |
| `POST /imports/contacts` | ✓ | role 403, bad file | ✓ | 202, job id |
| `GET /imports/:id` | ✓ | job of another org 404 | ✓ | progress |
| `GET /imports/:id/errors` | ✓ | not finished 409 | ✓ | signed URL |
| `POST /webhooks/leads/:publicKey` | ✓ | bad HMAC 401 | — | idempotency, replay |
| `GET/POST/PATCH/DELETE /webhook-sources` | ✓ | non-Admin 403 | ✓ | — |
| `POST /webhook-sources/:id/rotate-secret` | ✓ | non-Admin 403 | ✓ | 24h grace, one-time secret |
| `GET /audit-logs` | ✓ | non-Admin 403 | ✓ | filter/pagination |
| `GET /exports/contacts` | ✓ | Sales 403 | ✓ | CSV injection |
| `GET /exports/deals` | ✓ | Sales 403 | ✓ | CSV injection |
| `POST /ai/deals/:id/summary` | ✓ | LLM error, timeout | ✓ | SSE, first token |
| `POST /ai/deals/:id/follow-up-email` | ✓ | other org 404 | ✓ | never auto-sends |
| `POST /ai/contacts/:id/score` | ✓ | quota 429 | ✓ | history |
| `GET /ai/runs/:id` | ✓ | run of another org 404 | ✓ | — |
| `GET /ai/usage` | ✓ | Sales sees own only | ✓ | cost |
| `GET /health/live`, `/health/ready` | ✓ | DB/Redis down | — | — |

## 4. ACs that require cross-cutting tests

| Topic | AC | Test |
| --- | --- | --- |
| Tenant isolation | AC-NFR02-04 | Every integration file: create org B, use token B to call org A resources → 404 |
| Audit in the same transaction | AC-FR05-03, AC-FR06-05 | Rollback test: failure after the update → no audit row, data unchanged |
| Optimistic lock | AC-FR05-04..05 | Two parallel requests with the same version: one 200, one 409 |
| Webhook idempotency | AC-FR11-04 | Send the same key twice: 1 contact, 1 event |
| Import idempotency | AC-FR10-05 | Same file hash twice: same job / no duplicate contact |
| Realtime RBAC | AC-FR09-05 | Sales B never receives Sales A's deal events |
| Cache invalidation | AC-FR15-05 | Move a deal → the summary no longer returns the old number |
| AI quota | AC-FR19-02 | Over the limit → 429, provider not called |
| CSV injection | AC-FR14-03 | A cell containing `=cmd` is escaped |
| Refresh token reuse | AC-FR01-08 | Reusing a rotated token → the whole family is revoked |

## 5. Status & gaps

- [x] FR-01…FR-19 have feature, AC, tasks and tests.
- [x] NFR-01…NFR-07 have feature/task/test.
- [ ] FR-20 deferred (ADR-009) — not counted in M3.
- [ ] No automated performance test in CI yet (nightly/manual); to be added after M1.
- [ ] No automated security test (ZAP) yet — manual checklist only at M2.
- [ ] No automated LLM eval in CI yet; run manually per `evals/`.
