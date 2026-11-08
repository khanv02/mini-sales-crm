# ADR-003 — Audit log trong cùng transaction

- **Trạng thái**: Accepted
- **Ngày**: 2026-11-08
- **Nguồn**: spec mục 4, C4
- **Liên quan**: FR-13, SCR-013

## Bối cảnh

C4 yêu cầu mọi thay đổi dữ liệu nghiệp vụ có audit (ai, làm gì, khi nào, trước/sau). Nếu ghi audit sau
commit bằng job/queue, có thể mất log khi process chết hoặc transaction rollback.

## Quyết định

Ghi audit trong cùng transaction với mutation, qua `AuditService.record(tx, entry)`. Nếu insert audit lỗi,
transaction rollback. Audit append-only; không có API sửa/xóa. Redact secret/PII.

## Hệ quả

**Tích cực**

- Bất biến “không thay đổi nào thiếu log” đúng trong mọi trường hợp.
- Truy vấn before/after nhất quán với dữ liệu.
- Không cần outbox cho audit.

**Tiêu cực / đánh đổi**

- Tăng độ trễ ghi và kích thước transaction.
- `before/after` JSONB có thể lớn; cần giới hạn.
- Audit và nghiệp vụ dùng chung connection/transaction.

## Quy tắc

- Chỉ ghi khi mutation thực sự thay đổi dữ liệu (không ghi no-op).
- `before/after` là diff hoặc snapshot đã redact; tối đa 32KB, cắt bớt kèm cờ.
- Không ghi `password_hash`, token, secret, authorization header.
- Job nền cũng dùng transaction + audit khi ghi dữ liệu nghiệp vụ.
- Test rollback: lỗi sau update → không có audit, dữ liệu cũ.

## Phương án đã loại

- **Audit async qua queue**: có thể mất log, vi phạm C4.
- **Trigger DB**: khó redact/lấy actor/requestId, khó test, khó version schema.
