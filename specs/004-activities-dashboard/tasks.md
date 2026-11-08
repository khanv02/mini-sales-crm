# Tasks: Activities, Tasks & Dashboard

**Input**: `specs/004-activities-dashboard/`
**Prerequisites**: 002, 003, plan.md, spec.md
**Tests**: Bắt buộc (C8). Scheduler/aggregate phải có test trước.

## Phase 1 — Schema & shared

- [ ] **T300** Prisma/migration `0003_workflow`: `activities`, `notifications`; partial index overdue;
      cập nhật data-model. (`deals.closed_at` ở `0002_crm_core`; org currency/timezone ở `0001_init`.)
- [ ] **T301** [P] Shared schemas: activity create/update, task filter, report query/filters.
- [ ] **T302** [P] Factories activity/task; fake clock helper; audit helper.

## Phase 2 — US1 Activities (P1)

### Tests first

- [ ] **T303** `apps/api/test/integration/activities.spec.ts`: note/call/email create, timeline order,
      pagination, update, Sales own/Manager all, tenant, audit.
- [ ] **T304** Validation test: content rỗng/quá dài, type sai, deal org khác.

### Implementation

- [ ] **T305** `modules/activities/{repository,service,controller}.ts`: org-scoped; timeline query; audit;
      map Prisma errors.

## Phase 3 — US2 Tasks & overdue (P1)

### Tests first

- [ ] **T306** `apps/api/test/integration/tasks.spec.ts`: create task due/assignee, missing → 400, done,
      idempotent done, overdue filter, Manager filter assignee, tenant.
- [ ] **T307** `apps/api/test/unit/task-scheduler.spec.ts`: due soon/overdue buckets, dedupe 10 runs, inactive.

### Implementation

- [ ] **T308** `modules/tasks/task.controller.ts` + `activity.service` projection: `/tasks`, `PATCH /tasks/:id`.
- [ ] **T309** `modules/notifications/notification.service.ts`: create/upsert dedupe; list/read/read-all
      (service nội bộ; 005 sở hữu controller/API).
- [ ] **T310** `modules/tasks/task-reminder.scheduler.ts`: BullMQ repeatable mỗi phút (base queue T020);
      tạo notification; emit event qua EventBus (005).

## Phase 4 — US3 Dashboard (P2)

### Tests first

- [ ] **T311** `apps/api/test/integration/reports.spec.ts`: newLeads, dealsByStage, pipelineValue, winRate,
      forecast, filters, empty, Sales scope, tenant, invalid range.
- [ ] **T312** `apps/api/test/perf/reports.perf.ts`: 5k deals p95 < 300ms.

### Implementation

- [ ] **T313** `modules/reports/report.repository.ts`: aggregate SQL; indexes; timezone conversion.
- [ ] **T314** `report.service.ts` + `report.controller.ts`: filters, role scope, metadata formulas, cache hook.
- [ ] **T315** Integrate cache interface (no-op ở 004; triển khai 007); invalidate hook placeholder.

## Phase 5 — Frontend & verification

- [ ] **T316** [P] `apps/web/src/features/deals/Timeline.tsx`: tabs, add note/call, task form.
- [ ] **T317** [P] `apps/web/src/features/tasks`: tabs Open/Overdue/Done, mark done, overdue badge.
- [ ] **T318** [P] `apps/web/src/features/dashboard`: cards/charts/filters, currency, empty/loading.
- [ ] **T319** `apps/web/e2e/tasks-dashboard.spec.ts`: task overdue → list; dashboard số liệu; update
      traceability.

## Dependencies

- T300 → T301–T302.
- Activities (T303–T305) trước tasks (T306–T310).
- Reports (T311–T315) cần deals (003).
- Frontend T316–T318 sau API tương ứng.
- 005 dùng T309/T310; 006 dùng notification/email.

## MVP checkpoint

Sau T310: note/task/overdue + notification DB chạy. Sau T315: dashboard đúng công thức. Sau T319: M1 đủ FR-07/08.

## Notes

- Task = activity type TASK (ADR-010); không tạo bảng tasks.
- Scheduler chạy trong API MVP; nếu tách worker, giữ job name.
- Cache thật ở 007; 004 chỉ gọi interface.
- Report SQL phải filter org ở mọi query; test org B.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR07-01..10 | T300–T310, T316–T317, T319 |
| AC-FR08-01..09 | T311–T315, T318–T319 |
| AC-NFR01-01..02 | T312, T607 |
