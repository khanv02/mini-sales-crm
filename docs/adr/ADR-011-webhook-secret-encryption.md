# ADR-011 — Encrypt the webhook secret instead of storing a hash

- **Status**: Proposed (required before coding FR-11)
- **Date**: 2026-11-08
- **Source**: FR-11, section 6
- **Related**: ADR-004, SCR-003

## Context

The original schema has `webhook_sources.secret_hash`. HMAC requires the server to know the **original secret** in
order to recompute the signature; a one-way hash cannot be used for verification. This contradiction blocks FR-11.

## Decision

Store the secret with symmetric encryption:

- `secret_ciphertext`: AES-256-GCM, random 12-byte nonce, tag; key from `WEBHOOK_SECRET_ENC_KEY` (32 bytes).
- `secret_last4`: the last 4 characters so Admin can recognise it.
- `rotated_at`: when it was last rotated.
- The plaintext secret is returned **once** on create/rotate; there is no read-back endpoint.
- On rotate: create a new secret and keep the old one for a 24h grace period (`previous_secret_ciphertext`,
  `previous_expires_at`) so in-flight events are not lost.

## Consequences

**Positive**

- HMAC verification works while plaintext is never stored.
- Rotation without downtime thanks to the grace period.
- The encryption key lives outside the DB; a DB leak alone cannot decrypt anything.

**Negative / trade-offs**

- The encryption key must be managed/rotated; losing it makes verification impossible (the secret must be
  rotated).
- Compared to hashing, security depends on key management.
- Needs a migration plus the previous-secret columns.

## Rules

- Never log ciphertext/plaintext/secrets.
- Never return the secret in a `GET` response.
- `secret_last4` is for display only.
- The key is never committed; production uses a secret manager.
- Tests: create a source → sign with the returned secret → 202; rotate → the old secret still works during grace
  while the new one works; after grace → the old secret returns 401.
- If `WEBHOOK_SECRET_ENC_KEY` is missing or has the wrong length → the app does not start.

## Rejected alternatives

- **Store plaintext**: a DB leak exposes every webhook.
- **Store a hash**: HMAC cannot be verified (the original contradiction).
- **Use only the public key**: there is no secret, so anyone who knows the URL could post.
