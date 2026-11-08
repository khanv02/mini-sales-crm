# ADR-004 — Webhook idempotency + queue

- **Trạng thái**: Accepted
- **Ngày**: 2026-11-08
- **Nguồn**: spec mục 4, FR-11
- **Liên quan**: ADR-011, docs/events.md

## Bối cảnh

Form web bên ngoài có thể gửi lặp, gửi chậm, hoặc retry khi timeout. Ta cần trả lời nhanh, không tạo trùng
lead, và không mất event khi worker lỗi.

## Quyết định

1. Xác thực HMAC + timestamp trên raw body.
2. Insert `webhook_events` với unique `(org_id, idempotency_key)` **trước** khi enqueue.
3. Trả `202` ngay sau khi insert + enqueue; xử lý tạo contact trong queue `webhooks`.
4. Worker retry 3 lần, backoff; thất bại → `DEAD` + thông báo Admin.
5. Sweeper enqueue lại event `RECEIVED` quá 60s (outbox pattern tối giản).
6. Cùng key + cùng payload → trả cùng event; cùng key + payload khác → `409 WEBHOOK_EVENT_CONFLICT`.

## Hệ quả

**Tích cực**

- Chống trùng ở tầng DB, an toàn khi đua.
- Request nhanh, không phụ thuộc việc tạo contact.
- Không mất event khi enqueue lỗi (sweeper).

**Tiêu cực / đánh đổi**

- Cần bảng event + sweeper + DLQ.
- Không đảm bảo exactly-once end-to-end; worker phải idempotent.
- Event `DEAD` cần quy trình xử lý thủ công.

## Kiểm chứng

- Test gửi 2 lần cùng key → 1 contact, 1 event.
- Test HMAC sai/replay → 401.
- Test worker fail 3 lần → `DEAD`, không tạo contact trùng.
- Test enqueue lỗi → event vẫn `RECEIVED`, sweeper xử lý.

## Phương án đã loại

- **Tạo contact ngay trong request**: chậm, dễ timeout, khó retry.
- **Chỉ dựa vào unique email**: không đủ vì payload có thể không có email hoặc email đổi.
