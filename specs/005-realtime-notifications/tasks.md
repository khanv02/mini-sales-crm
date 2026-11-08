# Tasks: Realtime & Notifications

**Input**: `specs/005-realtime-notifications/`
**Prerequisites**: 003, 004, plan.md, spec.md
**Tests**: Bắt buộc. Test RBAC room và E2E 2 context là điều kiện merge.

## Phase 1 — Setup

- [ ] **T400** `apps/api/src/modules/realtime/realtime.gateway.ts` + `ws-auth.middleware.ts`: JWT handshake;
      join `user:{id}`, `org:{id}:managers` (Manager/Admin), `org:{id}:system`; unit test auth/rooms.
- [ ] **T401** [P] `common/events/realtime-publisher.ts`: resolve rooms theo event; interface; test mapping.
- [ ] **T402** [P] `packages/shared/src/events.ts`: envelope/payload zod; export types.
- [ ] **T403** Redis adapter (optional, cấu hình sẵn) + graceful shutdown; health socket.

## Phase 2 — US1/2 Deal realtime (P1) 🎯

### Tests first

- [ ] **T404** `apps/api/test/integration/realtime.spec.ts`: connect token sai/hết hạn; Sales không join
      managers; Manager join; Sales B không nhận deal A; owner nhận; event sau commit.
- [ ] **T405** Test emit lỗi không làm fail HTTP; event version cũ bị client bỏ qua (unit client helper).

### Implementation

- [ ] **T406** `modules/deals/deal-events.publisher.ts`: publish `deal.moved`/`deal.assigned` sau commit;
      payload tối giản; owner cũ/mới + managers.
- [ ] **T407** `modules/notifications`: dùng service 004; thêm tạo `DEAL_ASSIGNED`, emit
      `notification.created`; endpoint list/read/read-all.
- [ ] **T408** `notification.controller.ts` + tests role/tenant; cursor/unread.

## Phase 3 — US3 Task/notification (P2)

### Tests first

- [ ] **T409** `test/integration/notifications.spec.ts`: list/filter/read/read-all, người khác 404, tenant.
- [ ] **T410** `test/unit/realtime-publisher.spec.ts`: task.due → assignee; import.completed → creator+
      managers; webhook.failed → managers.

### Implementation

- [ ] **T411** Nối scheduler 004: tạo notification → emit `task.due`/`notification.created`; dedupe.
- [ ] **T412** Frontend: toast/invalidate cho `import.completed`/`webhook.failed` bằng mock payload
      (emit thật thuộc 006 T507/T513).

## Phase 4 — Frontend & E2E

- [ ] **T413** [P] `apps/web/src/lib/socket.ts` + `SocketProvider`: connect/reconnect, token refresh,
      connection state, invalidate query.
- [ ] **T414** [P] Notification bell/dropdown/page: unread, mark read, read-all, toast.
- [ ] **T415** Kanban realtime patch: apply `deal.moved` nếu version mới; nếu lệch → invalidate.
- [ ] **T416** `apps/web/e2e/kanban-realtime.spec.ts`: 2 context, A move, B/Manager thấy ≤ 1s (p95 20 lần).
- [ ] **T417** `apps/web/e2e/reconnect.spec.ts`: offline/online → refetch, không mất state.

## Phase 5 — Verification

- [ ] **T418** Chạy full integration + E2E; kiểm tra không rò event cho Sales; log/metric.
- [ ] **T419** Cập nhật `docs/events.md`, traceability, ADR-012 status; PR checklist.

## Dependencies

- T400–T403 trước publisher.
- T404–T408 cần deal events 003.
- T409–T412 cần notification 004.
- T413–T417 sau API.
- 006 dùng publisher cho import/webhook event.

## MVP checkpoint

Sau T408: deal move/assign realtime đúng quyền. Sau T416: AC < 1s pass.

## Notes

- Không broadcast org; payload tối giản (ADR-012).
- At-most-once; reconnect refetch; không replay.
- Nếu nhiều instance, bật Redis adapter; test 1 instance MVP.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR09-01..12 | T400–T419 |
| AC-FR05-03..05 (realtime) | T406 |
| AC-FR07-08 (overdue notification) | T410–T411 |
