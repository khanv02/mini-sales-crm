# Implementation Plan: Activities, Tasks & Dashboard

**Branch**: `004-activities-dashboard` | **Date**: 2026-11-08 | **Spec**: `specs/004-activities-dashboard/spec.md`

## Summary

Add the activity timeline (note/call/email/task), the task projection + overdue scheduler, and the dashboard
aggregate per the SCR-011 formulas. The 60s cache is designed as a hook but fully implemented in 007.

## Technical Context

- **Backend**: modules `activities`, `tasks` (projection), `reports`; BullMQ repeatable job.
- **Frontend**: deal timeline, tasks page, dashboard charts (shadcn/ui chart, using Recharts underneath).
- **Storage**: activities, notifications; deals.closed_at/currency.
- **Testing**: Jest/Supertest; fake timers for the scheduler; perf 5k deals.
- **Performance**: summary p95 < 300ms; scheduler < 1 minute.

## Constitution Check

| Gate | How it is met | Status |
| --- | --- | --- |
| C1 strict | zod activity/report DTOs | Pass |
| C2 layering | ReportRepository raw SQL; thin controller | Pass |
| C3 org_id | every query scoped to the org; composite FK on activity | Pass |
| C4 audit | activity create/update/done audit | Pass |
| C5 validate/error | task due/assignee, date range | Pass |
| C6 secret | no secret | Pass |
| C7 async | scheduler BullMQ repeatable; email in 006 | Pass |
| C8 test | happy/error/role/tenant + scheduler dedupe | Pass |
| C9 small PRs | T300–T319 by group | Pass |

## Data Model (delta)

- `activities`: type, content, due_at, done_at, assignee_id, created_by; task check.
- `notifications`: type, payload, dedupe_key, read_at.
- `deals.closed_at`, `organizations.currency/timezone`.
- Details in `docs/data-model.md` 4.8–4.9.

## API

| Method | Path | Note |
| --- | --- | --- |
| GET/POST | `/deals/:id/activities` | timeline/create |
| PATCH | `/activities/:id` | content/due/assignee |
| GET | `/tasks?status=overdue` | projection |
| PATCH | `/tasks/:id` | done/due/assignee |
| GET | `/reports/summary` | filters |

## Task projection

```text
Task = activity where type='TASK'
open    = done_at is null
overdue = done_at is null and due_at < now()
done    = done_at is not null
```

- List defaults to assignee = current; Manager/Admin may pass `assigneeId`.
- `PATCH done`: set `done_at=now()`; idempotent if already done (return 200, no second audit) or 409 — choose 200
  idempotent to keep the UI simple; audit only the first time.
- Reopen task: `done_at=null` (if allowed); audit.

## Scheduler

- BullMQ repeatable `scan-task-reminders` every minute (fixed jobId).
- Query open tasks with due <= now + 24h, join active user, org.
- Notification:
  - `TASK_DUE` if `0 < due_at - now <= 24h`, dedupe `task:{id}:due_soon`.
  - `TASK_OVERDUE` if `due_at < now`, dedupe `task:{id}:overdue`.
- Upsert the notification `on conflict` unique; if a new row is inserted → emit event (005) + enqueue email (006).
- Running 2 instances: unique/dedupe protects it; BullMQ job lock.

## Dashboard SQL

```sql
-- newLeads
select count(*) from contacts
where org_id = $1 and deleted_at is null and created_at >= $2 and created_at < $3
  and ($4::uuid is null or owner_id = $4);

-- dealsByStage / pipelineValue
select stage_id, count(*), sum(value)
from deals
where org_id = $1 and status = 'OPEN' and created_at >= $2 and created_at < $3
  and ($4::uuid is null or owner_id = $4)
  and ($5::uuid is null or pipeline_id = $5)
group by stage_id;

-- winRate
select
  count(*) filter (where status='WON') as won,
  count(*) filter (where status='LOST') as lost
from deals
where org_id = $1 and closed_at >= $2 and closed_at < $3
  and ($4::uuid is null or owner_id = $4);

-- forecastByMonth
select date_trunc('month', expected_close) as month, sum(value)
from deals
where org_id = $1 and status='OPEN'
  and expected_close >= $2 and expected_close < $3
  and ($4::uuid is null or owner_id = $4)
group by 1 order by 1;
```

- Timezone: convert the `from/to` dates to timestamptz in the org timezone in the service; SQL uses UTC.
- Sales: `ownerId = currentUser`, other query params are ignored.
- Cache key (007): `report:{orgId}:{role}:{userId|all}:{hash(filters)}:{dataVersion}`.

## Frontend

- Deal detail: timeline tabs (All/Notes/Calls/Tasks), add note/call, task form (assignee, due).
- Tasks page: tabs Open/Overdue/Done; overdue badge; mark done optimistically.
- Dashboard: cards (new leads, pipeline value, win rate), bar chart deals by stage, line/bar forecast by month,
  filters (date range, owner for manager/admin, pipeline).
- Empty/loading/error states; currency format VND.

## Testing

| Group | Test |
| --- | --- |
| Activities | CRUD, timeline order, role/tenant, audit |
| Tasks | due/assignee validation, overdue, done idempotent |
| Scheduler | fake clock, dedupe 10 runs, inactive assignee |
| Reports | formula correctness, filters, empty, Sales scope, tenant |
| Perf | 5k deals p95 |
| UI | timeline, tasks, dashboard filters |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Dashboard formulas understood differently | Lock down SCR-011; manual-count tests; record metadata |
| Scheduler duplicate notifications | unique dedupe + job lock; test 10 times |
| Timezone drift | Use the org timezone; test day boundaries |
| Slow report | Index + aggregate SQL; cache in 007 |
| Task done twice | Idempotent, audit once |
| Activity content XSS | Render text/escape; sanitize if markdown |

## Complexity Tracking

No violations. The scheduler runs inside the API for the MVP; split out a worker as load grows.
