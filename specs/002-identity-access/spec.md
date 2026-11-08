# Feature Specification: Identity & Access

**Feature Branch**: `002-identity-access`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-01, FR-02; C3, C4, C5, C6; NFR-02; ADR-015

## User Scenarios & Testing

### US-1 — Đăng ký tổ chức (Priority: P1)

Một người dùng mới tạo tài khoản; hệ thống tạo organization và user Admin đầu tiên, trả token để dùng ngay.

**Vì sao P1**: Cửa vào duy nhất của sản phẩm; không có org/user thì không có gì để demo.

**Kiểm thử độc lập**: POST register với email mới; kiểm tra DB có org + admin; dùng access token gọi `/auth/me`.

**Acceptance Scenarios**:

1. **AC-FR01-01** Given email chưa tồn tại, When đăng ký với email/password/name/orgName hợp lệ, Then
   `201`, tạo đúng 1 organization + 1 user `ADMIN` active, trả access token 15 phút và refresh cookie 7 ngày.
2. **AC-FR01-02** Given email đã tồn tại (khác hoa/thường), When đăng ký, Then `409 EMAIL_TAKEN`, không tạo org.
3. **AC-FR01-03** Given password < 12 ký tự hoặc thiếu field, When đăng ký, Then `400 VALIDATION_ERROR`
   với lỗi field; không tạo org.
4. **AC-FR01-04** Given đăng ký thành công, When kiểm tra DB/log, Then `password_hash` là Argon2id, không có
   plaintext; response không chứa hash.

---

### US-2 — Đăng nhập, refresh, đăng xuất (Priority: P1)

Người dùng đăng nhập, duy trì phiên bằng refresh token rotate, và bị thu hồi khi token bị dùng lại.

**Vì sao P1**: Toàn bộ app cần phiên an toàn; AC reuse detection là điểm bảo mật chính.

**Kiểm thử độc lập**: Login; refresh; dùng lại token cũ; kiểm tra family bị revoke; logout.

**Acceptance Scenarios**:

1. **AC-FR01-05** Given đúng email/password, When login, Then `200` trả access token + set refresh cookie
   `HttpOnly`; access token gọi được endpoint bảo vệ.
2. **AC-FR01-06** Given sai mật khẩu, When login, Then `401 INVALID_CREDENTIALS` (message chung, không lộ
   email có tồn tại hay không).
3. **AC-FR01-07** Given sai mật khẩu 5 lần trong 15 phút cho cùng email+IP, When login lần 6, Then
   `429 TOO_MANY_ATTEMPTS` + `Retry-After`; đúng mật khẩu cũng bị chặn đến hết cửa sổ.
4. **AC-FR01-08** Given refresh token hợp lệ, When refresh, Then trả access mới + refresh mới; token cũ bị
   revoke; dùng token cũ lần nữa → `401 TOKEN_REUSED` và **toàn bộ family** bị revoke.
5. **AC-FR01-09** Given refresh token hết hạn hoặc đã logout, When refresh, Then `401 TOKEN_EXPIRED`/
   `REFRESH_TOKEN_REVOKED`.
6. **AC-FR01-10** Given user bị vô hiệu hóa, When refresh, Then `401 USER_INACTIVE`; access token cũ hết hạn
   tối đa sau 15 phút.
7. **AC-FR01-11** Given đang đăng nhập, When logout, Then cookie bị clear, family hiện tại bị revoke; refresh
   lại → 401.

---

### US-3 — Admin quản lý thành viên (Priority: P2)

Admin tạo user, đổi role, vô hiệu hóa; không thể tự khóa mình hoặc bỏ Admin cuối.

**Vì sao P2**: Cần cho đội nhóm, nhưng một Admin dùng solo vẫn demo được M1.

**Kiểm thử độc lập**: Tạo Manager/Sales; đổi role; deactivate; thử refresh; thử last-admin guard.

**Acceptance Scenarios**:

1. **AC-FR02-01** Given Admin, When tạo user với email mới/role hợp lệ, Then `201`, user thuộc đúng org,
   password hash Argon2id, audit `USER_CREATED`.
2. **AC-FR02-02** Given user tồn tại, When Admin đổi role `SALES → MANAGER`, Then `200`, audit có
   before/after role, access token cũ vẫn dùng đến hết hạn nhưng quyền mới áp dụng ngay theo DB/guard.
3. **AC-FR02-03** Given user active, When Admin deactivate, Then `active=false`, audit; refresh token của user
   bị từ chối (`USER_INACTIVE`).
4. **AC-FR02-04** Given chỉ còn 1 Admin active, When hạ quyền hoặc deactivate Admin đó, Then
   `409 LAST_ADMIN`; dữ liệu không đổi.
5. **AC-FR02-05** Given Admin, When tự deactivate mình, Then `409 CANNOT_DEACTIVATE_SELF`.
6. **AC-FR02-06** Given Manager/Sales, When gọi `GET/POST/PATCH /users`, Then `403 FORBIDDEN`.
7. **AC-FR02-07** Given Admin org B, When đọc/sửa user org A bằng ID, Then `404 NOT_FOUND`; không thay đổi DB.

### Edge Cases

- Email có khoảng trắng/hoa/thường → trim + lowercase trước khi so trùng.
- Đăng ký đồng thời cùng email → unique constraint; một request 201, một 409.
- Refresh token bị dùng đồng thời 2 lần → một thành công, một `TOKEN_REUSED`; family revoke.
- User inactive đang có socket → disconnect (feature 005).
- Admin đổi role chính mình từ Admin → Manager khi còn Admin khác: cho phép; nếu là Admin cuối: 409.
- JWT secret sai/thiếu → app không khởi động.
- Redis chết khi login → fail-closed 503/429 có kiểm soát, không bỏ qua lockout.
- Response lỗi không được chứa email có tồn tại (trừ register/dup).

## Requirements

### Functional Requirements

- **FR-01.1**: `POST /auth/register` tạo organization + user Admin trong **một transaction**; audit cả hai.
- **FR-01.2**: Email unique toàn hệ thống, case-insensitive; password hash Argon2id (memory 64MB,
  iterations 3, parallelism 1) hoặc bcrypt cost ≥ 12; không trả hash.
- **FR-01.3**: Access JWT TTL 15 phút; claims `sub`, `orgId`, `role`, `active`, `jti`, `iat`, `exp`.
- **FR-01.4**: Refresh token opaque ≥ 32 byte; lưu HMAC-SHA256(token, pepper); family_id; rotate mỗi lần;
  reuse → revoke family; cookie HttpOnly/Secure/SameSite=Lax.
- **FR-01.5**: Login rate limit 5 lần sai/15 phút theo `(email, IP)`; 429 + Retry-After; fail-closed khi
  Redis lỗi.
- **FR-01.6**: Logout revoke family hiện tại; clear cookie; idempotent nếu token đã revoke.
- **FR-01.7**: User inactive không refresh được; access token sống tối đa 15 phút.
- **FR-02.1**: Admin list/create/update user trong org; không tạo user org khác; mọi mutation audit.
- **FR-02.2**: Guard `LAST_ADMIN` và `CANNOT_DEACTIVATE_SELF`.
- **FR-02.3**: Chỉ Admin truy cập `/users`; Manager/Sales 403; tenant khác 404.
- **FR-02.4**: Role enum `ADMIN/MANAGER/SALES`; role mới áp dụng ngay ở request kế tiếp (guard đọc DB/cache
  ngắn hạn).
- **FR-02.5**: Password policy: 12–128 ký tự; không trim password; từ chối password toàn khoảng trắng.
- **FR-02.6**: Audit redact `password_hash`, token; user audit chỉ gồm email/name/role/active.

### Key Entities

- **Organization**: id, name, currency, timezone; tạo cùng Admin.
- **User**: id, org_id, email, password_hash, name, role, active.
- **RefreshToken**: id, user_id, token_hash, family_id, expires_at, revoked_at, replaced_by_id.
- Chi tiết: `docs/data-model.md` mục 4.1–4.3.

## Success Criteria

- **SC-001**: Đăng ký + đăng nhập + refresh + logout chạy < 1s mỗi bước ở local.
- **SC-002**: 100% AC có integration test; 100% endpoint có test role/tenant.
- **SC-003**: Không có token/password/hash trong log/response (test redaction).
- **SC-004**: Reuse detection thu hồi family trong < 100ms sau phát hiện.

## Assumptions

- Mỗi email thuộc một org; chưa hỗ trợ membership đa org.
- Chưa có quên/đổi mật khẩu, verify email, SSO, 2FA (out of scope; Q5).
- Admin tạo user bằng mật khẩu tạm; chưa có luồng gửi email mời ở M1.
- Frontend là SPA cùng domain/whitelist CORS; refresh cookie dùng được.
- `active` được kiểm tra khi refresh và trong guard (cache ngắn 30s nếu cần perf).

## Out of Scope

- Password reset/change, email verification, magic link.
- SSO/OAuth, 2FA, device management.
- Multi-org membership, chuyển org.
- Admin impersonation.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-01 | AC-FR01-01..11 | T100–T113, T117–T119 |
| FR-02 | AC-FR02-01..07 | T114–T117, T119 |
| NFR-02 | AC-NFR02-01..04 | T102, T115, T119 |
