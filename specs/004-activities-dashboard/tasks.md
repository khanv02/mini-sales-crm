# Tasks: Activities, Tasks & Dashboard

**Input**: `specs/004-activities-dashboard/`
**Prerequisites**: 002, 003, plan.md, spec.md
**Tests**: Mandatory (C8). The scheduler/aggregate must have tests first.

## Phase 1 — Schema & shared

- [ ] **T300** Prisma/migration `0003_workflow`: `activities`, `notifications`; partial index overdue;
      update data-model. (`deals.closed_at` in `0002_crm_core`; org currency/timezone in `0001_init`.)
- [ ] **T301** [P] Shared schemas: activity create/update, task filter, report query/filters.
- [ ] **T302** [P] Factories activity/task; fake clock helper; audit helper.

## Phase 2 — US1 Activities (P1)

### Tests first

- [ ] **T303** `backend/test/integration/activities.spec.ts`: note/call/email create, timeline order,
      pagination, update, Sales own/Manager all, tenant, audit.
- [ ] **T304** Validation test: empty/too long content, wrong type, deal in another org.

### Implementation

- [ ] **T305** `modules/activities/{repository,service,controller}.ts`: org-scoped; timeline query; audit;
      map Prisma errors.

## Phase 3 — US2 Tasks & overdue (P1)

### Tests first

- [ ] **T306** `backend/test/integration/tasks.spec.ts`: create task due/assignee, missing → 400, done,
      idempotent done, overdue filter, Manager filter assignee, tenant.
- [ ] **T307** `backend/test/unit/task-scheduler.spec.ts`: due soon/overdue buckets, dedupe 10 runs, inactive.

### Implementation

- [ ] **T308** `modules/tasks/task.controller.ts` + `activity.service` projection: `/tasks`, `PATCH /tasks/:id`.
- [ ] **T309** `modules/notifications/notification.service.ts`: create/upsert dedupe; list/read/read-all
      (internal service; 005 owns the controller/API).
- [ ] **T310** `modules/tasks/task-reminder.scheduler.ts`: BullMQ repeatable every minute (base queue T020);
      create notifications; emit events through the EventBus (005).

## Phase 4 — US3 Dashboard (P2)

### Tests first

- [ ] **T311** `backend/test/integration/reports.spec.ts`: newLeads, dealsByStage, pipelineValue, winRate,
      forecast, filters, empty, Sales scope, tenant, invalid range.
- [ ] **T312** `backend/test/perf/reports.perf.ts`: 5k deals p95 < 300ms.

### Implementation

- [ ] **T313** `modules/reports/report.repository.ts`: aggregate SQL; indexes; timezone conversion.
- [ ] **T314** `report.service.ts` + `report.controller.ts`: filters, role scope, metadata formulas, cache hook.
- [ ] **T315** Integrate the cache interface (no-op in 004; implemented in 007); invalidate hook placeholder.

## Phase 5 — Frontend & verification

- [ ] **T316** [P] `frontend/src/features/deals/Timeline.tsx`: tabs, add note/call, task form.
- [ ] **T317** [P] `frontend/src/features/tasks`: tabs Open/Overdue/Done, mark done, overdue badge.
- [ ] **T318** [P] `frontend/src/features/dashboard`: cards/charts/filters, currency, empty/loading.
- [ ] **T319** `frontend/e2e/tasks-dashboard.spec.ts`: task overdue → list; dashboard figures; update
      traceability.

## Dependencies

- T300 → T301–T302.
- Activities (T303–T305) before tasks (T306–T310).
- Reports (T311–T315) need deals (003).
- Frontend T316–T318 after the corresponding API.
- 005 uses T309/T310; 006 uses notification/email.

## MVP checkpoint

After T310: note/task/overdue + DB notification work. After T315: the dashboard matches the formulas. After T319:
M1 satisfies FR-07/08.

## Notes

- Task = activity type TASK (ADR-010); do not create a tasks table.
- The scheduler runs inside the API for the MVP; if split into a worker, keep the job name.
- The real cache is in 007; 004 only calls the interface.
- Report SQL must filter by org in every query; test org B.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR07-01..10 | T300–T310, T316–T317, T319 |
| AC-FR08-01..09 | T311–T315, T318–T319 |
| AC-NFR01-01..02 | T312, T607 |
