# Quickstart â€” Pulse CRM (M0)

Goal: from clone to a running app in **a few commands**, satisfying NFR-06 and the M0 DoD.

## 1. Requirements

| Tool | Version |
| --- | --- |
| Node.js | 22 LTS |
| pnpm | 9+ |
| Docker Desktop | 4+ (Compose v2) |
| Git | 2.40+ |

Windows: use PowerShell 5.1+ with the WSL2 backend for Docker. Linux/macOS: equivalent.

Code is split by responsibility: `backend/` holds the NestJS API, Prisma schema/migrations/seed and backend tests;
`frontend/` holds the React + Vite app and Playwright tests; shared types and zod schemas live in
`packages/shared`.

## 2. Install

```bash
git clone <repo-url> sales-crm
cd sales-crm
pnpm install
cp .env.example .env
```

Generate local secrets (never commit them):

```bash
# Linux/macOS
openssl rand -base64 32   # JWT_ACCESS_SECRET
openssl rand -base64 32   # JWT_REFRESH_PEPPER
openssl rand -hex 32      # WEBHOOK_SECRET_ENC_KEY (32 bytes)
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 3. Start the infrastructure

```bash
docker compose up -d postgres redis mailpit
docker compose ps
```

- PostgreSQL: `localhost:${POSTGRES_PORT:-5432}` (db `pulse`, user `pulse`, password from `.env`)
- Redis: `localhost:6379`
- Mailpit UI: http://localhost:8025 (SMTP 1025)
- API: http://localhost:3000
- Web: http://localhost:5173

If port 5432 is already used by a local PostgreSQL, set `POSTGRES_PORT=5433` in `.env` and use the same port in
`DATABASE_URL`, for example `postgresql://pulse:pulse@localhost:5433/pulse?schema=public`. Then start the stack
with `docker compose up -d postgres`.

Check connectivity:

```bash
pnpm infra:check
# or
docker compose exec postgres pg_isready -U pulse
docker compose exec redis redis-cli ping
```

## 4. Database

```bash
pnpm db:migrate      # prisma migrate deploy/dev
pnpm db:seed         # sample data + perf dataset (never in production)
```

What the idempotent seed creates (dev/test only):

- Orgs `Acme` / `Globex`; user `admin@acme.test` / `Password123!` plus Manager/Sales for each org.
- From feature 003 onwards: pipeline â€œSales Pipelineâ€ with New/Qualified/Proposal/Won/Lost.
- 10,000 contacts + 5,000 deals for org `Acme`, only when `SEED_PERF=true` (feature 003+).

Seed guards (both default to `false`, see `docs/data-model.md` section 6):

- `ALLOW_SEED=true` is required to run the seed outside dev/test; with `NODE_ENV=production` the seed exits
  unless it is explicitly set.
- `SEED_PERF=true` additionally loads the 10,000/5,000/20,000 perf dataset.

### Backup and restore

```powershell
# Windows PowerShell (Docker Compose v2)
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/backup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/restore.ps1 -BackupFile backups\pulse-<timestamp>.dump
```

```bash
# Linux/macOS
pwsh backend/scripts/backup.ps1
pwsh backend/scripts/restore.ps1 -BackupFile backups/pulse-<timestamp>.dump
```

The backup is a PostgreSQL custom-format dump written to `backups/`; the restore target defaults to the separate
`pulse_restore` database so verification never overwrites local data. Both scripts run `pg_dump`/`pg_restore`
inside the Compose container and copy the dump in/out with `docker compose cp`, so they are binary-safe on
Windows PowerShell 5.1 and PowerShell 7+.

## 5. Run the dev servers

```bash
pnpm dev
# API: http://localhost:3000/api/v1
# Swagger: http://localhost:3000/api/docs
# Web: http://localhost:5173
# Health: http://localhost:3000/health/ready
```

Run them separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

## 6. Test

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration     # needs postgres + redis
pnpm test:e2e             # needs api + web + seed
pnpm test                 # unit + integration
```

Perf (manual):

```bash
pnpm test:perf
```

AI eval (manual, mock or real key):

```bash
pnpm eval:score
```

## 7. Minimum environment variables

See `.env.example`. Required variables:

```dotenv
NODE_ENV=development
PORT=3000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://pulse:pulse@localhost:5432/pulse?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
JWT_REFRESH_PEPPER=...
WEBHOOK_SECRET_ENC_KEY=...
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM="Pulse CRM <no-reply@pulse.test>"
SENTRY_DSN=
AI_PROVIDER=mock
AI_MODEL=
AI_ORG_DAILY_TOKEN_LIMIT=200000
AI_USER_DAILY_TOKEN_LIMIT=50000
ALLOW_SEED=false
SEED_PERF=false
```

Never commit `.env`; CI uses GitHub secrets.

## 8. Common failures

| Symptom | Fix |
| --- | --- |
| `ECONNREFUSED 5432` | `docker compose up -d postgres`; check for a port clash and set `POSTGRES_PORT` |
| Prisma `P1001` | Wrong `DATABASE_URL`, or the DB is not ready |
| Prisma schema not found | Run DB commands from the repo root; the schema lives in `backend/prisma/schema.prisma` |
| Redis `ECONNREFUSED` | `docker compose up -d redis` |
| Migration drift | `pnpm db:reset` (local only) |
| Web gets 401 from the API | Access token expired; check the refresh cookie/CORS |
| Ports 3000/5173 busy | Change `PORT`/`VITE_PORT` and update `WEB_ORIGIN` |
| Seed unique-constraint error | Run `pnpm db:reset`, or rely on the idempotent seed |

## 9. M0 DoD

- [ ] Fresh clone + `pnpm install` + `docker compose up` + `pnpm db:migrate` + `pnpm db:seed` + `pnpm dev` runs
      exactly as the README says.
- [ ] `/health/live` and `/health/ready` return 200.
- [ ] The web shell renders an empty state without errors; real login is verified at M1 (feature 002).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` are green.
- [ ] CI runs on PRs.
- [ ] `.env.example` is complete; no secrets in Git.
- [ ] `docs/quickstart.md` has been verified by someone else (fresh clone).
