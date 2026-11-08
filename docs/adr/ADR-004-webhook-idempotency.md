# ADR-004 — Webhook idempotency + queue

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec section 4, FR-11
- **Related**: ADR-011, docs/events.md

## Context

External web forms may send duplicates, arrive late, or retry on timeout. We must answer quickly, create no
duplicate leads, and lose no event when a worker fails.

## Decision

1. Verify HMAC + timestamp over the raw body.
2. Insert `webhook_events` with unique `(org_id, idempotency_key)` **before** enqueueing.
3. Return `202` right after insert + enqueue; the contact is created in the `webhooks` queue.
4. The worker retries 3 times with backoff; on failure → `DEAD` + Admin notification.
5. A sweeper re-enqueues `RECEIVED` events older than 60s (minimal outbox pattern).
6. Same key + same payload → the same event is returned; same key + different payload →
   `409 WEBHOOK_EVENT_CONFLICT`.

## Consequences

**Positive**

- Duplicate protection in the database, safe under races.
- Fast responses, independent of contact creation.
- No event loss when enqueueing fails (sweeper).

**Negative / trade-offs**

- Needs an event table + sweeper + DLQ.
- No end-to-end exactly-once guarantee; workers must be idempotent.
- `DEAD` events need a manual handling process.

## Verification

- Send the same key twice → 1 contact, 1 event.
- Wrong HMAC/replay → 401.
- Worker fails 3 times → `DEAD`, no duplicate contact.
- Enqueue fails → the event stays `RECEIVED` and the sweeper handles it.

## Rejected alternatives

- **Create the contact inside the request**: slow, prone to timeouts, hard to retry.
- **Rely on a unique email only**: insufficient because payloads may have no email or change it.
