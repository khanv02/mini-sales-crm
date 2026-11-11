# ADR-010 — A task is an activity with `type='task'`

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: FR-07, sections 6 and 8
- **Related**: SCR-004

## Context

The spec has an `activities` table with `type (note/call/email/task)`, `due_at`, `done_at`, `assignee_id`, and an
endpoint `GET /tasks?status=overdue`, but no `tasks` table. A choice is needed: add a separate table, or treat a
task as one kind of activity.

## Decision

Keep **one** table, `activities`. A task is an activity with `type='TASK'` and these constraints:

- `due_at` is required.
- `assignee_id` is required.
- `done_at` only exists on tasks.
- `content` is the task title/description.

`GET /tasks` is a projection (view logic) over activities, not a new entity. `PATCH /tasks/:id` updates
`done_at`, `due_at`, `assignee_id` and `content` on the matching activity.

## Consequences

**Positive**

- No duplicated data or timeline.
- One table for activities and tasks; simpler reporting/timeline.
- Fewer migrations, less code.

**Negative / trade-offs**

- A task always belongs to a deal (as the spec stands); standalone tasks are unsupported.
- Task queries need a `type='TASK'` filter + partial index.
- Task templates/subtasks later would need a new ADR.

## Rules

- Partial index `(org_id, assignee_id, due_at) WHERE type='TASK' AND done_at IS NULL`.
- Creating a task without a deal is rejected in the MVP.
- Notifications/email are derived from the task activity.
- If standalone tasks are needed: add a nullable `deal_id` + migration + ADR, never a parallel table.

## Rejected alternatives

- **A separate `tasks` table**: duplicates the timeline, requires syncing two places, adds complexity.
- **Only tasks, no activities**: loses the note/call/email timeline.
