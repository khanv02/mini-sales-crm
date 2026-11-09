# Implementation Plan: Realtime & Notifications

**Branch**: `005-realtime-notifications` | **Date**: 2026-11-08 | **Spec**: `specs/005-realtime-notifications/spec.md`

## Summary

Add a Socket.IO gateway with JWT auth, rooms by user/manager/system, emit events after commit for deal/task/
notification; notification center API/UI; ensure Sales never receive other people's data.

## Technical Context

- **Backend**: NestJS `@nestjs/websockets` + Socket.IO; Redis adapter (scale-ready); internal EventBus.
- **Frontend**: `socket.io-client`, TanStack Query invalidation, toast, connection indicator.
- **Storage**: notifications; no other new tables.
- **Testing**: Jest + socket.io-client; Playwright 2 contexts; fake timers.
- **Performance**: event to client ≤ 1s p95.

## Constitution Check

| Gate | How it is satisfied | Status |
| --- | --- | --- |
| C1 strict | event types/payload zod | Pass |
| C2 layering | gateway → notification service; publisher after commit | Pass |
| C3 org_id | rooms from JWT; payload carries org; tenant test | Pass |
| C4 audit | notification is not a business mutation; deal audit in 003 | Pass |
| C5 validate | event payload schema; notification DTO | Pass |
| C6 secret | JWT handshake; no token logging | Pass |
| C7 async | emit after commit; errors do not block | Pass |
| C8 test | RBAC room, E2E, reconnect | Pass |
| C9 small PR | T400–T419 | Pass |

## Data Model

- `notifications`: org, user, type, payload, dedupe_key, read_at; unique dedupe.
- `deals`/`activities` are the event source; no outbox in the MVP (at-most-once).

## Socket design

```text
Client connect(auth.token)
  → JwtWsGuard verify
  → join user:{userId}
  → if role MANAGER/ADMIN: join org:{orgId}:managers
  → join org:{orgId}:system

EventBus.publish(event) after tx commit
  → RealtimePublisher.resolveRooms(event)
      deal.moved: ownerId, previousOwnerId, managers
      deal.assigned: fromOwnerId, toOwnerId, managers
      task.due/notification: user:{userId}
      import.completed: creator, managers
      webhook.failed: managers (Admin filter client)
  → server.to(rooms).emit(type, envelope)
```

- Envelope `{ eventId, occurredAt, orgId, type, payload }`.
- Client dedupes eventId; version check for deals.
- If emit fails: log warn, metric; do not throw.

## Notification service

- `create({orgId,userId,type,payload,dedupeKey})` → upsert `on conflict` (unique partial).
- If a new insert → emit `notification.created`; if conflict → skip.
- List: filter unread/type, cursor `(created_at,id)`; mark read idempotent; read-all.
- RBAC: only own notifications; tenant from JWT.
- Cleanup/retention: not yet.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications?unread=true&type=` | own |
| PATCH | `/notifications/:id/read` | idempotent |
| POST | `/notifications/read-all` | own |

## Frontend

- `SocketProvider` after login; refresh token before reconnect; disconnect on logout.
- `useRealtime` invalidate:
  - `deal.moved` → `['deals', pipelineId]`, `['deal', id]`
  - `deal.assigned` → deals + notifications
  - `task.due` → `['tasks']`, notifications
  - `notification.created` → `['notifications']`
- Toast for assignment/overdue; bell unread count.
- Small connection status (online/offline); on reconnect → invalidate all related queries.
- Do not rely on events to replace full data; always refetch if the version diverges.

## Testing

| Group | Test |
| --- | --- |
| Auth socket | wrong/expired token; no join |
| Rooms | Sales do not join managers; Manager joins |
| deal.moved | owner/manager receive; other Sales do not |
| assign | old/new owner receive; notification |
| task.due | assignee receives; dedupe |
| Notification API | list/read/read-all, role/tenant |
| Failure | emit failure does not fail HTTP |
| E2E | 2 contexts, < 1s; reconnect resync |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Data leak via room/payload | ADR-012, RBAC tests, minimal payload |
| Event before commit | Publish hook after transaction; rollback test |
| Many tabs/many instances | eventId dedupe; Redis adapter when scaling |
| Reconnect loses events | invalidate/refetch; no replay |
| Token expires mid-session | client refresh + reconnect; server disconnect |
| Role changes while online | reconnect/role.changed; test |

## Complexity Tracking

No violation. Choosing rooms by role is more complex than broadcast but required to comply with RBAC.
