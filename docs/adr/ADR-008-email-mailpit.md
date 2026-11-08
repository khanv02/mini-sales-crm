# ADR-008 — Email: Mailpit khi dev, adapter provider khi vận hành

- **Trạng thái**: Proposed (cần duyệt trước M2)
- **Ngày**: 2026-11-08
- **Nguồn**: spec Q3, FR-12
- **Liên quan**: C7, NFR-03

## Bối cảnh

FR-12 cần email nhắc việc/follow-up qua queue. Gửi email thật cần domain, SPF/DKIM, provider, chi phí và
xử lý bounce — chưa cần cho đồ án. Spec gợi ý Mailpit khi dev.

## Quyết định

- Dev/test: **Mailpit** (SMTP local, UI xem mail).
- Code dùng interface `Mailer` + template; production có thể cắm Resend/SES sau.
- M2 **không gửi email ra khách hàng thật**; chỉ email nội bộ/user test.
- Queue `emails` với retry/backoff/DLQ; idempotent theo `dedupeKey`.

## Hệ quả

**Tích cực**

- Không cần domain/credentials; test xác định, không gửi nhầm.
- Dễ chuyển provider sau mà không đổi service.
- Mailpit UI giúp debug template.

**Tiêu cực / đánh đổi**

- Chưa kiểm chứng deliverability/SPF/DKIM.
- Provider thật cần thêm config, bounce handling, unsubscribe (nếu email marketing).
- Email nội bộ vẫn có thể vào spam nếu cấu hình sai.

## Quy tắc

- Không log nội dung email đầy đủ; chỉ log template/to/dedupeKey.
- Không gửi email chứa secret/token.
- Email lỗi không làm fail task/deal; retry tối đa 3.
- Production phải có biến `MAIL_PROVIDER`, `MAIL_FROM` hợp lệ; thiếu → không khởi động.
- Test integration dùng Mailpit API để assert subject/recipient, không assert HTML chi tiết.

## Phương án đã loại

- **Gửi thật ngay M2**: cần domain, chi phí, compliance; không cần cho AC.
- **Không gửi email**: FR-12 yêu cầu; Mailpit đủ để chứng minh luồng.
