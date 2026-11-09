# Tasks: Foundation (M0)

**Input**: `specs/001-foundation/`
**Prerequisites**: plan.md, spec.md
**Tests**: Mandatory per C8. Write tests first for health/error/config; scaffold-only tasks need no separate tests.

## Phase 1 â€” Setup

- [x] **T001** Initialise the pnpm workspace: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.editorconfig`,
      `.gitignore`, `.gitattributes`; root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:unit`,
      `test:integration`, `test:e2e`, `test:perf`, `eval:score`, `infra:check`, `db:*`. These are exactly the
      aliases used by `docs/quickstart.md`, `docs/testing-strategy.md` and CI (T014).
- [x] **T002** [P] Scaffold `backend` NestJS strict TS, ESLint/Prettier/Jest, `src/main.ts`, `app.module.ts`.
- [x] **T003** [P] Scaffold `frontend` React+Vite+TS, Tailwind, shadcn/ui, TanStack Query, React Router, Vitest.
- [x] **T004** [P] Scaffold `packages/shared`: tsconfig, zod, types, constants; exported via the package name.
- [x] **T005** Docker Compose `backend/infra/docker-compose.yml`: postgres:16, redis:7, mailpit; healthcheck; volume.
- [x] **T006** `.env.example` + `backend/src/common/config/env.ts` zod; fail-fast; env parse test.

## Phase 2 â€” Foundational

- [x] **T007** Prisma init `backend/prisma/schema.prisma`; migration `0001_init` (organizations with `currency/timezone`,
      users, refresh_tokens, **audit_logs**, extensions pg_trgm/unaccent/pgcrypto); `backend/prisma/seed.ts` idempotent:
      2 orgs + Admin/Manager/Sales users (the pipeline is deferred to 003); running it twice creates no duplicates.
- [x] **T008** [P] `common/errors`: `AppError`, error codes, global exception filter, Prisma mapping; test the
      `{code,message,details,requestId}` shape.
- [x] **T009** [P] `common/logging`: pino + AsyncLocalStorage requestId, redaction; test log fields.
- [x] **T010** [P] `common/health`: `/health/live`, `/health/ready` (DB/Redis), graceful shutdown; test ready 503
      when Redis/DB fails.
- [x] **T011** [P] Sentry init (API/web) from env; 5xx filter; test that no stack leaks.
- [x] **T012** [P] Swagger `/api/docs`; set the global prefix `/api/v1`; validation pipe.
- [x] **T013** Test harness: `backend/test/setup/{env,db}.ts`, org/user factories, login helper; coverage config.
- [x] **T014** CI `.github/workflows/ci.yml`: install/lint/typecheck/unit/integration/build/coverage; postgres and
      redis services; pnpm cache; **secret scan (gitleaks) fails on `.env`/secret**.
- [x] **T015** [P] Web shell: providers, router, layout, API client, error boundary, login placeholder.
- [x] **T016** Scripts `backend/scripts/check-infra.ps1`, `backend/scripts/backup.ps1`, `backend/scripts/restore.ps1`; manual test.
- [x] **T017** [P] `README.md` (client-facing product copy only, no SDD links or internals) + `docs/quickstart.md`
      (technical setup with SDD links); troubleshooting for common failures.
- [x] **T018** Verify a fresh clone: delete volumes, run the quickstart, health, lint/typecheck/test/build.
- [x] **T019** [P] Update `docs/traceability.md`; confirm the constitution/ADR index; PR checklist.
- [x] **T020** `common/queue`: BullMQ module + Redis connection, queue factory, worker bootstrap, default
      retry/DLQ, graceful shutdown; config test. Features 004/006/008 declare their own queues on top of this base.

## Dependencies

- T002â€“T004 after T001.
- T005â€“T006 after T001; T007 after T005/T006.
- T008â€“T012 after T002; T013 after T007; T014 after T002/T013; T015 after T003.
- T020 after T002/T006; 004/006/008 use T020.
- T016â€“T019 after the phases above are done.

## MVP checkpoint

After T014: API + web + DB/Redis run, CI green. After T018: the M0 DoD is met (T020 may run in parallel after T014).

## Notes

- Do not add CRM features at M0.
- The first migration contains foundation tables only; business tables arrive in 003/004.
- If Prisma cannot express a partial index, write SQL in the migration and test from an empty DB.

## Traceability (task â†’ AC)

| AC | Task |
| --- | --- |
| AC-M0-01..03 | T001â€“T007, T015, T018 |
| AC-M0-04..06 | T013, T014, T019 |
| AC-M0-07..09 | T006, T009â€“T011 |
| AC-M0-11..13 | T007, T016 |
| AC-NFR03-01..03 | T010, T020 |
| AC-NFR04-01..02 | T009, T011 |
| AC-NFR05-01..02 | T007, T016 |
| AC-NFR06-01..02 | T005, T015, T017, T018 |
| AC-NFR07-01..03 | T013, T014, T019 |
