# Event Contracts — Realtime & Queue

This document is the contract between backend, frontend and workers. Changing a payload is a breaking change:
update this file + tests + an ADR when architecture is affected.

## 1. Socket.IO

### 1.1 Connection & authentication

```ts
// client
const socket = io(API_URL, {
  transports: ['websocket'],
  auth: { token: accessToken },
});
```

- The server verifies the JWT in the handshake middleware and derives `userId`, `orgId`, `role`.
- Expired token → `connect_error` with `{ code: 'UNAUTHENTICATED' }`; the client refreshes and reconnects.
- Never trust a client-supplied `orgId`/`userId`; always take them from the token.
- A user may open several tabs/sockets; all of them join the same rooms.

### 1.2 Rooms

| Room | Who joins | Used for |
| --- | --- | --- |
| `user:{userId}` | the user itself | own deals, tasks, notifications |
| `org:{orgId}:managers` | Manager/Admin | every deal event in the org |
| `org:{orgId}:system` | everyone | system notices that carry no business data |

There is no shared `org:{orgId}` room for deals (SCR-008/ADR-012): Sales must never see another user's deals.

### 1.3 Events

Every event carries an envelope:

```json
{
  "eventId": "uuid",
  "occurredAt": "2026-11-08T10:00:00.000Z",
  "orgId": "uuid",
  "type": "deal.moved",
  "payload": { }
}
```

#### `deal.moved`

Emitted after the transaction commits, to the current owner + the previous owner + managers.

```json
{
  "eventId": "uuid",
  "occurredAt": "2026-11-08T10:00:00.000Z",
  "orgId": "uuid",
  "type": "deal.moved",
  "payload": {
    "dealId": "uuid",
    "fromStageId": "uuid",
    "toStageId": "uuid",
    "position": "1.5000000000",
    "version": 8,
    "ownerId": "uuid",
    "actorId": "uuid"
  }
}
```

Never contains title, value or contact email — clients with permission refetch or patch their state.

#### `deal.assigned`

To the new owner, the previous owner and managers.

```json
{
  "type": "deal.assigned",
  "payload": {
    "dealId": "uuid",
    "fromOwnerId": "uuid",
    "toOwnerId": "uuid",
    "version": 9,
    "actorId": "uuid"
  }
}
```

#### `task.due`

To the assignee (room `user:{assigneeId}`) when a task becomes due or overdue.

```json
{
  "type": "task.due",
  "payload": {
    "taskId": "uuid",
    "dealId": "uuid",
    "dueAt": "2026-11-08T09:00:00.000Z",
    "assigneeId": "uuid",
    "isOverdue": true
  }
}
```

#### `notification.created`

To the user receiving the notification; the payload is minimal and `payload` mirrors the notifications table.

```json
{
  "type": "notification.created",
  "payload": {
    "notificationId": "uuid",
    "notificationType": "DEAL_ASSIGNED",
    "payload": { "dealId": "uuid" }
  }
}
```

#### `import.completed`

To the job creator + managers.

```json
{
  "type": "import.completed",
  "payload": {
    "jobId": "uuid",
    "status": "PARTIAL",
    "total": 5000,
    "success": 4987,
    "failed": 13
  }
}
```

#### `webhook.failed`

To Admin (the managers room, filtered to the Admin role on the client) when an event reaches the dead-letter state.

```json
{
  "type": "webhook.failed",
  "payload": { "eventId": "uuid", "sourceId": "uuid", "attempts": 3 }
}
```

### 1.4 Delivery semantics

- **At-most-once**; nothing is replayed on reconnect. The database is the source of truth.
- On reconnect the client invalidates TanStack Query (`deals`, `tasks`, `notifications`) to resync.
- `eventId` is used to dedupe when a socket receives the same event twice.
- Emitted after commit; if the emit fails it is only logged and the business transaction is never rolled back.
- Payload ≤ 4KB; no unnecessary PII.
- Ordering between events is not guaranteed; clients use `version` to ignore stale events.
- If the client receives `version` ≤ its current version → ignore; if it drifts → refetch the deal.

### 1.5 Mandatory tests

- Wrong token → no room join, `connect_error`.
- Sales A never receives Sales B's `deal.moved` in the same org.
- Manager receives events from Sales.
- The previous owner receives `deal.assigned` when the deal is reassigned.
- Move a deal → another client updates within ≤ 1s (Playwright, p95 over 20 runs).
- Kill/restart the socket → reconnect + refetch.

## 2. BullMQ

### 2.1 Common configuration

- Redis connection from `REDIS_URL`.
- Each queue has its own worker in the same process (MVP); graceful shutdown closes workers before HTTP.
- Retry: exponential backoff; `attempts` per job; failed jobs stay in the DLQ (never removed).
- `removeOnComplete: { count: 1000 }`, `removeOnFail: false`.
- Jobs are idempotent; when they cannot be, use a `jobId`/unique key.
- Log `jobId`, `queue`, `attempt`, `orgId`, `requestId` (when available).

### 2.2 Queues & jobs

| Queue | Job | Payload | Attempts | Backoff | DLQ |
| --- | --- | --- | --- | --- | --- |
| `imports` | `import-contacts` | `{ jobId, orgId, actorId, fileKey, fileHash }` | 3 | 5s exponential | `imports:dead` |
| `webhooks` | `process-webhook` | `{ eventId, orgId, sourceId }` | 3 | 10s exponential | `webhooks:dead` |
| `emails` | `send-email` | `{ orgId, to, template, data, dedupeKey }` | 3 | 30s exponential | `emails:dead` |
| `reminders` | `scan-task-reminders` | `{}` (repeatable every minute) | 1 | — | `reminders:dead` |
| `ai` | `score-lead` | `{ runId, orgId, userId, contactId }` | 2 | 15s | `ai:dead` |

### 2.3 Idempotency

- Import: `jobId = import:{jobId}`; the worker checks the status before running; unique email + `file_hash`.
- Webhook: unique `(org_id, idempotency_key)`; the worker only processes `RECEIVED/FAILED` events and sets
  `PROCESSING` conditionally so two workers never handle the same event.
- Email: `jobId = email:{dedupeKey}`; check whether the notification/email was already sent before sending.
- AI score: `jobId = ai:score:{runId}`; skip when the run is already `SUCCESS`.

### 2.4 Webhook outbox/sweeper

1. The request verifies the HMAC → insert `webhook_events` with status `RECEIVED` (unique idempotency).
2. Enqueue the job. If enqueueing fails the event stays `RECEIVED` and the API returns 500
   (`WEBHOOK_ENQUEUE_FAILED`).
3. A sweeper runs every minute and re-enqueues `RECEIVED` events older than 60s that have no job.
4. The worker sets `PROCESSING` → creates the contact → `PROCESSED`; on error → `FAILED` + attempts; when
   attempts are exhausted → `DEAD`.
5. Admin sees `webhook.failed` and may retry manually through a future endpoint or a script.

### 2.5 Task reminder

- Repeatable job every minute.
- Find tasks with `type='TASK'`, `done_at is null`, `due_at <= now() + 24h`.
- Create a notification `TASK_DUE` (when the remaining time is > 0) or `TASK_OVERDUE` (when it is < 0) with
  `dedupe_key = task:{id}:{bucket}`, where `{bucket}` is exactly `due_soon` or `overdue` (lowercase) — matching
  `specs/004-activities-dashboard/plan.md`.
- Enqueue an email if the user accepts email (MVP: always internal).
- Never send twice when the job re-runs: unique notification + `jobId`.
- A failed email never changes `done_at`/the task; it is only logged and retried.

### 2.6 Graceful shutdown

- Stop accepting new HTTP requests.
- `worker.close()` per queue and wait for in-flight jobs (30s timeout).
- Close Redis/Prisma.
- `/health/ready` returns 503 while shutting down.

### 2.7 Mandatory tests

- Retry count and backoff behave as specified (fake timers/BullMQ test).
- A job failing 3 times leaves a DLQ record with status `DEAD`.
- A failed enqueue leaves the event `RECEIVED` and the sweeper picks it up.
- Running a job twice creates no duplicate contact/email/notification.
- A worker restart mid-job retries the job and loses no event.
