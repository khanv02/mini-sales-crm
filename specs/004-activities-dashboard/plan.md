# Implementation Plan: Activities, Tasks & Dashboard

**Branch**: `004-activities-dashboard` | **Date**: 2026-11-08 | **Spec**: `specs/004-activities-dashboard/spec.md`

## Summary

Thêm timeline hoạt động (note/call/email/task), task projection + scheduler quá hạn, và dashboard aggregate
theo công thức SCR-011. Cache 60s được thiết kế hook nhưng triển khai đầy đủ ở 007.

## Technical Context

- **Backend**: modules `activities`, `tasks` (projection), `reports`; BullMQ repeatable job.
- **Frontend**: deal timeline, tasks page, dashboard charts (shadcn/ui chart, dùng Recharts bên dưới).
- **Storage**: activities, notifications; deals.closed_at/currency.
- **Testing**: Jest/Supertest; fake timers cho scheduler; perf 5k deals.
- **Performance**: summary p95 < 300ms; scheduler < 1 phút.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | zod activity/report DTO | Pass |
| C2 phân lớp | ReportRepository raw SQL; controller mỏng | Pass |
| C3 org_id | mọi query org; composite FK activity | Pass |
| C4 audit | activity create/update/done audit | Pass |
| C5 validate/error | task due/assignee, date range | Pass |
| C6 secret | không secret | Pass |
| C7 async | scheduler BullMQ repeatable; email ở 006 | Pass |
| C8 test | happy/lỗi/role/tenant + scheduler dedupe | Pass |
| C9 PR nhỏ | T300–T319 theo nhóm | Pass |

## Data Model (delta)

- `activities`: type, content, due_at, done_at, assignee_id, created_by; check task.
- `notifications`: type, payload, dedupe_key, read_at.
- `deals.closed_at`, `organizations.currency/timezone`.
- Chi tiết `docs/data-model.md` 4.8–4.9.

## API

| Method | Path | Ghi chú |
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

- List mặc định assignee = current; Manager/Admin có thể `assigneeId`.
- `PATCH done`: set `done_at=now()`; idempotent nếu đã done (trả 200, không audit lần 2) hoặc 409 — chọn 200
  idempotent để UI đơn giản; audit chỉ lần đầu.
- Reopen task: `done_at=null` (nếu cho phép); audit.

## Scheduler

- BullMQ repeatable `scan-task-reminders` mỗi phút (jobId cố định).
- Query task open due <= now + 24h, join user active, org.
- Notification:
  - `TASK_DUE` nếu `0 < due_at - now <= 24h`, dedupe `task:{id}:due_soon`.
  - `TASK_OVERDUE` nếu `due_at < now`, dedupe `task:{id}:overdue`.
- Upsert notification `on conflict` unique; nếu insert mới → emit event (005) + enqueue email (006).
- Chạy 2 instance: unique/dedupe bảo vệ; job lock của BullMQ.

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

- Timezone: chuyển `from/to` date sang timestamptz theo org timezone ở service; SQL dùng UTC.
- Sales: `ownerId = currentUser`, bỏ qua query param khác.
- Cache key (007): `report:{orgId}:{role}:{userId|all}:{hash(filters)}:{dataVersion}`.

## Frontend

- Deal detail: timeline tabs (All/Notes/Calls/Tasks), add note/call, task form (assignee, due).
- Tasks page: tabs Open/Overdue/Done; overdue badge; mark done optimistic.
- Dashboard: cards (new leads, pipeline value, win rate), bar chart deals by stage, line/bar forecast by
  month, filters (date range, owner for manager/admin, pipeline).
- Empty/loading/error states; currency format VND.

## Testing

| Nhóm | Test |
| --- | --- |
| Activities | CRUD, timeline order, role/tenant, audit |
| Tasks | due/assignee validation, overdue, done idempotent |
| Scheduler | fake clock, dedupe 10 runs, inactive assignee |
| Reports | formula correctness, filters, empty, Sales scope, tenant |
| Perf | 5k deals p95 |
| UI | timeline, tasks, dashboard filters |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| Công thức dashboard hiểu khác | Chốt SCR-011; test tính tay; ghi metadata |
| Scheduler trùng notification | unique dedupe + job lock; test 10 lần |
| Timezone lệch | Dùng org timezone; test biên ngày |
| Report chậm | Index + aggregate SQL; cache 007 |
| Task done 2 lần | Idempotent, audit 1 lần |
| Activity content XSS | Render text/escape; sanitize nếu markdown |

## Complexity Tracking

Không vi phạm. Scheduler chạy trong API MVP; tách worker khi tải tăng.
