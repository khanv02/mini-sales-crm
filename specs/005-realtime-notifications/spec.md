# Feature Specification: Realtime & Notifications

**Feature Branch**: `005-realtime-notifications`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-09; ADR-007, ADR-012; SCR-007, SCR-008; `docs/events.md`

## User Scenarios & Testing

### US-1 — Secure realtime connection (Priority: P1)

A signed-in user opens a socket; the server verifies the JWT and places the client in the correct room by
user/role/org.

**Why P1**: If the room is wrong, all of FR-09 is wrong and data can leak.

**Independent test**: Connect with a valid/invalid token; check the room; try to join another org's room.

**Acceptance Scenarios**:

1. **AC-FR09-01** Given a valid access token, When connecting to Socket.IO, Then the server joins
   `user:{userId}`; Manager/Admin also join `org:{orgId}:managers`; Sales do not join managers.
2. **AC-FR09-02** Given a missing/invalid/expired token, When connecting, Then `connect_error` code
   `UNAUTHENTICATED`; no room join, no events received.
3. **AC-FR09-03** Given a Sales user tries to join another org's room/a manager room, When emitting join,
   Then it is ignored or the client is disconnected; no events beyond their permission are received.

---

### US-2 — Deal realtime (Priority: P1)

When a deal is moved/assigned, users with permission see the update in < 1 second; users without permission
receive nothing.

**Why P1**: Main AC of FR-05/FR-09; collaborative kanban experience.

**Independent test**: 2 browser contexts; A moves; B/Manager receive; Sales C does not; measure the time.

**Acceptance Scenarios**:

1. **AC-FR09-04** Given a successful deal move, When the transaction commits, Then emit `deal.moved` to the
   current owner, the previous owner (if different) and managers; minimal payload; no emit if the transaction
   rolls back.
2. **AC-FR09-05** Given Sales B does not own the deal, When Sales A moves it, Then B receives no event; the
   Manager does.
3. **AC-FR09-06** Given the deal owner changes, When assigning, Then the old owner + new owner + managers
   receive `deal.assigned`; a `DEAL_ASSIGNED` notification is created for the new owner.
4. **AC-FR09-07** Given event emission fails (socket/server), When the move succeeds, Then HTTP is still 200;
   the error is only logged; DB/audit do not roll back.
5. **AC-FR09-08** Given the client receives an event with an older `version` than its state, When handling
   it, Then ignore it; if it diverges a lot, refetch the deal/board; no crash.

---

### US-3 — Task & notification center (Priority: P2)

Due/overdue tasks emit realtime and store a notification; the user reads/marks as read.

**Why P2**: Needed for FR-07/FR-09; polling can be used temporarily if realtime is slow.

**Independent test**: Create an overdue task; the scheduler runs; check the event + notification list/read.

**Acceptance Scenarios**:

1. **AC-FR09-09** Given a due/overdue task, When the scheduler processes it, Then create a notification
   (dedupe) and emit `task.due` to the assignee; do not emit to anyone else.
2. **AC-FR09-10** Given a user has notifications, When `GET /notifications?unread=true`, Then only their own
   notifications, newest first, cursor; `PATCH /notifications/:id/read` idempotent;
   `POST /notifications/read-all`.
3. **AC-FR09-11** Given another user's/another org's notification, When marking it read, Then `404`; no DB
   change.
4. **AC-FR09-12** Given the socket disconnects, When reconnecting, Then the client invalidates/refetches
   deals/tasks/notifications; no event replay needed; the UI shows the connection status.

### Edge Cases

- A user opens several tabs → all receive events; closing a tab does not affect the others.
- A user is deactivated/changed role while connected → disconnect/reconnect to apply the new permissions.
- An event arrives before the HTTP response → the client still handles it idempotently by version/eventId.
- Manager/Admin is also the owner → receives only one event (dedupe by eventId/socket).
- Several workers emit duplicate events → the client dedupes eventId; the server tries to emit once.
- Large notification payload → limited to 4KB, IDs/type only.
- Redis adapter for Socket.IO if scaling to several instances; MVP is one instance, designed for it.

## Requirements

### Functional Requirements

- **FR-09.1**: Default Socket.IO namespace, JWT auth middleware; rooms per ADR-012; no shared org room.
- **FR-09.2**: Emit `deal.moved`, `deal.assigned`, `task.due`, `notification.created`, `import.completed`,
  `webhook.failed` per `docs/events.md`.
- **FR-09.3**: Events are emitted **after commit**; emit errors do not affect the business flow; at-most-once.
- **FR-09.4**: Notification DB: list/filter/unread, read, read-all; unique dedupe_key; RBAC/tenant.
- **FR-09.5**: The task scheduler creates notification + event; dedupe by task/bucket; email is handled by 006.
- **FR-09.6**: Client reconnect → invalidate queries; show status; no replay.
- **FR-09.7**: Minimal payload, no title/value/email; ≤ 4KB.
- **FR-09.8**: Test RBAC room, E2E 2 browser, event failure isolation.

### Key Entities

- Notification (section 4.9), Deal/Activity (event source). Event contract: `docs/events.md`.

## Success Criteria

- **SC-001**: p95 from HTTP 200 to the other client's DOM updating ≤ 1000ms (20 runs, local).
- **SC-002**: 0 deal events leaking to Sales who do not own them (test + review).
- **SC-003**: 100% of notifications have dedupe; 10 scheduler runs produce no duplicates.
- **SC-004**: Reconnect resyncs correctly within < 2s.

## Assumptions

- One API instance in the MVP; if scaling, add a Redis adapter for Socket.IO.
- The client uses TanStack Query; events only invalidate/patch, never replace the whole cache.
- The notification center is a simple UI (dropdown/page).
- Reminder email belongs to 006; 005 only creates notification + event.
- Online users receive realtime; offline users see notifications when they sign in again.

## Out of Scope

- Push notification mobile/web, email in this feature.
- Presence/typing indicator, chat.
- Notification preference by type (may be added later).
- Event replay/durable stream.
- Multi-instance Socket.IO adapter (designed, not built).

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-09 | AC-FR09-01..12 | T400–T419 |
| FR-05 realtime | AC-FR05-03..05 | T406 |
| FR-07 overdue | AC-FR07-08 | T410–T411 |
