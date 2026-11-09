# Feature Specification: Foundation (M0)

**Feature Branch**: `001-foundation`
**Created**: 2026-11-08
**Status**: Draft — ready for review
**Input**: M0 in spec v0.1; NFR-03, NFR-04, NFR-05, NFR-06, NFR-07; C1–C9

## User Scenarios & Testing

### US-1 — Run the project from a clone (Priority: P1)

A newcomer clones the repo, follows the README and has the app running in a few commands without asking the author.

**Why P1**: M0 DoD; if it does not run, every later feature is meaningless.

**Independent test**: Delete volumes, clone clean, run exactly the commands in `docs/quickstart.md`; open the web
app and call health.

**Acceptance Scenarios**:

1. **AC-M0-01** Given a machine with Node/pnpm/Docker, When running `pnpm install`, `docker compose up -d`,
   `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, Then the API listens on `:3000`, the web app on `:5173`, with no
   errors.
2. **AC-M0-02** Given the running app, When calling `/health/live` and `/health/ready`, Then both return 200 and
   ready checks DB + Redis.
3. **AC-M0-03** Given the seed has run, When opening the web app, Then the main layout renders an empty state
   without errors; real login is verified in feature 002.

---

### US-2 — CI blocks regressions (Priority: P1)

Every PR runs lint, typecheck, unit, integration and build; nothing merges while CI is red.

**Why P1**: C8/C9 and NFR-07; AI-written code needs an automated safety net.

**Independent test**: Open a PR that breaks a type; CI must go red. Clean PR; CI must be green.

**Acceptance Scenarios**:

1. **AC-M0-04** Given a new PR, When CI runs, Then lint + typecheck + unit + integration + build all run.
2. **AC-M0-05** Given service coverage < 70%, When CI runs, Then the job fails.
3. **AC-M0-06** Given a commit containing `.env` or a secret, When CI runs, Then the secret scan fails (or a
   pre-commit hook blocks it).

---

### US-3 — Safe observability & configuration (Priority: P1)

Dev/ops see JSON logs with requestId, 5xx errors reach Sentry, and the app fails fast when env vars are missing.

**Why P1**: NFR-04, C6; basic debugging and security.

**Independent test**: Send a request with `X-Request-Id`; inspect the log. Remove a required env var; the app must
not start. Trigger a 500; Sentry receives it (or its mock does).

**Acceptance Scenarios**:

1. **AC-M0-07** Given a request with `X-Request-Id`, When it is handled, Then the JSON log lines carry the same
   requestId, org/user (when available), route, status and latency; no password/token.
2. **AC-M0-08** Given a missing `DATABASE_URL` or JWT secret, When starting up, Then the app stops with a clear
   message instead of running half-configured.
3. **AC-M0-09** Given a 5xx error, When it occurs, Then the Sentry event has requestId/release, and the response
   leaks no stack trace.
4. **AC-M0-10** Given Redis/DB is down, When calling `/health/ready`, Then 503 with the failing component (no
   connection string leaked).

---

### US-4 — Reproducible migration & seed (Priority: P2)

An empty DB runs migrations to build the schema; the seed is idempotent; a minimal backup/restore script exists.

**Why P2**: NFR-05; needed before M1 but not blocking day-to-day development.

**Independent test**: Drop the DB, run migrate/seed twice; schema and data stay stable.

**Acceptance Scenarios**:

1. **AC-M0-11** Given an empty DB, When running `pnpm db:migrate`, Then the schema is correct with no errors;
   re-running changes nothing.
2. **AC-M0-12** Given the seed has already run, When running it again, Then no duplicate org/user/pipeline is
   created; exit code 0.
3. **AC-M0-13** Given existing data, When running `scripts/backup.ps1`, Then a backup file is produced and
   restoring it into a temporary DB succeeds (manual test).

### Edge Cases

- Docker not running → a clear instruction, not a stack trace.
- Ports 3000/5173 taken → documented in `docs/quickstart.md` section 8 (the README stays product-only).
- Windows paths/CRLF → PowerShell scripts; no bash dependency.
- Redis down while the API still starts → `/health/live` 200, `/health/ready` 503.
- Perf seed accidentally enabled in production → blocked by `NODE_ENV=production` plus `ALLOW_SEED=false`
  (default); the perf dataset additionally requires `SEED_PERF=true`.
- Migration failing half-way → transaction/rollback; never a half-applied schema.

## Requirements

### Functional Requirements

- **FR-M0.1**: The repo is a pnpm workspace with `backend/` (API + Prisma), `frontend/`, `packages/shared/`,
  `infra/`, `docs/`, `specs/`.
- **FR-M0.2**: NestJS API with TypeScript strict, prefix `/api/v1`, Swagger at `/api/docs` (dev).
- **FR-M0.3**: Web app with React + Vite + TS, Tailwind + shadcn/ui, TanStack Query, React Router.
- **FR-M0.4**: Docker Compose with PostgreSQL 16, Redis 7, Mailpit; healthchecks; durable volumes.
- **FR-M0.5**: zod env schema; fail fast; complete `.env.example`; no secrets in Git.
- **FR-M0.6**: Prisma with versioned migrations; idempotent seed; backup/restore script.
- **FR-M0.7**: `/health/live`, `/health/ready`; graceful shutdown.
- **FR-M0.8**: pino JSON logs with requestId; Sentry for 5xx; redaction.
- **FR-M0.9**: GitHub Actions CI: lint, typecheck, unit, integration (PG/Redis), build, coverage.
- **FR-M0.10**: Test harness: dedicated test DB, factories, login helper, coverage config.
- **FR-M0.11**: `scripts/check-infra` verifies DB/Redis; the README/quickstart works.
- **FR-M0.12**: Unified error filter `{code,message,details?,requestId}`.

### Key Entities

No new business entity at M0. The first migration creates `organizations`, `users` and `refresh_tokens` (the
foundation for feature 002) plus the extensions `pg_trgm`, `unaccent`, `pgcrypto`.

## Success Criteria

- **SC-001**: A newcomer clones and runs it within ≤ 15 minutes, without asking.
- **SC-002**: CI responds in < 10 minutes for an average PR.
- **SC-003**: 100% of merged PRs have green CI; 0 secrets committed.
- **SC-004**: `/health/ready` responds in < 500ms while dependencies are healthy.

## Assumptions

- Node 22 LTS, pnpm 9, Docker Compose v2.
- Dev runs locally; production deployment comes later (M4) and needs no Kubernetes.
- M0 only has the foundation schema; business tables arrive with later features.
- Sentry may be empty in dev; mandatory in production.
- No local HTTPS required; the `Secure` cookie flag is off in dev in a controlled way.

## Out of Scope

- CRM functionality (contacts/deals/kanban).
- Full auth (part of 002), pipelines (003).
- Kubernetes, Terraform, multi-region, HA.
- Scheduled automatic backups; a manual script only.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| M0, NFR-03 | AC-M0-02, AC-M0-10 | T010, T020 |
| M0, NFR-04 | AC-M0-07, AC-M0-09 | T009, T011 |
| M0 | AC-M0-08 | T006 |
| M0, NFR-05 | AC-M0-11..13 | T007, T016 |
| M0, NFR-06 | AC-M0-01, AC-M0-03 | T001–T006, T015, T017, T018 |
| M0, NFR-07 | AC-M0-04..06 | T013, T014, T019 |
| M0 | AC-M0-01..13 | T001–T020 |

AC-NFR03-01…AC-NFR07-03 are defined in [`docs/nfr.md`](../../docs/nfr.md); the table above lists the M0 scenarios.
