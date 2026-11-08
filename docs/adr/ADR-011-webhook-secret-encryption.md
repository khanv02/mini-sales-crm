# ADR-011 — Mã hóa webhook secret thay vì lưu hash

- **Trạng thái**: Proposed (bắt buộc trước khi code FR-11)
- **Ngày**: 2026-11-08
- **Nguồn**: FR-11, mục 6
- **Liên quan**: ADR-004, SCR-003

## Bối cảnh

Schema gốc có `webhook_sources.secret_hash`. HMAC yêu cầu server biết **secret gốc** để tính lại chữ ký.
Hash một chiều không thể dùng để verify. Đây là mâu thuẫn chặn FR-11.

## Quyết định

Lưu secret đã mã hóa đối xứng:

- `secret_ciphertext`: AES-256-GCM, nonce ngẫu nhiên 12 byte, tag; key từ `WEBHOOK_SECRET_ENC_KEY` (32 byte).
- `secret_last4`: 4 ký tự cuối để Admin nhận diện.
- `rotated_at`: thời điểm xoay vòng.
- Secret plaintext chỉ trả **một lần** khi tạo/rotate; không có endpoint đọc lại.
- Khi rotate: tạo secret mới, giữ secret cũ trong grace period 24h (cột `previous_secret_ciphertext`,
  `previous_expires_at`) để không mất event đang gửi.

## Hệ quả

**Tích cực**

- Verify HMAC được; vẫn không lưu plaintext.
- Rotate không downtime nhờ grace period.
- Khóa mã hóa tách khỏi DB; lộ DB không đủ giải mã nếu không có env key.

**Tiêu cực / đánh đổi**

- Cần quản lý/rotate encryption key; mất key → không verify được (phải rotate secret).
- So với hash, bảo mật phụ thuộc key management.
- Cần migration + cột previous.

## Quy tắc

- Không log ciphertext/plaintext/secret.
- Không trả secret trong `GET`.
- `secret_last4` chỉ để hiển thị.
- Key không commit; production dùng secret manager.
- Test: tạo source → ký bằng secret trả về → 202; rotate → secret cũ còn grace, secret mới hoạt động;
  hết grace → secret cũ 401.
- Nếu `WEBHOOK_SECRET_ENC_KEY` thiếu/sai độ dài → app không khởi động.

## Phương án đã loại

- **Lưu plaintext**: lộ DB là lộ toàn bộ webhook.
- **Lưu hash**: không verify được HMAC (mâu thuẫn gốc).
- **Chỉ dùng public key**: không có bí mật, ai biết URL cũng gửi được.
