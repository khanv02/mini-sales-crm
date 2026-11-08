# API Conventions — Pulse CRM

**Base URL**: `/api/v1`
**Content type**: `application/json; charset=utf-8` (except CSV and SSE)
**Contract**: `docs/api/openapi.yaml` is the technical source; this document explains the conventions.

## 1. Auth

- Access token: JWT HS256 (or RS256 if the service is split), 15-minute TTL, sent via
  `Authorization: Bearer <token>`.
- Refresh token: opaque 32+ bytes, 7-day TTL, rotated on every refresh. Delivered in the cookie
  `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` (ADR-015); a non-browser API client may send it in the
  body as `{ refreshToken }` for tests.
- `POST /auth/refresh` returns a new access token and sets a new cookie. The old token is revoked.
- Reusing an already rotated token → revoke the whole family and return `401 TOKEN_REUSED`.
- Logout revokes the current family and clears the cookie.
- Tokens are never stored in localStorage. The access token stays in memory (React context).

## 2. Standard request headers

| Header | Required | Description |
| --- | --- | --- |
| `Authorization` | except public | `Bearer <access>` |
| `X-Request-Id` | no | Client may send it; the server keeps a valid value, otherwise generates a UUID |
| `Idempotency-Key` | webhook | Required for `POST /webhooks/leads/:publicKey` |
| `X-Pulse-Signature` | webhook | `t=<unix>,v1=<hex>` |
| `Accept-Language` | no | `vi` by default; error messages are returned in Vietnamese |

Every response carries `X-Request-Id` (echoed or newly generated).

## 3. Successful responses

- `200 OK`: successful GET/PATCH.
- `201 Created`: POST that creates a resource; returns the resource plus `Location` when applicable.
- `202 Accepted`: asynchronous job (import, webhook, AI score).
- `204 No Content`: successful DELETE.

Lists use cursors:

```json
{
  "data": [ ... ],
  "nextCursor": "eyJpZCI6Ii4uLiJ9",
  "hasMore": true
}
```

- `limit` defaults to 50, maximum 100; `cursor` is opaque (base64 JSON `{id, sortValue}`).
- Default sort: `createdAt desc, id desc`; supported values: `sort=createdAt|-createdAt|name|value`.
- `total` is not returned for large lists (avoids expensive counts); the dashboard has its own counts.

## 4. Errors

Every error (including validation, 401, 403, 404, 409, 429 and 5xx) returns the same shape:

```json
{
  "code": "DEAL_VERSION_CONFLICT",
  "message": "The deal was updated by someone else. Please reload.",
  "details": { "currentVersion": 8 },
  "requestId": "5f0c..."
}
```

- `code`: SCREAMING_SNAKE_CASE, stable, used for client branching; catalog in `docs/error-codes.md`.
- `message`: user-facing text, never exposing internal details.
- `details`: optional, safe data only (failing fields, current version).
- `requestId`: always present; used to look up logs/Sentry.
- Never return stack traces, SQL, table names or secrets.

Multiple validation errors:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid data",
  "details": { "fields": { "email": ["Email is not valid"] } },
  "requestId": "..."
}
```

## 5. Authorization and tenant

- Missing/invalid token: `401 UNAUTHENTICATED`.
- Authenticated but insufficient role: `403 FORBIDDEN`.
- A resource that does not exist **or belongs to another org**: `404 NOT_FOUND` (existence is not confirmed).
- A Sales user accessing another user's data inside the same org: `404 NOT_FOUND` when the record is not
  visible (existence is hidden); `403 FORBIDDEN` when the record is visible but the action is not permitted
  (for example editing an activity on one's own deal that somebody else created).
- Every business-data query takes `orgId` from the JWT, never from input.
- Details: `docs/permissions-matrix.md`.

## 6. Validation

- Use zod schemas from `packages/shared` for request/response DTOs; Nest DTOs may wrap zod.
- Normalise before validating: trim strings, lowercase emails, uppercase currency.
- Limits: strings 1–200 (long descriptions 10,000), page size ≤ 100, body ≤ 1MB (webhook ≤ 256KB),
  CSV ≤ 10MB/5,000 rows.
- Dates: `YYYY-MM-DD`; timestamps ISO-8601 with timezone/`Z`. Stored in UTC, displayed in the org timezone.
- IDs: UUID v4; a malformed path param → `400 VALIDATION_ERROR`.

## 7. Rate limit

- Auth login: 5 failed attempts/15 minutes per `(email, IP)`; register: 3 requests/hour per IP; exceeding →
  `429 TOO_MANY_ATTEMPTS`.
- Authenticated API: 300 requests/minute/user (burst 60).
- Webhook: 60 requests/minute/source.
- 429 responses carry `Retry-After` (seconds) plus the headers
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Redis outage: auth/webhook fail closed; ordinary reads fail open + log a warning.

## 8. Idempotency

- Webhook: `Idempotency-Key` unique per org; a repeat call returns `202` with the same `eventId` and creates no
  new contact.
- Import: unique per `(org_id, file_hash)` for 24 hours; the same file returns the previous job.
- Email/reminder: BullMQ `jobId = dedupeKey`; notification unique on `(org,user,type,dedupe_key)`.
- AI: cached by `input_hash`; the same input returns the previous result within the TTL.
- Ordinary resource-creating POSTs do not require idempotency; a client may send `Idempotency-Key` in the future,
  but the MVP covers webhook/import/email only.

## 9. SSE (AI summary)

`POST /ai/deals/:id/summary` returns `text/event-stream`:

```text
event: meta
data: {"runId":"...","model":"..."}

event: token
data: {"text":"Customer"}

event: done
data: {"runId":"...","inputTokens":123,"outputTokens":456,"costUsd":0.0012}

event: error
data: {"code":"AI_PROVIDER_TIMEOUT","message":"..."}
```

- `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Client disconnect → abort the provider request and record `ai_usage` with status `CANCELLED`/`ERROR`.
- Never stream another org's data; never return the raw prompt.

## 10. CSV

- Export: `text/csv; charset=utf-8`, UTF-8 BOM, `Content-Disposition: attachment; filename=...`.
- CSV injection escaping: cells starting with `=`, `+`, `-`, `@`, tab or CR → prefix `'` and wrap in quotes.
- Import: fixed header `name,email,phone,company,source,owner_email`; blank lines are skipped; BOM is handled.
- Error report: same format plus the columns `row,error_code,error_message`.

## 11. Versioning & deprecation

- Prefix `/api/v1`; a breaking change → `/api/v2` + ADR + a parallel period.
- Adding a field is non-breaking; clients must ignore unknown fields.
- New enum values may appear; clients keep a safe default and never crash.
- OpenAPI is published at `/api/docs` (dev/staging only) and in `docs/api/openapi.yaml`.

## 12. Health

- `GET /health/live`: the process is alive; dependencies are not checked.
- `GET /health/ready`: DB + Redis are ready; returns 503 naming the failing component when either is down
  (readiness scope is fixed by `AC-NFR03-01` and the constitution — nothing else is checked).
- No auth required; never returns secrets or connection strings.
