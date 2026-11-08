# Pulse CRM

**Mini CRM cho đội sales** — quản lý contact, pipeline & deal (kanban), hoạt động/task, dashboard báo cáo,
realtime notification, import CSV, webhook, email nhắc việc, lớp governance (audit/export/rate limit/cache) và
AI hỗ trợ.

> **Trạng thái**: đang ở giai đoạn **đặc tả (Spec-Driven Development)** — repo **chưa có mã ứng dụng**. Toàn bộ
> hành vi, schema, API, event và tiêu chí kiểm thử đã được chốt trong bộ SDD trước khi viết dòng code đầu tiên.

## 1. Tổng quan

| Hạng mục | Nội dung |
| --- | --- |
| Mục tiêu | CRM nhỏ, một deployable (modular monolith), phục vụ 3–20 sales/tổ chức |
| Mô hình dữ liệu | Multi-tenant **shared schema + `org_id`**, composite FK chặn tham chiếu chéo tenant |
| Vai trò | `ADMIN` (toàn quyền trong org) · `MANAGER` (toàn org dữ liệu + phân công/export/báo cáo) · `SALES` (chỉ dữ liệu sở hữu/được giao) |
| Quy mô MVP | 10.000 contacts · 5.000 deals · 20.000 activities · 2 org (dataset perf) |
| Nguyên tắc cốt lõi | Spec là nguồn sự thật · cách ly tenant · audit bất biến trong transaction · test-first theo AC · không secret trong Git |

## 2. Lộ trình

| Mốc | Nội dung | Feature |
| --- | --- | --- |
| **M0** | Hạ tầng: monorepo, Docker Compose, Prisma + migration, health, log/Sentry, CI, test harness | 001 Foundation |
| **M1** | Lõi CRM: xác thực & phân quyền, contact, pipeline/stage, deal + kanban kéo thả, activity/task, dashboard | 002 · 003 · 004 |
| **M2** | Vận hành: realtime & notification, import CSV, webhook, email nhắc việc, audit, export, rate limit, cache | 005 · 006 · 007 |
| **M3** | AI: tóm tắt deal (SSE), nháp email follow-up, chấm điểm lead, quota/cost | 008 (FR-20/RAG hoãn — ADR-009) |
| **M4** | Production hoá: deploy, backup/restore, retention, tài liệu vận hành | 001 · 007 |

Thứ tự triển khai khuyến nghị: `001 → 002 → 003 → 004 → 007 → 005 → 006 → 008` (007 cung cấp audit/cache/rate
limit dùng lại cho 005/006/008).

## 3. Công nghệ

| Lớp | Công nghệ |
| --- | --- |
| Ngôn ngữ | TypeScript 5 strict (`no-explicit-any`), Node.js 22 LTS, pnpm 9 workspace |
| Backend | NestJS · Prisma + PostgreSQL 16 · zod · pino · BullMQ · Socket.IO · SSE · Sentry |
| Frontend | React + Vite · React Router · TanStack Query · Tailwind + shadcn/ui · dnd-kit (kanban) · Recharts |
| Hạ tầng dev | Docker Compose: PostgreSQL 16, Redis 7, Mailpit (SMTP 1025 / UI 8025) |
| Kiểm thử | Jest + Supertest (API) · Vitest + Testing Library (web) · Playwright (E2E) · autocannon/k6 (perf) |
| CI | GitHub Actions: lint, typecheck, unit, integration (PG/Redis thật), build, coverage ≥ 70% service layer, secret scan (gitleaks) |

Kiến trúc **modular monolith** (ADR-001). Luồng bắt buộc `controller → service → repository → Prisma`; module theo
bounded context: `auth, users, contacts, pipeline, deals, activities, notifications, imports, webhooks, reports,
audit, ai`.

## 4. Cấu trúc thư mục (mục tiêu của M0)

Backend và frontend tách thành hai app riêng: `apps/api` (backend NestJS) và `apps/web` (frontend React + Vite);
type/zod dùng chung đặt ở `packages/shared`. Không trộn code server và client trong cùng một thư mục.

```text
apps/
  api/            # NestJS: src/common (config, errors, logging, health, prisma, queue, auth, audit, cache, rate-limit)
                  #         src/modules (theo bounded context)
    test/         # unit | integration | perf | factories | setup
  web/            # React: src/app, components/ui, features, lib/api + e2e (Playwright)
packages/shared/  # zod schema, type và constant dùng chung
prisma/           # schema.prisma, migrations/, seed.ts
scripts/          # check-infra.ps1, backup.ps1, restore.ps1 (PowerShell)
infra/            # docker-compose.yml
docs/             # contract, quy ước, ADR, checklist (xem §5)
specs/            # feature spec theo Spec Kit (spec.md · plan.md · tasks.md)
.specify/         # Spec Kit: constitution, template, workflow
AGENTS.md         # luật làm việc cho AI agent (đọc trước khi thao tác)
```

## 5. Bản đồ tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Luật cho AI agent: bắt buộc đọc trước, quy tắc ràng buộc, cách xử lý conflict |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Hiến pháp dự án: 9 nguyên tắc, ràng buộc C1–C9, 6 quality gate |
| [`specs/README.md`](specs/README.md) | Mục lục SDD: feature map, quy ước ID, quy trình, quyết định cần duyệt |
| [`docs/spec-review.md`](docs/spec-review.md) | Phản biện spec, SCR và quyết định |
| [`docs/traceability.md`](docs/traceability.md) | FR/NFR → AC → feature → task → test |
| [`docs/nfr.md`](docs/nfr.md) | Tiêu chí chấp nhận cho NFR-01…NFR-07 |
| [`docs/data-model.md`](docs/data-model.md) | ERD, bảng, ràng buộc, index, migration, retention |
| [`docs/api-conventions.md`](docs/api-conventions.md) · [`docs/error-codes.md`](docs/error-codes.md) | Quy ước REST, phân trang, lỗi · catalog mã lỗi |
| [`docs/permissions-matrix.md`](docs/permissions-matrix.md) | RBAC theo từng endpoint |
| [`docs/events.md`](docs/events.md) | Contract Socket.IO + BullMQ (queue, retry, DLQ) |
| [`docs/testing-strategy.md`](docs/testing-strategy.md) | Chiến lược unit/integration/E2E/perf/AI eval |
| [`docs/quickstart.md`](docs/quickstart.md) | Chạy dự án từ clone (M0) |
| [`docs/adr/`](docs/adr/README.md) | 15 Architecture Decision Record (ADR-001…ADR-015) |
| [`docs/checklists/`](docs/checklists/feature-dod.md) | Definition of Done, security review, PR review |
| [`docs/api/openapi.yaml`](docs/api/openapi.yaml) | Contract OpenAPI 3.1 |
| [`Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md`](<Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md>) | Đặc tả sản phẩm gốc v0.1 (nguồn sự thật) |

## 6. Bắt đầu nhanh (luồng chuẩn của M0)

> Các lệnh dưới đây là luồng chuẩn trong [`docs/quickstart.md`](docs/quickstart.md). Repo hiện chỉ có tài liệu
> nên chưa chạy được; phần này là đích đến của M0.

```bash
git clone <repo-url> sales-crm && cd sales-crm
pnpm install
cp .env.example .env                 # điền secret (xem §7)
docker compose up -d postgres redis mailpit
pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Thành phần | Địa chỉ |
| --- | --- |
| API (prefix `/api/v1`) | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs (chỉ dev) |
| Web | http://localhost:5173 |
| Health | `/health/live`, `/health/ready` — không cần auth; `ready` kiểm tra DB + Redis |
| Mailpit | UI http://localhost:8025 · SMTP 1025 |
| PostgreSQL · Redis | `localhost:5432` · `localhost:6379` |

Lệnh thường dùng:

```bash
pnpm lint   ·   pnpm typecheck   ·   pnpm test              # test = unit + integration
pnpm test:unit   ·   pnpm test:integration   ·   pnpm test:e2e
pnpm test:perf        # NFR-01 (chạy tay)
pnpm eval:score       # eval chấm điểm lead (chạy tay, mock provider)
pnpm infra:check      # kiểm tra kết nối DB/Redis
pnpm db:migrate   ·   pnpm db:seed   ·   pnpm db:reset      # db:reset chỉ dùng ở local
```

## 7. Biến môi trường

Xem `.env.example`; app **fail-fast** nếu thiếu/sai và không log giá trị.

- Bắt buộc: `NODE_ENV`, `PORT`, `WEB_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` (≥ 32 byte),
  `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=7d`, `JWT_REFRESH_PEPPER`, `WEBHOOK_SECRET_ENC_KEY`, `MAIL_HOST`,
  `MAIL_PORT`, `MAIL_FROM`, `SENTRY_DSN` (để trống ở dev).
- Cờ seed (mặc định `false`): `ALLOW_SEED=true` mới cho phép seed ngoài dev/test; `SEED_PERF=true` mới nạp
  dataset perf 10.000/5.000/20.000.
- AI: `AI_PROVIDER=mock`, `AI_MODEL`, `AI_ORG_DAILY_TOKEN_LIMIT=200000`, `AI_USER_DAILY_TOKEN_LIMIT=50000`.

## 8. Quy tắc bắt buộc (tóm tắt C1–C9)

1. **Spec là nguồn sự thật** — mọi thay đổi hành vi bắt đầu từ `FR-xx`/`NFR-xx` kèm tiêu chí `AC-FRxx-yy`.
2. **Cách ly tenant** — mọi bảng nghiệp vụ có `org_id`; query lấy org từ JWT, không từ client; truy cập chéo
   tenant trả `404`.
3. **Audit trong cùng transaction** — append-only, đã redact PII/secret, rollback cùng nghiệp vụ.
4. **Test-first theo AC** — mỗi endpoint có happy + validation + role thấp hơn + tenant khác; coverage service
   layer ≥ 70%.
5. **Phân lớp** — controller không gọi Prisma; repository là nơi duy nhất biết Prisma.
6. **Validate & lỗi thống nhất** — zod ở mọi input; lỗi `{ code, message, details?, requestId }`.
7. **Không secret trong Git** — chỉ `.env.example`; mọi secret đến từ biến môi trường.
8. **Async mặc định** — import/webhook/email/reminder/LLM chạy qua BullMQ hoặc SSE, không chặn request.
9. **Thay đổi nhỏ, truy vết được** — PR nhỏ kèm ID FR/AC và cập nhật `docs/traceability.md`.

Quy ước API nhanh: phân trang cursor `{ data, nextCursor, hasMore }` (`limit` ≤ 100, mặc định 50) · rate limit
300 req/phút/user (burst 60), login 5 lần sai/15 phút theo email+IP, register 3 lần/giờ/IP, webhook
60 req/phút/source · import ≤ 5.000 dòng và ≤ 10MB, idempotent theo `(org_id, file_hash)` trong 24h · webhook ký
HMAC-SHA256 trên `{timestamp}.{rawBody}`, lệch tối đa 300s, bắt buộc `Idempotency-Key`, body ≤ 256KB.

Quy ước ID: `FR-xx`/`NFR-xx` → `AC-FRxx-yy` → `US-x` → `T###` (dải theo feature: 001 = T001–T099 … 008 =
T700–T799) → `ADR-###` → `SCR-###`.

## 9. Quy trình làm việc

`Spec → Plan → Tasks → Implement → Verify` (Spec Kit đã cài trong `.specify/`):

1. **Specify** — tạo `specs/###-feature/spec.md`, gán AC ID.
2. **Clarify** — chạy spec review, chốt điểm mơ hồ bằng ADR/SCR.
3. **Plan** — viết `plan.md` + Constitution Check, chốt data/API/event/test.
4. **Tasks** — viết `tasks.md` theo user story, test-first.
5. **Implement** — code theo task, commit nhỏ.
6. **Verify** — chạy test/CI, đối chiếu từng AC, cập nhật traceability, demo.

Branch `###-feature-name` · commit `feat(FR-05): move deal with optimistic lock` · mỗi PR là một feature slice
hoặc nhóm task liên quan, có mô tả FR/AC.

**Với AI agent**: đọc `AGENTS.md` → `.specify/memory/constitution.md` → `spec.md`/`plan.md`/`tasks.md` →
`docs/*` liên quan **trước khi** sửa bất cứ thứ gì.

## 10. Quyết định cần duyệt trước M1

Các ADR còn **Proposed** (chi tiết ở `specs/README.md` §6 và [`docs/adr/README.md`](docs/adr/README.md)):
ADR-006 (Prisma) · ADR-007 (Socket.IO + SSE) · ADR-008 (Mailpit/email adapter) · ADR-009 (hoãn FR-20/RAG) ·
ADR-011 (mã hoá webhook secret) · ADR-012 (room realtime theo RBAC) · ADR-013 (trigram search) ·
ADR-014 (fractional position) · ADR-015 (refresh token trong HttpOnly cookie).

Ngoài ra, các SCR đang “Pending spec” (SCR-003, SCR-007, SCR-008, SCR-015) cần được merge vào đặc tả gốc v0.2.

## 11. Ngoài phạm vi MVP

Thanh toán, marketing automation, mobile app, ERP/kế toán, microservices, Zalo/Messenger · quên/đổi mật khẩu,
verify email, SSO, 2FA · đa tiền tệ/FX · RAG/FR-20 (ADR-009) · gửi email tới khách hàng ngoài tổ chức · data
retention tự động, GDPR delete, restore soft-delete · multi-region/HA.

## 12. Ghi chú

- Tài liệu SDD (`docs/`, `specs/`, `AGENTS.md`, constitution) viết bằng **tiếng Anh**; README này là tài liệu
  giới thiệu cho người đọc nên giữ **tiếng Việt**.
- Nội dung hướng tới người dùng cuối (UI, thông báo lỗi, email template) mặc định tiếng Việt, chọn theo
  `Accept-Language`.
- Giấy phép: chưa quy định — sẽ bổ sung trước khi công khai.
