# Feature Specification: Identity & Access

**Feature Branch**: `002-identity-access`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-01, FR-02; C3, C4, C5, C6; NFR-02; ADR-015

## User Scenarios & Testing

### US-1 — Organization registration (Priority: P1)

A new user creates an account; the system creates the organization and the first Admin user, and returns tokens so
they can work immediately.

**Why P1**: the only entry point of the product; without an org/user there is nothing to demo.

**Independent test**: POST register with a new email; check the DB has the org + admin; use the access token to call
`/auth/me`.

**Acceptance Scenarios**:

1. **AC-FR01-01** Given an unused email, When registering with valid email/password/name/orgName, Then `201`,
   exactly 1 organization + 1 active `ADMIN` user are created, and a 15-minute access token plus a 7-day refresh
   cookie are returned.
2. **AC-FR01-02** Given an email that already exists (in any case), When registering, Then `409 EMAIL_TAKEN` and no
   org is created.
3. **AC-FR01-03** Given a password shorter than 12 characters or a missing field, When registering, Then
   `400 VALIDATION_ERROR` with field errors and no org created.
4. **AC-FR01-04** Given a successful registration, When checking the DB/logs, Then `password_hash` is Argon2id with
   no plaintext, and the response carries no hash.

---

### US-2 — Login, refresh, logout (Priority: P1)

Users sign in, keep the session alive with refresh-token rotation, and are revoked when a token is reused.

**Why P1**: the whole app needs a secure session; the reuse-detection AC is the main security point.

**Independent test**: login; refresh; reuse an old token; check the family is revoked; logout.

**Acceptance Scenarios**:

1. **AC-FR01-05** Given correct email/password, When logging in, Then `200` returns an access token and sets an
   `HttpOnly` refresh cookie; the access token works on a protected endpoint.
2. **AC-FR01-06** Given a wrong password, When logging in, Then `401 INVALID_CREDENTIALS` (generic message that never
   reveals whether the email exists).
3. **AC-FR01-07** Given 5 wrong passwords within 15 minutes for the same email+IP, When logging in a 6th time, Then
   `429 TOO_MANY_ATTEMPTS` + `Retry-After`; even the correct password is blocked until the window ends.
4. **AC-FR01-08** Given a valid refresh token, When refreshing, Then a new access + new refresh token are returned;
   the old token is revoked; reusing the old token → `401 TOKEN_REUSED` and **the whole family** is revoked.
5. **AC-FR01-09** Given an expired or logged-out refresh token, When refreshing, Then
   `401 TOKEN_EXPIRED`/`REFRESH_TOKEN_REVOKED`.
6. **AC-FR01-10** Given a deactivated user, When refreshing, Then `401 USER_INACTIVE`; an existing access token
   expires at most 15 minutes later.
7. **AC-FR01-11** Given a signed-in user, When logging out, Then the cookie is cleared and the current family is
   revoked; refreshing again → 401.

---

### US-3 — Admin manages members (Priority: P2)

An Admin creates users, changes roles and deactivates accounts, but cannot lock itself out or remove the last Admin.

**Why P2**: needed for teams, yet a solo Admin can still demo M1.

**Independent test**: create Manager/Sales; change a role; deactivate; try to refresh; try the last-admin guard.

**Acceptance Scenarios**:

1. **AC-FR02-01** Given Admin, When creating a user with a new email/valid role, Then `201`, the user belongs to
   the right org, the password hash is Argon2id, and audit `USER_CREATED` is written.
2. **AC-FR02-02** Given an existing user, When Admin changes the role `SALES → MANAGER`, Then `200`, the audit row
   has before/after roles, the old access token still works until it expires but the new permission applies
   immediately per DB/guard.
3. **AC-FR02-03** Given an active user, When Admin deactivates it, Then `active=false`, audited; the user's refresh
   token is rejected (`USER_INACTIVE`).
4. **AC-FR02-04** Given only 1 active Admin remains, When demoting or deactivating that Admin, Then
   `409 LAST_ADMIN`; data is unchanged.
5. **AC-FR02-05** Given Admin, When deactivating itself, Then `409 CANNOT_DEACTIVATE_SELF`.
6. **AC-FR02-06** Given Manager/Sales, When calling `GET/POST/PATCH /users`, Then `403 FORBIDDEN`.
7. **AC-FR02-07** Given an Admin of org B, When reading/updating an org A user by ID, Then `404 NOT_FOUND`; the DB
   is unchanged.

### Edge Cases

- Emails with spaces or mixed case → trim + lowercase before comparing.
- Concurrent registration with the same email → unique constraint; one request gets 201, the other 409.
- A refresh token used twice concurrently → one succeeds, the other gets `TOKEN_REUSED`; the family is revoked.
- An inactive user with an open socket → disconnect (feature 005).
- An Admin changes its own role from Admin to Manager while another Admin exists: allowed; if it is the last Admin:
  409.
- Wrong/missing JWT secret → the app does not start.
- Redis down during login → controlled fail-closed 503/429, never skipping the lockout.
- Error responses never reveal whether an email exists (except register/duplicate).

## Requirements

### Functional Requirements

- **FR-01.1**: `POST /auth/register` creates the organization + Admin user in **one transaction**; both are audited.
- **FR-01.2**: Email is unique system-wide and case-insensitive; the password hash is Argon2id (memory 64MB,
  iterations 3, parallelism 1) or bcrypt with cost ≥ 12; the hash is never returned.
- **FR-01.3**: Access JWT TTL 15 minutes; claims `sub`, `orgId`, `role`, `active`, `jti`, `iat`, `exp`.
- **FR-01.4**: Refresh token is opaque, ≥ 32 bytes; stored as HMAC-SHA256(token, pepper); `family_id`; rotated on
  every use; reuse → revoke the family; cookie HttpOnly/Secure/SameSite=Lax.
- **FR-01.5**: Login rate limit: 5 failures/15 minutes per `(email, IP)`; 429 + Retry-After; fail-closed when Redis
  is down.
- **FR-01.6**: Logout revokes the current family and clears the cookie; idempotent when the token is already revoked.
- **FR-01.7**: An inactive user cannot refresh; an access token lives at most 15 minutes.
- **FR-02.1**: Admin lists/creates/updates users inside the org and never creates users in another org; every
  mutation is audited.
- **FR-02.2**: Guards `LAST_ADMIN` and `CANNOT_DEACTIVATE_SELF`.
- **FR-02.3**: Only Admin reaches `/users`; Manager/Sales get 403; another tenant gets 404.
- **FR-02.4**: Role enum `ADMIN/MANAGER/SALES`; a new role applies on the next request (the guard reads DB/short
  cache).
- **FR-02.5**: Password policy: 12–128 characters; the password is never trimmed; all-whitespace passwords are
  rejected.
- **FR-02.6**: Audit redacts `password_hash` and tokens; user audit contains only email/name/role/active.

### Key Entities

- **Organization**: id, name, currency, timezone; created together with the Admin.
- **User**: id, org_id, email, password_hash, name, role, active.
- **RefreshToken**: id, user_id, token_hash, family_id, expires_at, revoked_at, replaced_by_id.
- Details: `docs/data-model.md` sections 4.1–4.3.

## Success Criteria

- **SC-001**: Register + login + refresh + logout each run in < 1s locally.
- **SC-002**: 100% of ACs have an integration test; 100% of endpoints have role/tenant tests.
- **SC-003**: No token/password/hash in logs or responses (redaction test).
- **SC-004**: Reuse detection revokes the family within < 100ms of detection.

## Assumptions

- Each email belongs to one org; multi-org membership is not supported yet.
- No password reset/change, email verification, SSO or 2FA yet (out of scope; Q5).
- Admin creates users with a temporary password; there is no invitation email flow in M1.
- The frontend is an SPA on the same domain/whitelisted CORS, so the refresh cookie works.
- `active` is checked on refresh and inside the guard (a short 30s cache when needed for performance).

## Out of Scope

- Password reset/change, email verification, magic link.
- SSO/OAuth, 2FA, device management.
- Multi-org membership, switching org.
- Admin impersonation.

## Traceability

| Source | AC | Task |
| --- | --- | --- |
| FR-01 | AC-FR01-01..11 | T100–T113, T117–T119 |
| FR-02 | AC-FR02-01..07 | T114–T117, T119 |
| NFR-02 | AC-NFR02-01..04 | T102, T115, T119 |
