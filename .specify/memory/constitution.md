# Pulse CRM Constitution

**Version**: 1.0.1 | **Ratified**: 2026-11-08 | **Last Amended**: 2026-11-09

Origin: `docs/Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md` v0.1, sections 3 (C1–C9), 10 and 11.
This document is the law of the project. When spec and code conflict, the spec wins. When the spec is
ambiguous, resolve it with an ADR or a spec change request before coding.

## Core Principles

### I. The spec is the single source of truth (NON-NEGOTIABLE)

Every behaviour change must start from a requirement with an ID (`FR-xx`, `NFR-xx`) and verifiable acceptance
criteria (`AC-FRxx-yy`). There is no "convenience" code outside the spec.

- Every feature has `spec.md`, `plan.md` and `tasks.md` before implementation starts.
- Every task must trace back to an AC; every AC must have at least one test.
- Changing direction: edit the spec → record an ADR → update plan/tasks → only then change code.
- Requirements that exist only in chat, a ticket or someone's memory are not accepted.

**Rationale**: a one-person + AI project needs protection against scope creep and against "code that is right
but nobody understands why".

### II. Tenant isolation and least privilege (NON-NEGOTIABLE)

Every business table has `org_id`. Every read/write of business data filters by the `org_id` taken from the
authenticated principal, never from the client.

- Tenant context comes from the JWT/guard, never from a client-supplied body, query or header.
- Repositories must take an explicit `orgId`; there is no "default tenant".
- Use composite foreign keys `(org_id, id)` in the database so cross-tenant references are rejected.
- Cross-tenant access returns `404` (never confirming that the resource exists), unless a test requires `403`.
- Every endpoint has tests: a user of org B calling an org A ID, and a lower role calling a protected endpoint.
- Sales sees only data they own or are assigned; Manager/Admin see the whole org. There is no "just this once"
  exception.

**Rationale**: ADR-002. The biggest risk of a shared schema is one `where` clause missing `org_id`.

### III. Immutable audit inside the same transaction (NON-NEGOTIABLE)

Every business data change writes an `audit_logs` row in the **same transaction** as the change.

- Audit contains: who (`actor_id`), what (`action`), the target (`entity`, `entity_id`), when, before/after.
- There is no API to edit or delete audit rows. Audit is append-only at the application layer; production
  should restrict database permissions.
- Never write secrets, password hashes, tokens or full webhook payloads containing PII into `before/after`.
- If the transaction rolls back, the audit row rolls back too. If the audit insert fails, the business change
  fails.
- Auth events (failed login, token reuse) go to security logs; user/role/active changes are audited.

**Rationale**: ADR-003. "There is never a change without a log" only holds when the log lives in the same
transaction.

### IV. Test-first per AC (NON-NEGOTIABLE)

For every AC: write the test first, watch it fail, then implement until it passes.

- C8: every endpoint has at least one happy-path test and one error/permission test.
- Tenant-isolation tests are mandatory for every endpoint.
- `409` tests are mandatory for the kanban; idempotency tests are mandatory for webhook/import.
- Unit tests for services; integration tests against real PostgreSQL + Redis; Playwright E2E for main flows.
- AI: mock the LLM in CI; evaluations run manually.
- Service-layer coverage ≥ 70% (NFR-07), excluding generated files.

**Rationale**: AI-written code is only trustworthy when behaviour is locked down by tests.

### V. Layered architecture and modular monolith

Mandatory flow: `controller → service → repository → Prisma`.

- Controllers only: parse/validate input, call the service, map the response. They never call Prisma/DB directly.
- Services hold business rules, transactions, audit and domain-event emission.
- Repositories are the only Prisma-aware layer; every function takes `orgId` when accessing business data.
- NestJS modules follow bounded contexts: auth, users, contacts, pipeline, deals, activities, notifications,
  imports, webhooks, reports, audit, ai.
- No cross-module repository imports; communicate through public services or domain events.
- Modular monolith (ADR-001): one deployable with clear module boundaries so it can be split later.

### VI. Asynchronous for heavy work or external dependencies

CSV import, webhook processing, email sending, scheduled reminders and heavy LLM calls run through BullMQ or a
stream.

- Synchronous requests never wait for email/LLM/import completion.
- Jobs have bounded retries, backoff, dead-letter handling and observability.
- Jobs must be idempotent or guarded by an idempotency key; a retry must not create duplicate records.
- Realtime is best-effort after commit; the database is the source of truth. Reconnecting clients must refetch.

**Rationale**: C7. Keep read API p95 below 300ms and never let an external service take a request down.

### VII. Security, secrets and data

- TypeScript `strict`; do not use `any` without a justification comment on that line.
- Hash passwords with Argon2id (or bcrypt with cost ≥ 12). Compare HMACs with `timingSafeEqual`.
- Secrets come only from environment variables; keep `.env.example`; never commit `.env`, tokens or keys.
- Enable helmet, a CORS whitelist and body limits; validate every input with zod/DTO.
- Refresh tokens rotate, are stored hashed, detect reuse and revoke the whole family.
- Webhooks: verify HMAC over the raw body plus timestamp, prevent replay, cap the payload size.
- AI: send only the current org's data; treat CRM content as untrusted; mask PII where possible.
- Errors return `{ code, message, details?, requestId }`; never leak stack traces, SQL or secrets.

### VIII. Observability and operations

- JSON logs carry `requestId`, `orgId`, `userId`, `route`, `status`, `latencyMs`; PII and secrets are redacted.
- 5xx errors go to Sentry with the release and requestId.
- `/health/live` and `/health/ready` (DB, Redis); graceful shutdown closes HTTP, workers and queues.
- Migrations are versioned and run from an empty database; at least a manual backup/restore script exists.
- CI runs lint, typecheck, unit, integration and build; it fails when coverage is below the threshold.

### IX. Deliberate simplicity and documented decisions

- Choose the simplest solution that satisfies the AC; do not add abstractions for futures that are not in the spec.
- Every significant architectural decision has an ADR: context, choice, trade-offs, consequences.
- Do not add a large dependency when a standard solution suffices; every new dependency needs a reason in the PR.
- Documentation must be enough for a stranger to run and understand the system within 10 minutes (M4).

## Mandatory technical constraints (C1–C9)

| ID | Constraint | How it is enforced | Verification |
| --- | --- | --- | --- |
| C1 | TypeScript strict; limit `any` | `tsconfig` strict, ESLint `no-explicit-any` | `pnpm typecheck`, lint |
| C2 | Controller → service → repository | Code review, architecture/import lint test | PR checklist |
| C3 | Every business table has `org_id`; every query filters org | Composite FKs, repository signatures, tenant tests | Tenant-isolation tests |
| C4 | Every change writes audit in the same transaction | `AuditService.record(tx, ...)` | Audit integration test |
| C5 | Validate input; uniform errors | zod/DTO + global exception filter | Error contract tests |
| C6 | No secrets in Git; `.env.example` | `.gitignore`, secret scan, env schema | CI secret scan |
| C7 | Heavy work through queue/stream | BullMQ/SSE, never block the request | Job/stream tests |
| C8 | Every endpoint has happy + error/permission tests | Per-endpoint test matrix | Coverage + review |
| C9 | Small PRs tagged with requirement IDs | PR template, branch naming | Review |

## Quality Gates

### Gate 1 — Spec

- Prioritised user stories, measurable ACs, edge cases and out-of-scope items are present.
- Every source `FR-xx` maps to a feature; no unresolved "NEEDS CLARIFICATION" remains.
- The spec review records conflicts/ambiguities and the decisions taken.

### Gate 2 — Plan

- The Constitution Check C1–C9 passes, or an approved Complexity Tracking table exists.
- Data model, API contract, event contract and test strategy are clear.
- Security/tenant/cost risks are stated together with their mitigations.

### Gate 3 — Tasks

- Tasks are small (≤ 1 day) and carry file paths, ordering dependencies and tests first.
- Every task is tagged with its AC/FR; an independent demo checkpoint exists.

### Gate 4 — Implementation

- Tests are red before coding and green after.
- No schema change outside a migration; no contract change outside the spec/ADR.
- Audit, `org_id`, validation, error format and logging are in place.

### Gate 5 — Merge

- CI green: lint, typecheck, unit, integration, build, service-layer coverage ≥ 70%.
- Tenant and lower-role tests exist for every new endpoint.
- The PR is small and describes FR/AC, schema/API impact and rollback.

### Gate 6 — Release

- The quickstart from a fresh clone works; `/health/ready` is green.
- Migrations have run against a data copy; the backup has been verified.
- The main flow is demoed; no P1/P2 defects are open.

## Development Workflow

1. **Specify**: create `specs/###-feature/spec.md` from the template; assign AC IDs.
2. **Clarify**: run the spec review; settle ambiguity with an ADR/SCR.
3. **Plan**: write `plan.md`; run the Constitution Check; settle data/API/event/test design.
4. **Tasks**: write `tasks.md`; split by user story, test-first.
5. **Implement**: code per task; small commits; update the task checklist.
6. **Verify**: run tests/CI; check each AC; update traceability; demo.

**Branch**: `###-feature-name` (for example `003-contacts-pipeline`).
**Commit**: `feat(FR-05): move deal with optimistic lock`.
**PR**: one feature slice or one related task group; never mix a large refactor with a feature.

## Governance

- This constitution supersedes any habit or verbal agreement. Every PR must be checked against it.
- Amending the constitution: record an ADR with the reason and impact, bump the version per SemVer, and update
  the effective date.
- Temporary exceptions must live in the plan's `Complexity Tracking` table with an approver and an expiry date.
- If spec and constitution conflict: stop coding and fix the spec/ADR first.
- Review at every milestone: drop expired exceptions and fold the lessons into the spec review.
- All documentation, specs, plans, tasks, ADRs, checklists and config files are written in English;
  identifiers/code/API are English as well (see `AGENTS.md` section 2). User-facing copy (UI strings, error
  messages, email templates) is product content rather than documentation: it stays Vietnamese by default and is
  selected through `Accept-Language`. The root `README.md` is the single documented exception: it is the
  client-facing product introduction, stays Vietnamese, and must not contain internal artifacts (ADR/SCR/task IDs,
  the SDD file index, environment variables, ports or limits). The file `docs/Pulse CRM — Đặc tả sản phẩm
  (Spec-Driven).md` is the original concept PRD (v0.1 reference archive) preserved in Vietnamese for historical
  lineage; it is frozen, while the active executable SDD is maintained in English under `specs/` and `docs/`.

**Version**: 1.0.1 | **Ratified**: 2026-11-08 | **Last Amended**: 2026-11-09
