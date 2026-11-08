# Tasks: Foundation (M0)

**Input**: `specs/001-foundation/`
**Prerequisites**: plan.md, spec.md
**Tests**: Mandatory per C8. Write tests first for health/error/config; scaffold-only tasks need no separate tests.

## Phase 1 — Setup

- [ ] **T001** Initialise the pnpm workspace: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.editorconfig`,
      `.gitignore`, `.gitattributes`; root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:unit`,
      `test:integration`, `test:e2e`, `test:perf`, `eval:score`, `infra:check`, `db:*`. These are exactly the
      aliases used by `docs/quickstart.md`, `docs/testing-strategy.md` and CI (T014).
- [ ] **T002** [P] Scaffold `apps/api` NestJS strict TS, ESLint/Prettier/Jest, `src/main.ts`, `app.module.ts`.
- [ ] **T003** [P] Scaffold `apps/web` React+Vite+TS, Tailwind, shadcn/ui, TanStack Query, React Router, Vitest.
- [ ] **T004** [P] Scaffold `packages/shared`: tsconfig, zod, types, constants; exported via the package name.
- [ ] **T005** Docker Compose `infra/docker-compose.yml`: postgres:16, redis:7, mailpit; healthcheck; volume.
- [ ] **T006** `.env.example` + `apps/api/src/common/config/env.schema.ts` zod; fail-fast; env parse test.

## Phase 2 — Foundational

- [ ] **T007** Prisma init `prisma/schema.prisma`; migration `0001_init` (organizations with `currency/timezone`,
      users, refresh_tokens, **audit_logs**, extensions pg_trgm/unaccent/pgcrypto); `prisma/seed.ts` idempotent:
      2 orgs + Admin/Manager/Sales users (the pipeline is deferred to 003); running it twice creates no duplicates.
- [ ] **T008** [P] `common/errors`: `AppError`, error codes, global exception filter, Prisma mapping; test the
      `{code,message,details,requestId}` shape.
- [ ] **T009** [P] `common/logging`: pino + AsyncLocalStorage requestId, redaction; test log fields.
- [ ] **T010** [P] `common/health`: `/health/live`, `/health/ready` (DB/Redis), graceful shutdown; test ready 503
      when Redis/DB fails.
- [ ] **T011** [P] Sentry init (API/web) from env; 5xx filter; test that no stack leaks.
- [ ] **T012** [P] Swagger `/api/docs`; set the global prefix `/api/v1`; validation pipe.
- [ ] **T013** Test harness: `apps/api/test/setup/{env,db}.ts`, org/user factories, login helper; coverage config.
- [ ] **T014** CI `.github/workflows/ci.yml`: install/lint/typecheck/unit/integration/build/coverage; postgres and
      redis services; pnpm cache; **secret scan (gitleaks) fails on `.env`/secret**.
- [ ] **T015** [P] Web shell: providers, router, layout, API client, error boundary, login placeholder.
- [ ] **T016** Scripts `scripts/check-infra.ps1`, `scripts/backup.ps1`, `scripts/restore.ps1`; manual test.
- [ ] **T017** [P] `README.md` + `docs/quickstart.md`; SDD links; troubleshooting for common failures.
- [ ] **T018** Verify a fresh clone: delete volumes, run the quickstart, health, lint/typecheck/test/build.
- [ ] **T019** [P] Update `docs/traceability.md`; confirm the constitution/ADR index; PR checklist.
- [ ] **T020** `common/queue`: BullMQ module + Redis connection, queue factory, worker bootstrap, default
      retry/DLQ, graceful shutdown; config test. Features 004/006/008 declare their own queues on top of this base.

## Dependencies

- T002–T004 after T001.
- T005–T006 after T001; T007 after T005/T006.
- T008–T012 after T002; T013 after T007; T014 after T002/T013; T015 after T003.
- T020 after T002/T006; 004/006/008 use T020.
- T016–T019 after the phases above are done.

## MVP checkpoint

After T014: API + web + DB/Redis run, CI green. After T018: the M0 DoD is met (T020 may run in parallel after T014).

## Notes

- Do not add CRM features at M0.
- The first migration contains foundation tables only; business tables arrive in 003/004.
- If Prisma cannot express a partial index, write SQL in the migration and test from an empty DB.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-M0-01..03 | T001–T007, T015, T018 |
| AC-M0-04..06 | T013, T014, T019 |
| AC-M0-07..09 | T006, T009–T011 |
| AC-M0-11..13 | T007, T016 |
| AC-NFR03-01..03 | T010, T020 |
| AC-NFR04-01..02 | T009, T011 |
| AC-NFR05-01..02 | T007, T016 |
| AC-NFR06-01..02 | T005, T015, T017, T018 |
| AC-NFR07-01..03 | T013, T014, T019 |
