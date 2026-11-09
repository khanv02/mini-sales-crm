# Implementation Plan: Foundation (M0)

**Branch**: `001-foundation` | **Date**: 2026-11-08 | **Spec**: `specs/001-foundation/spec.md`

## Summary

Build a pnpm monorepo with a NestJS API, React/Vite web, PostgreSQL/Redis/Mailpit via Docker Compose, the first
Prisma migration, health checks, log/Sentry, CI and the test harness. The goal is a fresh clone that runs the
quickstart correctly before any CRM feature is written.

## Technical Context

- **Language**: TypeScript 5.x strict; Node.js 22 LTS; pnpm 9.
- **Backend**: NestJS (current stable), Prisma, zod, pino, Sentry, BullMQ (installed, used from 004/006).
- **Frontend**: React + Vite, TypeScript, TanStack Query, React Router, Tailwind + shadcn/ui, dnd-kit (installed
  for 003), Vitest + Testing Library.
- **Storage**: PostgreSQL 16, Redis 7.
- **Testing**: Jest + Supertest (API), Vitest (web), Playwright (E2E).
- **Ops**: Docker Compose, GitHub Actions, pino, Sentry.
- **Scale**: 10k contacts/5k deals/2 org; one API instance; shared-process worker for the MVP.
- **Performance**: `/health/ready` < 500ms; CI < 10 minutes.

## Constitution Check

| Gate | How it is met | Status |
| --- | --- | --- |
| C1 strict | `tsconfig` strict, ESLint no-explicit-any, typecheck CI | Pass |
| C2 layering | Scaffold module/controller/service/repository, no DB in the controller | Pass |
| C3 org_id | Foundation schema has org; policy/repository pattern from 002 | Pass |
| C4 audit | `audit_logs` schema in `0001_init`; AuditService implemented in 002 | Pass |
| C5 validate/error | zod env + global exception filter + error shape | Pass |
| C6 secret | `.env.example`, `.gitignore`, env schema fail-fast, secret scan | Pass |
| C7 async | BullMQ module scaffold (T020); separate queues declared in 004/006/008 | Pass |
| C8 test | Test harness + health tests; CI runs unit/integration | Pass |
| C9 small PRs | Tasks split small, commits per T00x (T001–T020); PR template | Pass |

No exceptions.

## Project Structure

```text
.
├─ backend/                     # NestJS API and all backend tooling
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ app.module.ts
│  │  ├─ common/
│  │  │  ├─ config/             # zod env schema
│  │  │  ├─ errors/             # filter, codes, AppError
│  │  │  ├─ logging/            # pino, requestId, redaction
│  │  │  ├─ health/
│  │  │  └─ prisma/
│  │  └─ modules/               # auth, users, ... (added incrementally)
│  ├─ test/
│  │  ├─ unit/
│  │  ├─ integration/
│  │  ├─ factories/
│  │  └─ setup/
│  └─ prisma/
│     ├─ schema.prisma
│     ├─ migrations/
│     └─ seed.ts
├─ frontend/                    # React + Vite app
│  ├─ src/
│  │  ├─ app/                   # router/layout/providers
│  │  ├─ components/ui/
│  │  ├─ features/
│  │  └─ lib/api
│  └─ e2e/
├─ packages/shared/src/         # zod schemas, types, constants
├─ scripts/                     # check-infra, backup
├─ infra/
│  └─ docker-compose.yml
├─ .github/workflows/ci.yml
├─ docs/
└─ specs/
```

**Structure decision**: pnpm monorepo, no Turborepo/Nx at M0 (avoid abstraction); root scripts call
`pnpm --filter`. The worker uses the same codebase, with its own entrypoint when split.

## Phase 0 — Research & decisions

1. **Workspace**: pnpm workspaces; root `package.json` scripts; `packages/shared` for zod/types.
2. **Config**: zod parses `process.env`; fail-fast; distinguish dev/test/prod; no default secret.
3. **Logging**: pino + `AsyncLocalStorage` for requestId; redact `authorization`, `password`, `token`,
   `secret`, `cookie`.
4. **Errors**: `AppError(code,status,message,details)`, global filter maps Prisma → code.
5. **Prisma**: SQL migration for extensions/partial index; `prisma migrate diff` in CI.
6. **Health**: `/health/live` has no dependency; `/health/ready` pings DB (`SELECT 1`) + Redis (`PING`).
7. **Docker**: healthcheck; volume; Mailpit; do not expose the DB outside production.
8. **CI**: service containers; pnpm cache; run migrations before integration; coverage.

## Phase 1 — Design

### 1.1 Env schema (abridged)

```text
NODE_ENV, PORT, WEB_ORIGIN, DATABASE_URL, REDIS_URL,
JWT_ACCESS_SECRET (>=32), JWT_ACCESS_TTL=15m, JWT_REFRESH_TTL=7d, JWT_REFRESH_PEPPER,
WEBHOOK_SECRET_ENC_KEY (32 bytes base64/hex),
MAIL_HOST/PORT/FROM, SENTRY_DSN?, AI_PROVIDER=mock,
ALLOW_SEED=false, SEED_PERF=false, ...
```

Missing/invalid → exit code 1 with a clear message; the value itself is never logged.

### 1.2 Error shape

```json
{ "code": "VALIDATION_ERROR", "message": "...", "details": {}, "requestId": "..." }
```

### 1.3 First Prisma migration

- Extensions: `pg_trgm`, `unaccent`, `pgcrypto`.
- Tables: organizations (currency/timezone), users, refresh_tokens, audit_logs (foundation for 002/003).
- Index/unique as in `docs/data-model.md`.
- Seed: 2 orgs + Admin/Manager/Sales user, idempotent; pipeline/stage added in 003.

### 1.4 Test harness

- `test/setup/env.ts`: set the test env.
- `test/setup/db.ts`: migrate/truncate; one DB/schema per worker.
- Factory: org/user; login helper.
- Integration runs serially or with a separate DB to avoid races.

## Phase 2 — Implementation order

1. Workspace + scaffold API/web/shared (T001–T004).
2. Docker Compose + env + Prisma (T005–T007).
3. Common error/log/health/Sentry/Swagger (T008–T011).
4. CI + test harness + web shell (T012–T015); queue base (T020).
5. Scripts/README/verification (T016–T019).

## Risks & Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Prisma does not support partial/trigram in the schema | High | Manual SQL migration; test migrating from empty |
| Windows path/CRLF/script | Medium | PowerShell scripts; `prettier.endOfLine = lf`; test on Windows |
| CI slow because of integration | Medium | pnpm cache; service healthcheck; parallel tests with separate DBs |
| Secret leaking into logs | High | Redaction test; never log the env object |
| Health ready flaky | Low | Short timeout/retry; distinguish live/ready |
| 70% coverage hard at M0 | Medium | Measure the service layer; boilerplate modules not counted |

## Verification

- Run `docs/quickstart.md` on a clean machine (or delete volumes).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- CI green on the PR.
- `/health/live` 200, `/health/ready` 200; stop Redis → ready 503.
- Sentry receives the test error (when a DSN exists); logs carry requestId.
- `prisma migrate diff` shows no drift.

## Complexity Tracking

No Constitution violations. No exception table needed.
