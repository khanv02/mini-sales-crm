# ADR-007 — Socket.IO cho realtime, SSE cho AI streaming

- **Trạng thái**: Proposed (cần duyệt trước M1)
- **Ngày**: 2026-11-08
- **Nguồn**: spec Q2
- **Liên quan**: FR-09, FR-16, ADR-012

## Bối cảnh

Cần hai loại luồng khác nhau:

1. Kanban/notification: server đẩy sự kiện hai chiều, cần room, reconnect, auth.
2. AI summary: client gửi prompt, server stream token một chiều; không cần room.

Spec chọn Socket.IO nhưng Q2 mở (Socket.IO hay SSE).

## Quyết định

- **Socket.IO** cho realtime kanban/notification.
- **SSE** cho `POST /ai/deals/:id/summary` (HTTP streaming một chiều).
- Không dùng SSE cho kanban; không dùng WebSocket cho AI summary.

## Hệ quả

**Tích cực**

- Socket.IO có room, reconnect, auth middleware, fallback; phù hợp notification.
- SSE đơn giản cho streaming, đi qua HTTP/proxy dễ hơn, không cần client library.
- Tách rõ hai use case, dễ test.

**Tiêu cực / đánh đổi**

- Hai cơ chế realtime → hai cách xử lý reconnect/lỗi.
- Socket.IO thêm dependency/client bundle.
- SSE qua một số proxy cần tắt buffering (`X-Accel-Buffering: no`).

## Quy tắc

- Socket.IO: JWT handshake; room theo user/role (ADR-012); at-most-once; client refetch khi reconnect.
- SSE: `POST` + `text/event-stream`; event `meta/token/done/error`; abort khi client disconnect.
- Không gửi secret/PII thừa trong cả hai.
- Test E2E: kanban realtime ≤ 1s; AI first token ≤ 3s (mock).

## Phương án đã loại

- **SSE cho tất cả**: không có room hai chiều, khó notification theo user/role.
- **WebSocket thuần cho AI**: overkill, không cần client→server sau khi bắt đầu.
- **Polling**: không đáp ứng < 1s, tốn tài nguyên.
