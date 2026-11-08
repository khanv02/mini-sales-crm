# Implementation Plan: Foundation (M0)

**Branch**: `001-foundation` | **Date**: 2026-11-08 | **Spec**: `specs/001-foundation/spec.md`

## Summary

Dựng monorepo pnpm với NestJS API, React/Vite web, PostgreSQL/Redis/Mailpit qua Docker Compose, Prisma
migration đầu, health check, log/Sentry, CI và test harness. Mục tiêu là một fresh clone chạy được đúng
quickstart trước khi viết tính năng CRM.

## Technical Context

- **Language**: TypeScript 5.x strict; Node.js 22 LTS; pnpm 9.
- **Backend**: NestJS (current stable), Prisma, zod, pino, Sentry, BullMQ (cài sẵn, dùng từ 004/006).
- **Frontend**: React + Vite, TypeScript, TanStack Query, React Router, Tailwind + shadcn/ui, dnd-kit (cài
  sẵn cho 003), Vitest + Testing Library.
- **Storage**: PostgreSQL 16, Redis 7.
- **Testing**: Jest + Supertest (API), Vitest (web), Playwright (E2E).
- **Ops**: Docker Compose, GitHub Actions, pino, Sentry.
- **Scale**: 10k contacts/5k deals/2 org; một API instance; worker chung process MVP.
- **Performance**: `/health/ready` < 500ms; CI < 10 phút.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | `tsconfig` strict, ESLint no-explicit-any, typecheck CI | Pass |
| C2 phân lớp | Scaffold module/controller/service/repository, không DB ở controller | Pass |
| C3 org_id | Schema nền có org; policy/repository pattern từ 002 | Pass |
| C4 audit | `audit_logs` schema trong `0001_init`; AuditService triển khai ở 002 | Pass |
| C5 validate/error | zod env + global exception filter + error shape | Pass |
| C6 secret | `.env.example`, `.gitignore`, env schema fail-fast, secret scan | Pass |
| C7 async | BullMQ module scaffold (T020); queue riêng khai báo ở 004/006/008 | Pass |
| C8 test | Test harness + health tests; CI chạy unit/integration | Pass |
| C9 PR nhỏ | Task chia nhỏ, commit theo T00x (T001–T020); PR template | Pass |

Không có ngoại lệ.

## Project Structure

```text
.
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/
│  │  │  │  ├─ config/          # zod env schema
│  │  │  │  ├─ errors/          # filter, codes, AppError
│  │  │  │  ├─ logging/         # pino, requestId, redaction
│  │  │  │  ├─ health/
│  │  │  │  └─ prisma/
│  │  │  └─ modules/            # auth, users, ... (thêm dần)
│  │  └─ test/
│  │     ├─ unit/
│  │     ├─ integration/
│  │     ├─ factories/
│  │     └─ setup/
│  └─ web/
│     ├─ src/
│     │  ├─ app/                # router/layout/providers
│     │  ├─ components/ui/
│     │  ├─ features/
│     │  └─ lib/api
│     └─ e2e/
├─ packages/shared/src/         # zod schemas, types, constants
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ scripts/                     # check-infra, backup
├─ infra/
│  └─ docker-compose.yml
├─ .github/workflows/ci.yml
├─ docs/
└─ specs/
```

**Structure decision**: monorepo pnpm, không Turborepo/Nx ở M0 (tránh abstraction); root scripts gọi
`pnpm --filter`. Worker dùng cùng codebase, entrypoint riêng khi tách.

## Phase 0 — Research & decisions

1. **Workspace**: pnpm workspaces; root `package.json` scripts; `packages/shared` cho zod/types.
2. **Config**: zod parse `process.env`; fail-fast; phân biệt dev/test/prod; không default secret.
3. **Logging**: pino + `AsyncLocalStorage` cho requestId; redact `authorization`, `password`, `token`,
   `secret`, `cookie`.
4. **Errors**: `AppError(code,status,message,details)`, global filter map Prisma → code.
5. **Prisma**: migration SQL cho extension/partial index; `prisma migrate diff` trong CI.
6. **Health**: `/health/live` không dependency; `/health/ready` ping DB (`SELECT 1`) + Redis (`PING`).
7. **Docker**: healthcheck; volume; Mailpit; không expose DB ra ngoài production.
8. **CI**: service containers; cache pnpm; chạy migration trước integration; coverage.

## Phase 1 — Design

### 1.1 Env schema (rút gọn)

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

### 1.3 Prisma migration đầu

- Extensions: `pg_trgm`, `unaccent`, `pgcrypto`.
- Bảng: organizations (currency/timezone), users, refresh_tokens, audit_logs (nền cho 002/003).
- Index/unique như `docs/data-model.md`.
- Seed: 2 org + Admin/Manager/Sales user, idempotent; pipeline/stage thêm ở 003.

### 1.4 Test harness

- `test/setup/env.ts`: set env test.
- `test/setup/db.ts`: migrate/truncate; một DB/schema mỗi worker.
- Factory: org/user; login helper.
- Integration chạy tuần tự hoặc DB riêng để tránh race.

## Phase 2 — Implementation order

1. Workspace + scaffold API/web/shared (T001–T004).
2. Docker Compose + env + Prisma (T005–T007).
3. Common error/log/health/Sentry/Swagger (T008–T011).
4. CI + test harness + web shell (T012–T015); queue base (T020).
5. Scripts/README/verification (T016–T019).

## Risks & Mitigations

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Prisma không hỗ trợ partial/trigram trong schema | Cao | Migration SQL thủ công; test migrate từ trống |
| Windows path/CRLF/script | Trung bình | Script PowerShell; `.gitattributes`; test trên Windows |
| CI chậm do integration | Trung bình | Cache pnpm; service healthcheck; test song song có DB riêng |
| Secret lọt log | Cao | Redaction test; không log env object |
| Health ready flaky | Thấp | Timeout/retry ngắn; phân biệt live/ready |
| Coverage 70% khó ở M0 | Trung bình | Đo service layer; chưa tính module boilerplate |

## Verification

- Chạy `docs/quickstart.md` trên máy sạch (hoặc xóa volume).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- CI xanh trên PR.
- `/health/live` 200, `/health/ready` 200; dừng Redis → ready 503.
- Sentry nhận lỗi test (nếu có DSN); log có requestId.
- `prisma migrate diff` không drift.

## Complexity Tracking

Không có vi phạm Constitution. Không cần bảng ngoại lệ.
