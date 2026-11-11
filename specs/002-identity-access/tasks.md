# Tasks: Identity & Access

**Input**: `specs/002-identity-access/`
**Prerequisites**: 001 foundation, plan.md, spec.md
**Tests**: Mandatory (C8). Write the tests before each endpoint group; watch them fail, then implement.

## Phase 1 — Setup & schema

- [x] **T100** Prisma schema/migration: confirm `organizations/users/refresh_tokens` from `0001_init`; add the
      missing constraints/indexes (`unique lower(email)`, index org/role/active); update `docs/data-model.md` when
      it drifts.
- [x] **T101** [P] `packages/shared/src/schemas/auth.ts`: register/login/refresh/logout; password 12–128;
      `users.ts`: create/update role/active.
- [x] **T102** [P] `common/auth`: `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, `TenantContext`;
      guard tests.
- [x] **T103** [P] `common/audit`: `AuditService.record(tx, ...)`, redaction; unit test.
- [x] **T104** `modules/auth/token.service.ts`: sign/verify access; generate/hash refresh; family; rotate;
      unit tests for expiry/reuse.
- [x] **T105** `common/rate-limit/login-rate-limit.service.ts`: Redis 5/15m per email+IP; fail-closed; unit test.

## Phase 2 — US1 Register (P1)

### Tests first

- [x] **T106** `backend/test/integration/auth.spec.ts`: register happy path, duplicate (case), weak password,
      no hash in the response, org+admin transaction, audit.
- [x] **T107** Concurrent register with the same email → 1 org, 1 409.

### Implementation

- [x] **T108** `modules/auth/auth.repository.ts`, `auth.service.ts`, `auth.controller.ts`: register transaction;
      argon2id; issue tokens; set the cookie; audit.
- [x] **T109** `modules/auth/cookie.ts`: HttpOnly/Secure/SameSite/Path; clear; header tests.

## Phase 3 — US2 Login/Refresh/Logout (P1)

### Tests first

- [x] **T110** `auth.spec.ts`: login success/wrong, lockout 5/15m (fake clock/Redis), refresh rotate, only one
      of two concurrent refreshes wins, reuse revokes the family, expired, inactive, logout, `/auth/me`.
- [x] **T111** Access token claims/role tests; refresh cookie vs body; CORS/Origin (when configured).

### Implementation

- [x] **T112** `auth.service`: login, reset the failure counter, refresh rotation + reuse detection, logout; cookie.
- [x] **T113** `auth.controller`: endpoints, status codes; Swagger; error mapping (generic 401).

## Phase 4 — US3 Members (P2)

### Tests first

- [x] **T114** `backend/test/integration/users.spec.ts`: list/create/update role/deactivate, last admin,
      self-deactivate, Sales 403, org B 404, audit.
- [x] **T115** `backend/test/integration/rbac.spec.ts`: tenant matrix, role matrix, deactivated refresh.

### Implementation

- [x] **T116** `modules/users`: repository/service/controller; create user (the admin sets the password); update
      role/active; last-admin/self guards; audit.
- [x] **T117** `backend/test/unit/token.service.spec.ts`, `auth.guard.spec.ts`; coverage.

## Phase 5 — Polish

- [x] **T118** [P] Frontend auth: login/register forms, auth context, token refresh interceptor (single-flight
      refresh shared by parallel 401s), protected routes, logout.
- [x] **T119** [P] Security/docs: redaction test, Swagger, `docs/traceability.md`, ADR-015 status.

## Dependencies

- T100 → T101–T105.
- T106–T109 (register) before login (T110–T113).
- T112 needs T104 and T105.
- T114–T116 after T102/T103.
- T118 after T109/T113.

## MVP checkpoint

After T113: register → login → refresh → logout works; reuse detection passes. After T116: admin manages users.

## Notes

- No password reset or email verification.
- Rate limiting uses real Redis in integration; test the fail-closed path.
- A pre-deactivation access token lives at most 15m; the guard checks `active` with a 30s cache (state it in tests).

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR01-01..11 | T100–T113, T117–T119 |
| AC-FR02-01..07 | T114–T117, T119 |
| AC-NFR02-01..04 | T102, T115, T119 |
