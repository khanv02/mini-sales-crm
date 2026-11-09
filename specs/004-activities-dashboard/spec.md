# Feature Specification: Activities, Tasks & Dashboard

**Feature Branch**: `004-activities-dashboard`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-07, FR-08; ADR-010; SCR-011; NFR-01

## User Scenarios & Testing

### US-1 — Log activities on a deal (Priority: P1)

Sales record notes/calls/emails in the deal timeline; Manager/Admin can see the timeline within the org.

**Why P1**: without an interaction history a CRM is only a table of values; this is the data for AI later.

**Independent test**: create a note/call on a deal; list the timeline; check permissions and audit.

**Acceptance Scenarios**:

1. **AC-FR07-01** Given a deal of their own, When creating an activity `NOTE`/`CALL`/`EMAIL` with content, Then
   `201`, `created_by` = self, audit `ACTIVITY_CREATED`; the timeline returns newest first.
2. **AC-FR07-02** Given Sales B, When creating an activity on Sales A's deal, Then `404`; Manager/Admin can create.
3. **AC-FR07-03** Given activities, When listing `GET /deals/:id/activities?limit=...`, Then cursor pagination,
   correct order, no activities from another org mixed in.
4. **AC-FR07-04** Given an activity of their own, When editing the content, Then `200`, audit before/after; someone
   else editing it → `404`/`403` according to permission.

---

### US-2 — Tasks and overdue reminders (Priority: P1)

Sales create tasks with a due date/assignee; overdue tasks appear in the list and raise a notification.

**Why P1**: the main FR-07 AC; preventing forgotten follow-ups is why the product exists.

**Independent test**: create a task with a past due date; call `/tasks?status=overdue`; check the notification.

**Acceptance Scenarios**:

1. **AC-FR07-05** Given a deal, When creating a `TASK` with `dueAt` + `assigneeId` in the same org, Then `201`, the
   task appears in the timeline and in the assignee's `/tasks`.
2. **AC-FR07-06** Given a missing `dueAt` or assignee, When creating a task, Then `400 TASK_DUE_REQUIRED`/
   `TASK_ASSIGNEE_REQUIRED`; nothing is written to the DB.
3. **AC-FR07-07** Given an unfinished task, When the assignee marks it done, Then `done_at` is set, the task leaves
   overdue; marking it a second time is idempotent (200) or 409 by convention; audit.
4. **AC-FR07-08** Given an overdue task (`due_at < now`, `done_at null`), When the scheduler scans, Then the task is
   in `/tasks?status=overdue` and **one** `TASK_OVERDUE` notification is created (dedupe), not spammed every minute.
5. **AC-FR07-09** Given Sales B, When viewing/editing Sales A's task, Then `404`; Manager/Admin can view tasks in the
   org; only the assignee/creator can mark it done (Manager/Admin may override).
6. **AC-FR07-10** Given Admin of org B, When reading an org A activity/task, Then `404`; the DB is unchanged.

---

### US-3 — Dashboard (Priority: P2)

Manager/Sales view new leads, deals by stage, total pipeline, win rate, forecast by month; filter by time/owner.

**Why P2**: needed for G2, but the kanban + tasks already give a core M1 demo.

**Independent test**: seed many WON/LOST/OPEN deals; call summary; compare the figures against a manual count.

**Acceptance Scenarios**:

1. **AC-FR08-01** Given contacts created within the range, When summary, Then `newLeads` = the number of contacts
   with `created_at` in the range (soft-deleted ones are not counted).
2. **AC-FR08-02** Given deal OPEN, When summary, Then `dealsByStage` groups by stage, only deals created in the range
   and still OPEN; count + value are correct.
3. **AC-FR08-03** Given deal OPEN, When summary, Then `pipelineValue` = the sum of `value` of OPEN deals in the
   range/owner filter; WON/LOST are not included.
4. **AC-FR08-04** Given deal WON/LOST, When summary, Then `winRate = won / (won + lost)` by `closed_at` in the
   range; no closed deals → 0 (no division by zero).
5. **AC-FR08-05** Given deal OPEN with `expected_close`, When summary, Then `forecastByMonth` = the sum of value by
   `expected_close` month within 6 months from the start; deals without expected_close are skipped.
6. **AC-FR08-06** Given the filter `from/to/ownerId/pipelineId`, When summary, Then it is applied correctly;
   `from > to` or > 366 days → `400 INVALID_DATE_RANGE`/`REPORT_RANGE_TOO_LARGE`.
7. **AC-FR08-07** Given Sales, When summary, Then only the figures for owner = self; a different `ownerId` is
   ignored/403; Manager/Admin see the whole org or filter by owner.
8. **AC-FR08-08** Given Admin of org B, When summary, Then no org A data is visible.
9. **AC-FR08-09** Given 5,000 deals, When summary, Then p95 < 300ms; no N+1; the figures match the SQL query.

### Edge Cases

- Deal WON but `closed_at` null because of old data → not counted in win rate; log warn; backfill migration if
  needed.
- `expected_close` in the past → still goes into the corresponding month; the forecast can be negative in time, the
  UI states it clearly.
- Currency different from the org (old data) → summed as the org currency; log warn; no conversion.
- Contact soft-deleted after creation → not counted in newLeads.
- Task overdue but the assignee is inactive → still create a notification for the assignee? No email is sent; is a DB
  notification still created for Admin/Manager? Decision: assignee only; if inactive, skip the email, keep the task
  overdue.
- Scheduler runs on 2 instances at once → the unique dedupe key protects it.
- Date range across the org timezone → computed in `Asia/Ho_Chi_Minh`; the API accepts `from/to` dates.
- Empty dashboard → return 0/empty arrays, not 404.
- Activity content contains HTML/script → stored as text, rendered escaped.

## Requirements

### Functional Requirements

**Activities & tasks**

- **FR-07.1**: Create an activity `NOTE/CALL/EMAIL/TASK` attached to a deal; content 1–10,000; author = current.
- **FR-07.2**: A task requires `due_at` + `assignee_id`; the assignee is active in the same org; done_at on
  completion.
- **FR-07.3**: Timeline list by `created_at desc, id desc`, cursor; filter by type.
- **FR-07.4**: `/tasks` filters `status=open|overdue|done`, `assigneeId` (Manager/Admin), `dueFrom/To`; Sales
  default to assignee = self.
- **FR-07.5**: The scheduler runs every minute and creates overdue/due-soon notifications with a `dedupe_key`; no
  duplicates.
- **FR-07.6**: Audit every activity create/update; audit task done.
- **FR-07.7**: RBAC/tenant as in the permissions matrix.

**Dashboard**

- **FR-08.1**: `GET /reports/summary?from&to&ownerId&pipelineId` returns:
  `newLeads`, `dealsByStage[]`, `pipelineValue`, `winRate`, `forecastByMonth[]`, `generatedAt`.
- **FR-08.2**: Formulas per SCR-011/AC-FR08-01..05; stated in the response metadata/README.
- **FR-08.3**: Sales are forced to owner = self; Manager/Admin filter by owner optionally; pipeline filter optional.
- **FR-08.4**: Date range defaults to the current month; at most 366 days; org timezone.
- **FR-08.5**: Aggregate queries in the DB, no N+1; indexes per data-model; 60s cache in 007.
- **FR-08.6**: No contact PII is returned; aggregates only.

### Key Entities

- Activity (including task), Notification; Deal/Stage/Contact for the aggregates. Details in `docs/data-model.md`.

### Official formulas (SCR-011)

```text
from, to = dates in the org timezone (default: start of month → today)
newLeads = count(contacts where created_at in [from,to] and deleted_at is null)
dealsByStage = group(open deals where created_at in [from,to]) by stage
pipelineValue = sum(open deals.value where created_at in [from,to])
winRate = won / (won + lost) where closed_at in [from,to]; if the sample = 0 → 0
forecastByMonth = group(open deals where expected_close in [from, from+6 months]) by month
```

## Success Criteria

- **SC-001**: Create a task + see it overdue + get the notification in < 2 minutes (1-minute scheduler).
- **SC-002**: The dashboard matches a manual count 100% on the seed; p95 < 300ms.
- **SC-003**: 100% of ACs have tests; 100% of endpoints have tenant/role tests.
- **SC-004**: 0 duplicate notifications when the scheduler runs 10 times.

## Assumptions

- A task is always attached to a deal (ADR-010); there are no standalone tasks yet.
- The DB notification is the source of truth; realtime/email are secondary channels (005/006).
- The MVP dashboard uses the org currency, no conversion.
- `expected_close` is the expected close date, entered by sales.
- The scheduler runs inside the API process for the MVP; it can be split into a worker.

## Out of Scope

- Activity attachments/files, mentions, comment threads.
- Recurring tasks, subtasks, checklists.
- Weighted forecast by stage probability.
- Dashboard export (feature 007 exports contacts/deals).
- Custom dashboard builder.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-07 | AC-FR07-01..10 | T300–T310, T316–T317, T319 |
| FR-08 | AC-FR08-01..09 | T311–T315, T318–T319 |
| NFR-01 | AC-NFR01-01..02 | T312, T607 |
