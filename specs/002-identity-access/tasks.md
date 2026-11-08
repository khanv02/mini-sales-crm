# Tasks: Identity & Access

**Input**: `specs/002-identity-access/`
**Prerequisites**: 001 foundation, plan.md, spec.md
**Tests**: Bắt buộc (C8). Viết test trước mỗi nhóm endpoint; thấy fail rồi implement.

## Phase 1 — Setup & schema

- [ ] **T100** Prisma schema/migration: xác nhận `organizations/users/refresh_tokens` từ `0001_init`; bổ sung
      constraint/index còn thiếu (`unique lower(email)`, index org/role/active); cập nhật `docs/data-model.md` nếu lệch.
- [ ] **T101** [P] `packages/shared/src/schemas/auth.ts`: register/login/refresh/logout; password 12–128;
      `users.ts`: create/update role/active.
- [ ] **T102** [P] `common/auth`: `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, `TenantContext`;
      test guard.
- [ ] **T103** [P] `common/audit`: `AuditService.record(tx, ...)`, redaction; unit test.
- [ ] **T104** `modules/auth/token.service.ts`: sign/verify access; generate/hash refresh; family; rotate;
      unit test expiry/reuse.
- [ ] **T105** `common/rate-limit/login-rate-limit.service.ts`: Redis 5/15m email+IP; fail-closed; unit test.

## Phase 2 — US1 Register (P1) 🎯

### Tests first

- [ ] **T106** `apps/api/test/integration/auth.spec.ts`: register happy, duplicate (case), weak password,
      response no hash, org+admin transaction, audit.
- [ ] **T107** Test concurrent register same email → 1 org, 1 409.

### Implementation

- [ ] **T108** `modules/auth/auth.repository.ts`, `auth.service.ts`, `auth.controller.ts`: register
      transaction; argon2id; issue tokens; set cookie; audit.
- [ ] **T109** `modules/auth/cookie.ts`: HttpOnly/Secure/SameSite/Path; clear; test header.

## Phase 3 — US2 Login/Refresh/Logout (P1)

### Tests first

- [ ] **T110** `auth.spec.ts`: login success/wrong, lockout 5/15m (fake clock/Redis), refresh rotate, reuse
      revoke family, expired, inactive, logout, `/auth/me`.
- [ ] **T111** Test access token claims/role; refresh cookie vs body; CORS/Origin (nếu cấu hình).

### Implementation

- [ ] **T112** `auth.service`: login, reset fail counter, refresh rotation + reuse detection, logout; cookie.
- [ ] **T113** `auth.controller`: endpoints, status codes; Swagger; error mapping (401 generic).

## Phase 4 — US3 Members (P2)

### Tests first

- [ ] **T114** `apps/api/test/integration/users.spec.ts`: list/create/update role/deactivate, last admin,
      self-deactivate, Sales 403, org B 404, audit.
- [ ] **T115** `apps/api/test/integration/rbac.spec.ts`: tenant matrix, role matrix, deactivated refresh.

### Implementation

- [ ] **T116** `modules/users`: repository/service/controller; create user (admin sets password); update
      role/active; last-admin/self guards; audit.
- [ ] **T117** `apps/api/test/unit/token.service.spec.ts`, `auth.guard.spec.ts`; coverage.

## Phase 5 — Polish

- [ ] **T118** [P] Frontend auth: login/register forms, auth context, token refresh interceptor, protected
      routes, logout.
- [ ] **T119** [P] Security/docs: redaction test, Swagger, `docs/traceability.md`, ADR-015 status.

## Dependencies

- T100 → T101–T105.
- T106–T109 (register) trước login (T110–T113).
- T112 cần T104, T105.
- T114–T116 sau T102/T103.
- T118 sau T109/T113.

## MVP checkpoint

Sau T113: register → login → refresh → logout chạy; reuse detection pass. Sau T116: admin quản lý user.

## Notes

- Không làm password reset/verify email.
- Rate limit dùng Redis thật trong integration; test fail-closed.
- Access token cũ sau deactivate sống tối đa 15m; guard kiểm tra active cache 30s (ghi rõ test).

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR01-01..11 | T100–T113, T117–T119 |
| AC-FR02-01..07 | T114–T117, T119 |
| AC-NFR02-01..04 | T102, T115, T119 |
