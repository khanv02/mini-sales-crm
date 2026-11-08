# Checklist — Security Review

Chạy trước mỗi release/M2 và cho feature có auth, webhook, file upload, AI.

## Auth & session

- [ ] Access token ngắn (15m), refresh rotate, reuse revoke family.
- [ ] Refresh cookie HttpOnly/Secure/SameSite; không localStorage.
- [ ] Logout revoke; user inactive bị chặn refresh.
- [ ] Rate limit login 5/15m; không lộ email tồn tại.
- [ ] Argon2id/bcrypt cost đủ; không log hash.
- [ ] JWT secret đủ mạnh; không default; rotation có kế hoạch.

## Tenant & RBAC

- [ ] Mọi bảng nghiệp vụ có `org_id`; composite FK.
- [ ] Mọi query có org; không `findUnique({id})` cho dữ liệu nghiệp vụ.
- [ ] Test org B → 404 cho mọi endpoint.
- [ ] Sales không đọc/sửa dữ liệu người khác; realtime room đúng.
- [ ] Admin org B không quản lý org A.
- [ ] Không tin `orgId/userId/role` từ client.

## Input/output

- [ ] Validate zod/DTO; giới hạn độ dài/body/file.
- [ ] Error shape thống nhất; không stack/SQL/secret.
- [ ] XSS: render text/escape; không `dangerouslySetInnerHTML` với dữ liệu người dùng.
- [ ] SQL injection: Prisma/parameterized; raw SQL có org.
- [ ] CSV injection: escape `= + - @ \t \r`.
- [ ] SSRF: không fetch URL người dùng nhập; AI provider URL cấu hình.
- [ ] Path traversal: storage key do server sinh.

## Webhook

- [ ] HMAC trên raw body + timestamp; timing-safe; replay window 300s.
- [ ] Secret mã hóa AES-GCM; không log/response; rotate grace.
- [ ] Idempotency key unique; body limit; source inactive 401.
- [ ] Retry có giới hạn; DLQ; không tạo trùng.

## File upload/import

- [ ] Giới hạn size/row/type; stream; không giải nén tự động.
- [ ] Lưu file ngoài webroot; signed URL ngắn hạn.
- [ ] Không log nội dung file; xóa file tạm.
- [ ] Kiểm tra org/role trước khi đọc job.

## Cache/rate limit

- [ ] Cache key có org + role/user; không rò dữ liệu.
- [ ] Invalidation sau commit; Redis lỗi bypass an toàn.
- [ ] Rate limit fail-closed cho auth/webhook; headers đúng.

## AI

- [ ] Chỉ dữ liệu org hiện tại; mask email/phone.
- [ ] Prompt injection: delimiter/system prompt; không tool call.
- [ ] Không log prompt/response đầy đủ; không log API key.
- [ ] Quota trước provider; usage ghi đủ; cache không cross-org.
- [ ] Output validate (score 0–100/JSON); render an toàn.

## Hạ tầng & phụ thuộc

- [ ] Helmet, CORS whitelist, body limit.
- [ ] Secret scan CI; dependency audit (`pnpm audit`) không có lỗi critical chưa xử lý.
- [ ] Sentry không gửi PII/secret; `sendDefaultPii=false`.
- [ ] Log redaction đã test.
- [ ] Backup/restore đã thử; migration rollback.

## Kết luận

- [ ] Không còn lỗi Critical/High mở.
- [ ] Medium có owner + ngày xử lý.
- [ ] Ghi chú rủi ro còn lại vào PR/release.
