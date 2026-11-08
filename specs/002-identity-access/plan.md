# Implementation Plan: Identity & Access

**Branch**: `002-identity-access` | **Date**: 2026-11-08 | **Spec**: `specs/002-identity-access/spec.md`

## Summary

Implement org + Admin registration, login/refresh rotation with reuse detection, logout, user management and the
RBAC/tenant guard foundation. Short-lived JWT access token + HttpOnly refresh cookie, Argon2id, Redis rate limiting.

## Technical Context

- **Backend**: NestJS modules `auth`, `users`; Prisma; `@nestjs/jwt`; `argon2`; `rate-limiter-flexible`.
- **Auth**: 15m access JWT; 7d opaque refresh, HMAC hash, family; HttpOnly cookie.
- **Storage**: `users`, `refresh_tokens`, `organizations`.
- **Testing**: Jest + Supertest; real Redis for lockout; fake clock for expiry.
- **Security**: helmet, CORS whitelist + credentials, validation, timing-safe comparison.

## Constitution Check

| Gate | How it is met | Status |
| --- | --- | --- |
| C1 strict | DTO/zod, no `any`; typed token service | Pass |
| C2 layering | AuthController → AuthService → UserRepository/TokenRepository | Pass |
| C3 org_id | UserRepository always takes `orgId`; login derives the org from the user | Pass |
| C4 audit | Register + user mutations audited inside the transaction | Pass |
| C5 validate/error | zod DTOs, auth/user error codes | Pass |
| C6 secret | JWT/pepper from env; Secure cookie; tokens never logged | Pass |
| C7 async | No heavy work; invitation email deferred | Pass |
| C8 test | Every endpoint has happy/error/role/tenant tests | Pass |
| C9 small PRs | T100–T119 by group | Pass |

## Data Model

- `organizations`: id, name, currency, timezone, plan.
- `users`: unique lower(email), password_hash, role, active; index (org, role, active).
- `refresh_tokens`: token_hash unique, family_id, expires, revoked, replaced_by; user/family indexes.
- Details in `docs/data-model.md` 4.1–4.3.

## API

| Method | Path | Note |
| --- | --- | --- |
| POST | `/auth/register` | public; org+admin; returns access + cookie |
| POST | `/auth/login` | public; lockout 5/15m |
| POST | `/auth/refresh` | cookie or body; rotate |
| POST | `/auth/logout` | revoke the family; clear the cookie |
| GET | `/auth/me` | current user |
| GET/POST | `/users` | Admin |
| PATCH | `/users/:id` | Admin; role/active |

Request/response details: `docs/api/openapi.yaml`.

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
  → issue access + refresh (new family) → reset the failure counter

Refresh:
  read cookie/body → hash lookup → check expiry/revoked/user.active
  → if the token was already rotated/reused: revoke the family → 401 TOKEN_REUSED
  → else revoke the old one, insert the new one in the same family → set cookie

Logout:
  revoke token/family → clear the cookie → 204
```

## RBAC/tenant foundation

- `JwtAuthGuard` verifies the access token and loads the user (30s cache) to check `active` and the current role.
- `RolesGuard` + `@Roles(...)`; `@CurrentUser()` returns `{ userId, orgId, role }`.
- `TenantContext` comes from the JWT, never from the request body.
- Reference repository shape: `findById(orgId, id)`, `update(orgId, id, data)`; never `findUnique({id})`.
- Tests: an Admin of org B reading an org A user → 404; Sales calling `/users` → 403.

## Security

- Argon2id: memory 64MB, iterations 3, parallelism 1; password 12–128; never trimmed.
- JWT secret ≥ 32 bytes; minimal access claims; `jti`.
- Refresh token 32+ random bytes; HMAC-SHA256 with a pepper; compare the DB hash (a hash lookup does not need
  timing-safe comparison, but use constant-time comparison anyway).
- Cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, path `/api/v1/auth`.
- CORS whitelist + credentials; validate `Origin` for refresh/logout.
- Rate limit: 5 failures/15m per email+IP; register 3/hour/IP; a successful login resets the counter.
- Never reveal email existence at login; register/duplicate returns 409 (accepted because signup needs it).
- Log redaction: `authorization`, `cookie`, `password`, `token`, `secret`.

## Phase 2 — Implementation order

1. Schema + shared DTOs + token service + guards/audit scaffold (T100–T105).
2. Register (T106–T108).
3. Login/refresh/logout + lockout (T109–T111).
4. Users admin + last-admin/self guards (T112–T114).
5. Security/tenant tests + docs (T115–T116).

## Testing matrix

| Case | Test |
| --- | --- |
| Register duplicate/concurrent | unique + 409; one org |
| Login lockout boundary | 5 failures → 6th is 429; success resets |
| Refresh rotate/reuse | old token invalid; family revoked |
| Expiry | fake clock; 401 |
| Inactive | refresh 401; access until 15m |
| Last admin/self | 409; DB unchanged |
| Tenant | org B → 404 |
| Role | Manager/Sales → 403 |
| Redaction | log/response carry no hash/token |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Refresh token race between two tabs | Allow a short grace (5s) for a just-rotated token? MVP: one wins, the other is reuse; the client retries login. Documented. |
| Cookie/CORS misconfigured per environment | E2E same-site test; `COOKIE_SECURE` env; documentation |
| Argon2 slow on CI | Lower test parameters (memory 8MB) while production stays standard; separate config test |
| Last-admin race | Transaction + `SELECT ... FOR UPDATE` or an updateMany count; test |
| Stale access token after a role change | The guard reads DB/cache for 30s; the delay is documented |

## Complexity Tracking

No violations. Checking `active` on every request is a small cost (30s cache) that satisfies the deactivate AC.
