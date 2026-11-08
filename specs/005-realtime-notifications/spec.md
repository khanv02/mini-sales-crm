# Feature Specification: Realtime & Notifications

**Feature Branch**: `005-realtime-notifications`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-09; ADR-007, ADR-012; SCR-007, SCR-008; `docs/events.md`

## User Scenarios & Testing

### US-1 — Kết nối realtime an toàn (Priority: P1)

User đăng nhập mở socket; server xác thực JWT và cho vào đúng room theo user/role/org.

**Vì sao P1**: Nếu room sai, toàn bộ FR-09 sai và có thể lộ dữ liệu.

**Kiểm thử độc lập**: Kết nối với token hợp lệ/sai; kiểm tra room; thử join room org khác.

**Acceptance Scenarios**:

1. **AC-FR09-01** Given access token hợp lệ, When kết nối Socket.IO, Then server join `user:{userId}`;
   Manager/Admin join thêm `org:{orgId}:managers`; Sales không join managers.
2. **AC-FR09-02** Given token thiếu/sai/hết hạn, When kết nối, Then `connect_error` code
   `UNAUTHENTICATED`; không join room, không nhận event.
3. **AC-FR09-03** Given Sales cố gắng join room org khác/room manager, When emit join, Then bị bỏ qua hoặc
   disconnect; không nhận event ngoài quyền.

---

### US-2 — Deal realtime (Priority: P1)

Khi deal move/assign, người có quyền thấy cập nhật trong < 1 giây; người không có quyền không nhận.

**Vì sao P1**: AC chính FR-05/FR-09; trải nghiệm kanban cộng tác.

**Kiểm thử độc lập**: 2 browser context; A move; B/Manager nhận; Sales C không nhận; đo thời gian.

**Acceptance Scenarios**:

1. **AC-FR09-04** Given deal move thành công, When transaction commit, Then phát `deal.moved` tới owner hiện
   tại, owner trước đó (nếu khác) và managers; payload tối giản; không phát nếu transaction rollback.
2. **AC-FR09-05** Given Sales B không sở hữu deal, When Sales A move, Then B không nhận event; Manager nhận.
3. **AC-FR09-06** Given deal đổi owner, When assign, Then owner cũ + owner mới + managers nhận
   `deal.assigned`; notification `DEAL_ASSIGNED` được tạo cho owner mới.
4. **AC-FR09-07** Given event phát lỗi (socket/server), When move thành công, Then HTTP vẫn 200; lỗi chỉ log;
   DB/audit không rollback.
5. **AC-FR09-08** Given client nhận event có `version` cũ hơn state, When xử lý, Then bỏ qua; nếu lệch nhiều,
   refetch deal/board; không crash.

---

### US-3 — Task & notification center (Priority: P2)

Task đến hạn/quá hạn phát realtime và lưu notification; user đọc/đánh dấu đã đọc.

**Vì sao P2**: Cần cho FR-07/FR-09; có thể dùng polling tạm nếu realtime chậm.

**Kiểm thử độc lập**: Tạo task quá hạn; scheduler chạy; kiểm tra event + notification list/read.

**Acceptance Scenarios**:

1. **AC-FR09-09** Given task đến hạn/quá hạn, When scheduler xử lý, Then tạo notification (dedupe) và phát
   `task.due` tới assignee; không phát cho người khác.
2. **AC-FR09-10** Given user có notification, When `GET /notifications?unread=true`, Then chỉ notification của
   mình, mới nhất trước, cursor; `PATCH /notifications/:id/read` idempotent; `POST /notifications/read-all`.
3. **AC-FR09-11** Given notification người khác/org khác, When đánh dấu đọc, Then `404`; không đổi DB.
4. **AC-FR09-12** Given socket mất kết nối, When reconnect, Then client invalidate/refetch deals/tasks/
   notifications; không cần replay event; UI hiển thị trạng thái kết nối.

### Edge Cases

- User mở nhiều tab → tất cả nhận event; đóng tab không ảnh hưởng tab khác.
- User bị deactivate/đổi role khi đang kết nối → disconnect/reconnect để áp quyền mới.
- Event đến trước khi HTTP response → client vẫn xử lý idempotent theo version/eventId.
- Manager/Admin cũng là owner → chỉ nhận một event (dedupe theo eventId/socket).
- Nhiều worker phát event trùng → client dedupe eventId; server cố gắng phát một lần.
- Notification payload lớn → giới hạn 4KB, chỉ ID/type.
- Redis adapter cho Socket.IO nếu scale nhiều instance; MVP một instance, thiết kế sẵn.

## Requirements

### Functional Requirements

- **FR-09.1**: Socket.IO namespace mặc định, auth middleware JWT; room theo ADR-012; không room org chung.
- **FR-09.2**: Phát `deal.moved`, `deal.assigned`, `task.due`, `notification.created`, `import.completed`,
  `webhook.failed` theo `docs/events.md`.
- **FR-09.3**: Event phát **sau commit**; lỗi emit không ảnh hưởng nghiệp vụ; at-most-once.
- **FR-09.4**: Notification DB: list/filter/unread, read, read-all; dedupe_key unique; RBAC/tenant.
- **FR-09.5**: Task scheduler tạo notification + event; dedupe theo task/bucket; email do 006 xử lý.
- **FR-09.6**: Client reconnect → invalidate query; hiển thị trạng thái; không replay.
- **FR-09.7**: Payload tối giản, không title/value/email; ≤ 4KB.
- **FR-09.8**: Test RBAC room, E2E 2 browser, event failure isolation.

### Key Entities

- Notification (mục 4.9), Deal/Activity (nguồn event). Event contract: `docs/events.md`.

## Success Criteria

- **SC-001**: p95 từ HTTP 200 đến DOM client khác cập nhật ≤ 1000ms (20 lần, local).
- **SC-002**: 0 event deal lọt tới Sales không sở hữu (test + review).
- **SC-003**: 100% notification có dedupe; scheduler chạy 10 lần không trùng.
- **SC-004**: Reconnect resync đúng trong < 2s.

## Assumptions

- Một instance API ở MVP; nếu scale, thêm Redis adapter cho Socket.IO.
- Client dùng TanStack Query; event chỉ invalidate/patch, không thay cache toàn bộ.
- Notification center là UI đơn giản (dropdown/trang).
- Email nhắc việc thuộc 006; 005 chỉ tạo notification + event.
- User online nhận realtime; user offline thấy notification khi đăng nhập lại.

## Out of Scope

- Push notification mobile/web, email trong feature này.
- Presence/typing indicator, chat.
- Notification preference theo loại (có thể thêm sau).
- Event replay/durable stream.
- Multi-instance Socket.IO adapter (thiết kế sẵn, chưa làm).

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-09 | AC-FR09-01..12 | T400–T419 |
| FR-05 realtime | AC-FR05-03..05 | T406 |
| FR-07 overdue | AC-FR07-08 | T410–T411 |
