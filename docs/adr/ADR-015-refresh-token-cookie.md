# ADR-015 — Refresh token in an HttpOnly cookie

- **Status**: Proposed
- **Date**: 2026-11-08
- **Source**: FR-01, the question about token storage
- **Related**: SCR-009

## Context

The spec chose a 15-minute JWT access token plus a 7-day rotating refresh token. SPAs usually keep the refresh
token in localStorage, but then any XSS steals a long-lived token. We need a balance between security and
simplicity for API clients/tests.

## Decision

- The access token is returned in the body; the frontend keeps it in memory and sends `Authorization: Bearer`.
- The refresh token lives in a cookie `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` with a 7-day TTL.
- `POST /auth/refresh` reads the cookie; when it is absent it accepts `refreshToken` in the body for API
  clients/tests.
- `POST /auth/logout` clears the cookie and revokes the family.
- The refresh token is never stored in localStorage/sessionStorage.
- CORS enables `credentials: true` with an origin whitelist; CSRF is mitigated by `SameSite=Lax` (only the
  refresh/logout endpoints use cookies) plus an `Origin` whitelist check.

## Consequences

**Positive**

- XSS cannot read the refresh token.
- Rotation/reuse detection still works.
- API clients/tests can still use the body flow when needed.

**Negative / trade-offs**

- CORS credentials/cookies must be configured correctly.
- Mobile/third-party clients need the body flow.
- CSRF remains a surface to test (SameSite + Origin check).

## Rules

- The `Secure` cookie flag is mandatory in production; dev may disable it through env but it defaults to on.
- Never put the access token in a cookie.
- The refresh token hash is stored in the DB; the cookie only holds the opaque token.
- Tests: refresh without cookie/body → 401; wrong cookie → 401; rotate; reuse revokes the family; logout clears.
- Do not return the refresh token in the response body when the cookie flow is used (avoids leaking it into logs);
  the body flow is only for `X-Client-Type: api` or test environments.

## Rejected alternatives

- **localStorage**: high XSS risk.
- **Session cookies for all auth**: the spec rejected sessions; the access JWT stays stateless.
