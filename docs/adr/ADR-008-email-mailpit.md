# ADR-008 — Email: Mailpit in dev, provider adapter in production

- **Status**: Proposed (needs sign-off before M2)
- **Date**: 2026-11-08
- **Source**: spec Q3, FR-12
- **Related**: C7, NFR-03

## Context

FR-12 needs reminder/follow-up email through a queue. Sending real email needs a domain, SPF/DKIM, a provider,
cost and bounce handling — none of which the project needs yet. The spec suggests Mailpit in dev.

## Decision

- Dev/test: **Mailpit** (local SMTP with a mail UI).
- Code uses a `Mailer` interface + templates; production can plug in Resend/SES later.
- M2 **never sends email to real customers**; internal/test users only.
- Queue `emails` with retry/backoff/DLQ; idempotent by `dedupeKey`.

## Consequences

**Positive**

- No domain/credentials needed; deterministic tests, no accidental sends.
- Easy to switch provider later without changing the service.
- The Mailpit UI helps debug templates.

**Negative / trade-offs**

- Deliverability/SPF/DKIM remain unverified.
- A real provider adds configuration, bounce handling and unsubscribe (for marketing email).
- Internal email can still land in spam when misconfigured.

## Rules

- Never log the full email body; log template/to/dedupeKey only.
- Never send email containing secrets/tokens.
- A failed email never fails a task/deal; retry at most 3 times.
- Production requires a valid `MAIL_PROVIDER` and `MAIL_FROM`; missing → the app does not start.
- Integration tests use the Mailpit API to assert subject/recipient, not the detailed HTML.

## Rejected alternatives

- **Send for real from M2**: needs a domain, cost and compliance; not required by the AC.
- **No email at all**: FR-12 requires it; Mailpit is enough to prove the flow.
