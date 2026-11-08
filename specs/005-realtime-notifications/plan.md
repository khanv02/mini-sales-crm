# Implementation Plan: Realtime & Notifications

**Branch**: `005-realtime-notifications` | **Date**: 2026-11-08 | **Spec**: `specs/005-realtime-notifications/spec.md`

## Summary

Thêm Socket.IO gateway xác thực JWT, room theo user/manager/system, phát event sau commit cho deal/task/
notification; notification center API/UI; đảm bảo Sales không nhận dữ liệu người khác.

## Technical Context

- **Backend**: NestJS `@nestjs/websockets` + Socket.IO; adapter Redis (chuẩn bị scale); EventBus nội bộ.
- **Frontend**: `socket.io-client`, TanStack Query invalidation, toast, connection indicator.
- **Storage**: notifications; không bảng mới khác.
- **Testing**: Jest + socket.io-client; Playwright 2 context; fake timers.
- **Performance**: event tới client ≤ 1s p95.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | event types/payload zod | Pass |
| C2 phân lớp | gateway → notification service; publisher sau commit | Pass |
| C3 org_id | room lấy từ JWT; payload có org; test tenant | Pass |
| C4 audit | notification không phải business mutation; deal audit ở 003 | Pass |
| C5 validate | payload event schema; notification DTO | Pass |
| C6 secret | JWT handshake; không log token | Pass |
| C7 async | emit sau commit; lỗi không chặn | Pass |
| C8 test | RBAC room, E2E, reconnect | Pass |
| C9 PR nhỏ | T400–T419 | Pass |

## Data Model

- `notifications`: org, user, type, payload, dedupe_key, read_at; unique dedupe.
- `deals`/`activities` là nguồn event; không thêm outbox ở MVP (at-most-once).

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
- Client dedupe eventId; version check cho deal.
- Nếu emit lỗi: log warn, metric; không throw.

## Notification service

- `create({orgId,userId,type,payload,dedupeKey})` → upsert `on conflict` (unique partial).
- Nếu insert mới → emit `notification.created`; nếu conflict → bỏ qua.
- List: filter unread/type, cursor `(created_at,id)`; mark read idempotent; read-all.
- RBAC: chỉ notification của mình; tenant từ JWT.
- Cleanup/retention: chưa.

## API

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/notifications?unread=true&type=` | của mình |
| PATCH | `/notifications/:id/read` | idempotent |
| POST | `/notifications/read-all` | của mình |

## Frontend

- `SocketProvider` sau login; refresh token trước khi reconnect; disconnect khi logout.
- `useRealtime` invalidate:
  - `deal.moved` → `['deals', pipelineId]`, `['deal', id]`
  - `deal.assigned` → deals + notifications
  - `task.due` → `['tasks']`, notifications
  - `notification.created` → `['notifications']`
- Toast cho assignment/overdue; bell unread count.
- Connection status nhỏ (online/offline); khi reconnect → invalidate tất cả query liên quan.
- Không dựa vào event để thay dữ liệu đầy đủ; luôn refetch nếu lệch version.

## Testing

| Nhóm | Test |
| --- | --- |
| Auth socket | token sai/hết hạn; không join |
| Rooms | Sales không join managers; Manager join |
| deal.moved | owner/manager nhận; Sales khác không |
| assign | owner cũ/mới nhận; notification |
| task.due | assignee nhận; dedupe |
| Notification API | list/read/read-all, role/tenant |
| Failure | emit lỗi không làm fail HTTP |
| E2E | 2 context, < 1s; reconnect resync |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| Rò dữ liệu qua room/payload | ADR-012, test RBAC, payload tối giản |
| Event trước commit | Publish hook sau transaction; test rollback |
| Nhiều tab/nhiều instance | eventId dedupe; Redis adapter khi scale |
| Reconnect mất event | invalidate/refetch; không replay |
| Token hết hạn giữa phiên | client refresh + reconnect; server disconnect |
| Role đổi khi online | reconnect/role.changed; test |

## Complexity Tracking

Không vi phạm. Việc chọn room theo role phức tạp hơn broadcast nhưng bắt buộc để tuân thủ RBAC.
