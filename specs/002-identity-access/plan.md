# Implementation Plan: Identity & Access

**Branch**: `002-identity-access` | **Date**: 2026-11-08 | **Spec**: `specs/002-identity-access/spec.md`

## Summary

Triển khai đăng ký org + Admin, đăng nhập/refresh rotate/reuse detection, logout, quản lý user và nền tảng
RBAC/tenant guard. Dùng JWT access ngắn hạn + refresh cookie HttpOnly, Argon2id, rate limit Redis.

## Technical Context

- **Backend**: NestJS module `auth`, `users`; Prisma; `@nestjs/jwt`; `argon2`; `rate-limiter-flexible`.
- **Auth**: access JWT 15m; refresh opaque 7d, HMAC hash, family; cookie HttpOnly.
- **Storage**: `users`, `refresh_tokens`, `organizations`.
- **Testing**: Jest + Supertest; Redis thật cho lockout; fake clock cho expiry.
- **Security**: helmet, CORS whitelist + credentials, validation, timing-safe compare.

## Constitution Check

| Gate | Cách đáp ứng | Trạng thái |
| --- | --- | --- |
| C1 strict | DTO/zod, không `any`; token service typed | Pass |
| C2 phân lớp | AuthController → AuthService → UserRepository/TokenRepository | Pass |
| C3 org_id | UserRepository luôn `orgId`; login lấy org từ user | Pass |
| C4 audit | Register + user mutations audit trong transaction | Pass |
| C5 validate/error | zod DTO, error codes auth/user | Pass |
| C6 secret | JWT/pepper env; cookie Secure; không log token | Pass |
| C7 async | Không có việc nặng; email mời để sau | Pass |
| C8 test | Mỗi endpoint happy/lỗi/role/tenant | Pass |
| C9 PR nhỏ | T100–T119 theo nhóm | Pass |

## Data Model

- `organizations`: id, name, currency, timezone, plan.
- `users`: unique lower(email), password_hash, role, active; index (org, role, active).
- `refresh_tokens`: token_hash unique, family_id, expires, revoked, replaced_by; index user/family.
- Chi tiết `docs/data-model.md` 4.1–4.3.

## API

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/auth/register` | public; org+admin; trả access + cookie |
| POST | `/auth/login` | public; lockout 5/15m |
| POST | `/auth/refresh` | cookie hoặc body; rotate |
| POST | `/auth/logout` | revoke family; clear cookie |
| GET | `/auth/me` | user hiện tại |
| GET/POST | `/users` | Admin |
| PATCH | `/users/:id` | Admin; role/active |

Chi tiết request/response: `docs/api/openapi.yaml`.

## Auth flow

```text
Register:
  validate → hash password → tx:
    insert organization
    insert user ADMIN
    insert audit
  → issue access + refresh family → set cookie

Login:
  rate-limit check (email+IP) → find user by lower(email) → verify argon2
  → issue access + refresh (family mới) → reset fail counter

Refresh:
  read cookie/body → hash lookup → check expiry/revoked/user.active
  → if token already rotated/reused: revoke family → 401 TOKEN_REUSED
  → else revoke old, insert new same family → set cookie

Logout:
  revoke token/family → clear cookie → 204
```

## RBAC/tenant foundation

- `JwtAuthGuard` verify access; load user (cache 30s) để kiểm tra `active`/role mới.
- `RolesGuard` + `@Roles(...)`; `@CurrentUser()` trả `{ userId, orgId, role }`.
- `TenantContext` lấy từ JWT, không từ request body.
- Repository mẫu: `findById(orgId, id)`, `update(orgId, id, data)`; không `findUnique({id})`.
- Test: Admin org B đọc user org A → 404; Sales gọi `/users` → 403.

## Security

- Argon2id: memory 64MB, iterations 3, parallelism 1; password 12–128; không trim.
- JWT secret ≥ 32 byte; access claims tối thiểu; `jti`.
- Refresh token 32+ byte random; HMAC-SHA256 với pepper; so sánh hash DB (không cần timing-safe vì lookup
  theo hash, nhưng dùng constant-time khi so).
- Cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, path `/api/v1/auth`.
- CORS whitelist + credentials; kiểm tra `Origin` cho refresh/logout.
- Rate limit: 5 fail/15m email+IP; register 3/giờ/IP; login thành công reset.
- Không trả email tồn tại ở login; register/duplicate trả 409 (chấp nhận lộ vì cần đăng ký).
- Redaction log: `authorization`, `cookie`, `password`, `token`, `secret`.

## Phase 2 — Implementation order

1. Schema + shared DTO + token service + guards/audit scaffold (T100–T105).
2. Register (T106–T108).
3. Login/refresh/logout + lockout (T109–T111).
4. Users admin + last-admin/self guards (T112–T114).
5. Security/tenant tests + docs (T115–T116).

## Testing matrix

| Case | Test |
| --- | --- |
| Register duplicate/concurrent | unique + 409; một org |
| Login lockout boundary | 5 fail → 6th 429; success resets |
| Refresh rotate/reuse | old invalid; family revoked |
| Expiry | fake clock; 401 |
| Inactive | refresh 401; access until 15m |
| Last admin/self | 409; DB unchanged |
| Tenant | org B → 404 |
| Role | Manager/Sales → 403 |
| Redaction | log/response no hash/token |

## Risks & Mitigations

| Rủi ro | Giảm thiểu |
| --- | --- |
| Refresh token race khi 2 tab refresh | Cho phép grace ngắn (5s) cho token vừa rotate? MVP: một thắng, một reuse; client retry login. Ghi chú. |
| Cookie/CORS sai môi trường | Test E2E same-site; env `COOKIE_SECURE`; tài liệu |
| Argon2 chậm trên CI | Cấu hình test thấp hơn (memory 8MB) nhưng production chuẩn; test riêng config |
| Last-admin race | Transaction + `SELECT ... FOR UPDATE` hoặc updateMany count; test |
| Access token cũ sau đổi role | Guard đọc DB/cache 30s; chấp nhận tối đa 30s trễ, ghi rõ |

## Complexity Tracking

Không có vi phạm. Việc kiểm tra `active` mỗi request là chi phí nhỏ (cache 30s) để đáp ứng AC deactivate.
