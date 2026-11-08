# ADR-015 — Refresh token qua HttpOnly cookie

- **Trạng thái**: Proposed
- **Ngày**: 2026-11-08
- **Nguồn**: FR-01, Q về lưu token
- **Liên quan**: SCR-009

## Bối cảnh

Spec chọn JWT access 15 phút + refresh 7 ngày, rotate. SPA thường lưu refresh token trong localStorage,
nhưng như vậy mọi XSS đều lấy được token dài hạn. Cần cân bằng bảo mật và đơn giản cho API client/test.

## Quyết định

- Access token trả trong body; frontend giữ trong memory, gửi `Authorization: Bearer`.
- Refresh token đặt trong cookie `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, TTL 7 ngày.
- `POST /auth/refresh` đọc cookie; nếu không có, chấp nhận `refreshToken` trong body cho API client/test.
- `POST /auth/logout` clear cookie + revoke family.
- Không lưu refresh token trong localStorage/sessionStorage.
- CORS bật `credentials: true` với whitelist origin; CSRF được giảm thiểu nhờ SameSite=Lax + chỉ endpoint
  refresh/logout dùng cookie, và kiểm tra `Origin` với whitelist.

## Hệ quả

**Tích cực**

- XSS không đọc được refresh token.
- Rotate/reuse detection vẫn hoạt động.
- API client/test vẫn dùng body khi cần.

**Tiêu cực / đánh đổi**

- Cần cấu hình CORS credentials/cookie đúng.
- Mobile/third-party client cần body flow.
- CSRF vẫn là bề mặt cần test (SameSite + Origin check).

## Quy tắc

- Cookie `Secure` bắt buộc ở production; dev có thể tắt qua env nhưng mặc định bật.
- Không đặt access token trong cookie.
- Refresh token hash lưu DB; cookie chỉ chứa opaque token.
- Test: refresh không cookie/body → 401; cookie sai → 401; rotate; reuse revoke family; logout clear.
- Không trả refresh token trong response body khi dùng cookie (tránh lộ qua log); body flow chỉ khi
  `X-Client-Type: api` hoặc môi trường test.

## Phương án đã loại

- **localStorage**: rủi ro XSS cao.
- **Session cookie cho toàn bộ auth**: spec đã loại session; access JWT vẫn stateless.
