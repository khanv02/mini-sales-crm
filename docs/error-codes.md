# Error Code Catalog

Every error returns `{ code, message, details?, requestId }`. `code` is stable; `message` may change language.
Clients must branch on `code` only and never parse `message`.

## 1. Common

| HTTP | Code | When | What the client should do |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | DTO/zod failure, missing or malformed field | Show field errors |
| 400 | `INVALID_CURSOR` | Cursor malformed/expired | Reload from the start |
| 400 | `INVALID_DATE_RANGE` | `from > to` or more than 366 days | Fix the filter |
| 400 | `INVALID_FILE` | Upload invalid and no more specific code applies (header/size/row count) | Fix the file |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired access token | Refresh or sign in |
| 403 | `FORBIDDEN` | Insufficient role (record visible, action not allowed) | Hide/disable the UI |
| 404 | `NOT_FOUND` | Does not exist, belongs to another org, or is not visible to the caller | Go back to the list |
| 409 | `CONFLICT` | Generic conflict | Reload |
| 413 | `PAYLOAD_TOO_LARGE` | Body/file above the limit (CSV > 10MB, webhook body > 256KB) | Reduce the size |
| 429 | `RATE_LIMITED` | Generic rate limit exceeded | Wait for `Retry-After` |
| 500 | `INTERNAL_ERROR` | Unexpected failure | Contact support with the requestId |
| 503 | `SERVICE_UNAVAILABLE` | DB/Redis/provider not ready | Retry later |

## 2. Auth & user

| HTTP | Code | When |
| --- | --- | --- |
| 409 | `EMAIL_TAKEN` | Email already used system-wide |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password (generic message; never reveals whether the email exists) |
| 429 | `TOO_MANY_ATTEMPTS` | Login: 5 failed attempts/15 minutes per email+IP. Register: 3 requests/hour per IP |
| 401 | `TOKEN_EXPIRED` | Access/refresh token expired |
| 401 | `TOKEN_INVALID` | Bad signature or malformed token |
| 401 | `TOKEN_REUSED` | A rotated refresh token was reused; the whole family is revoked |
| 401 | `USER_INACTIVE` | User is deactivated |
| 401 | `REFRESH_TOKEN_REVOKED` | Token already logged out/revoked |
| 409 | `LAST_ADMIN` | Cannot demote or deactivate the last admin |
| 409 | `CANNOT_DEACTIVATE_SELF` | Admin deactivating itself |
| 409 | `USER_ALREADY_ACTIVE` | Reserved: reactivating an already active user is idempotent and returns `200` in the MVP (`FR-02.1`) |

## 3. Contact

| HTTP | Code | When |
| --- | --- | --- |
| 409 | `CONTACT_EMAIL_EXISTS` | Duplicate email inside the org (not soft-deleted) |
| 404 | `CONTACT_NOT_FOUND` | Missing / another org / soft-deleted |
| 409 | `CONTACT_IN_USE` | Reserved: only if a guard against deleting contacts that still have deals is enabled; the MVP allows soft delete |
| 400 | `CONTACT_REQUIRED_FIELD` | Reserved: only if the "name plus email or phone" rule is enabled |

## 4. Pipeline & stage

| HTTP | Code | When |
| --- | --- | --- |
| 404 | `PIPELINE_NOT_FOUND` | Missing / another org |
| 404 | `STAGE_NOT_FOUND` | Missing / another org / another pipeline |
| 409 | `STAGE_HAS_DEALS` | Deleting a stage that still has deals |
| 409 | `PIPELINE_HAS_DEALS` | Deleting a pipeline that still has deals |
| 409 | `LAST_STAGE` | Deleting the last stage of a pipeline |
| 409 | `WON_STAGE_REQUIRED` | Pipeline missing its won stage |
| 409 | `LOST_STAGE_REQUIRED` | Pipeline missing its lost stage |
| 409 | `STAGE_NAME_DUPLICATED` | Duplicate stage name inside the pipeline |
| 409 | `PIPELINE_NAME_DUPLICATED` | Duplicate pipeline name inside the org |

## 5. Deal & activity

| HTTP | Code | When |
| --- | --- | --- |
| 404 | `DEAL_NOT_FOUND` | Missing / another org / not visible to the caller |
| 409 | `DEAL_VERSION_CONFLICT` | Submitted `version` does not match; returns `details.currentVersion` |
| 400 | `LOST_REASON_REQUIRED` | Moving to a lost stage without a reason |
| 400 | `INVALID_STAGE` | Stage does not belong to the deal's pipeline |
| 400 | `INVALID_OWNER` | Owner outside the org or inactive |
| 400 | `CURRENCY_MISMATCH` | Currency other than the org's currency |
| 400 | `TASK_DUE_REQUIRED` | Task missing `dueAt` |
| 400 | `TASK_ASSIGNEE_REQUIRED` | Task missing an assignee |
| 404 | `ACTIVITY_NOT_FOUND` | Activity missing / another org / not visible |
| 404 | `TASK_NOT_FOUND` | Task missing / not assigned to the caller |
| 409 | `TASK_ALREADY_DONE` | Reserved: marking a task done twice returns `200` idempotently in the MVP with a single audit row (see `specs/004-activities-dashboard/plan.md`) |

## 6. Import

| HTTP | Code | When |
| --- | --- | --- |
| 403 | `IMPORT_FORBIDDEN` | Sales calling import |
| 409 | `IMPORT_ALREADY_RUNNING` | Conditional: only if one concurrent import per org is enforced |
| 409 | `IMPORT_NOT_READY` | Downloading the error report before the job finished |
| 404 | `IMPORT_NOT_FOUND` | Job belongs to another org or does not exist |
| 400 | `IMPORT_INVALID_HEADER` | Missing or unknown columns |
| 400 | `IMPORT_TOO_MANY_ROWS` | More than 5,000 rows (or the configured threshold) |
| 400 | `IMPORT_EMPTY` | The file has no data rows |
| 413 | `PAYLOAD_TOO_LARGE` | File larger than 10MB (upload limit) |

> `PARTIAL` is an `ImportStatus` value on the job (see `docs/data-model.md` section 3), not an HTTP error: a
> finished job with row errors still returns `200` with `status: "PARTIAL"`.

## 7. Webhook

| HTTP | Code | When |
| --- | --- | --- |
| 401 | `WEBHOOK_SIGNATURE_INVALID` | HMAC missing or wrong |
| 401 | `WEBHOOK_TIMESTAMP_INVALID` | Timestamp off by more than 300s / replay |
| 401 | `WEBHOOK_SOURCE_INACTIVE` | Source disabled |
| 404 | `WEBHOOK_SOURCE_NOT_FOUND` | Unknown public key |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Header missing |
| 400 | `WEBHOOK_PAYLOAD_INVALID` | Missing name / invalid email format |
| 409 | `WEBHOOK_EVENT_CONFLICT` | Same key with a different payload (warning; nothing new is created) |
| 500 | `WEBHOOK_ENQUEUE_FAILED` | The job could not be enqueued (the event row is already stored) |

## 8. Report/export

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `REPORT_RANGE_TOO_LARGE` | Range longer than 366 days |
| 403 | `EXPORT_FORBIDDEN` | Sales calling export |
| 400 | `EXPORT_TOO_LARGE` | More than 100,000 rows |
| 503 | `CACHE_UNAVAILABLE` | Should not normally be returned: on cache failure the API bypasses the cache (`FR-15.4`). Reserved for a future case where caching becomes mandatory |

## 9. AI

| HTTP | Code | When |
| --- | --- | --- |
| 429 | `AI_QUOTA_EXCEEDED` | User/org quota exceeded (checked before the provider call) |
| 503 | `AI_PROVIDER_UNAVAILABLE` | Provider failed/unavailable |
| 504 | `AI_PROVIDER_TIMEOUT` | Provider timeout (the summary may already have streamed part of the answer) |
| 400 | `AI_INPUT_TOO_LARGE` | Estimated input tokens above the limit |
| 400 | `AI_UNSUPPORTED_FEATURE` | An AI feature that exists but is disabled by configuration. FR-20/RAG is **not** this case: it has no route and therefore returns `404 NOT_FOUND` (ADR-009) |
| 409 | `AI_RUN_NOT_READY` | Score job not finished yet |
| 404 | `AI_RUN_NOT_FOUND` | Run belongs to another org or does not exist |
| 500 | `AI_OUTPUT_INVALID` | Model returned invalid JSON (score): retried once, then returned |

## 10. Prisma → API mapping

| Prisma | API |
| --- | --- |
| `P2002` unique | Map by constraint: `EMAIL_TAKEN`, `CONTACT_EMAIL_EXISTS`, `STAGE_NAME_DUPLICATED`, … |
| `P2003` FK | `VALIDATION_ERROR` or `INVALID_*` (never expose the constraint name) |
| `P2025` not found | `NOT_FOUND` |
| `P2034` write conflict | Retry once; if it still fails → `409 CONFLICT` |
| Timeout | `503 SERVICE_UNAVAILABLE` |

Never return a raw `P2002`/SQL error to the client.
