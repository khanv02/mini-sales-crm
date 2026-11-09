# Tasks: Realtime & Notifications

**Input**: `specs/005-realtime-notifications/`
**Prerequisites**: 003, 004, plan.md, spec.md
**Tests**: Mandatory. RBAC room tests and the 2-context E2E are merge conditions.

## Phase 1 — Setup

- [ ] **T400** `apps/api/src/modules/realtime/realtime.gateway.ts` + `ws-auth.middleware.ts`: JWT handshake;
      join `user:{id}`, `org:{id}:managers` (Manager/Admin), `org:{id}:system`; unit test auth/rooms.
- [ ] **T401** [P] `common/events/realtime-publisher.ts`: resolve rooms per event; interface; mapping test.
- [ ] **T402** [P] `packages/shared/src/events.ts`: envelope/payload zod; export types.
- [ ] **T403** Redis adapter (optional, preconfigured) + graceful shutdown; socket health.

## Phase 2 — US1/2 Deal realtime (P1)

### Tests first

- [ ] **T404** `apps/api/test/integration/realtime.spec.ts`: connect with wrong/expired token; Sales do not join
      managers; Manager joins; Sales B does not receive deal A; owner receives; event after commit.
- [ ] **T405** Test that an emit failure does not fail HTTP; an old event version is ignored by the client (client
      helper unit test).

### Implementation

- [ ] **T406** `modules/deals/deal-events.publisher.ts`: publish `deal.moved`/`deal.assigned` after commit;
      minimal payload; old/new owner + managers.
- [ ] **T407** `modules/notifications`: use the 004 service; add creation of `DEAL_ASSIGNED`, emit
      `notification.created`; list/read/read-all endpoints.
- [ ] **T408** `notification.controller.ts` + role/tenant tests; cursor/unread.

## Phase 3 — US3 Task/notification (P2)

### Tests first

- [ ] **T409** `test/integration/notifications.spec.ts`: list/filter/read/read-all, another user 404, tenant.
- [ ] **T410** `test/unit/realtime-publisher.spec.ts`: task.due → assignee; import.completed → creator+
      managers; webhook.failed → managers.

### Implementation

- [ ] **T411** Wire the 004 scheduler: create notification → emit `task.due`/`notification.created`; dedupe.
- [ ] **T412** Frontend: toast/invalidate for `import.completed`/`webhook.failed` with a mock payload
      (real emit belongs to 006 T507/T513).

## Phase 4 — Frontend & E2E

- [ ] **T413** [P] `apps/web/src/lib/socket.ts` + `SocketProvider`: connect/reconnect, token refresh,
      connection state, query invalidation.
- [ ] **T414** [P] Notification bell/dropdown/page: unread, mark read, read-all, toast.
- [ ] **T415** Kanban realtime patch: apply `deal.moved` if the version is newer; if it diverges → invalidate.
- [ ] **T416** `apps/web/e2e/kanban-realtime.spec.ts`: 2 contexts, A moves, B/Manager see it ≤ 1s (p95 over 20
      runs).
- [ ] **T417** `apps/web/e2e/reconnect.spec.ts`: offline/online → refetch, no state loss.

## Phase 5 — Verification

- [ ] **T418** Run full integration + E2E; check no event leaks to Sales; log/metric.
- [ ] **T419** Update `docs/events.md`, traceability, ADR-012 status; PR checklist.

## Dependencies

- T400–T403 before the publisher.
- T404–T408 need deal events from 003.
- T409–T412 need notifications from 004.
- T413–T417 after the API.
- 006 uses the publisher for import/webhook events.

## MVP checkpoint

After T408: deal move/assign realtime respects permissions. After T416: AC < 1s passes.

## Notes

- No org broadcast; minimal payload (ADR-012).
- At-most-once; reconnect refetch; no replay.
- If there are several instances, enable the Redis adapter; the MVP tests one instance.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR09-01..12 | T400–T419 |
| AC-FR05-03..05 (realtime) | T406 |
| AC-FR07-08 (overdue notification) | T410–T411 |
