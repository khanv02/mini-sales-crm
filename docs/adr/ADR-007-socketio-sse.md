# ADR-007 — Socket.IO for realtime, SSE for AI streaming

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec Q2
- **Related**: FR-09, FR-16, ADR-012

## Context

Two different stream types are needed:

1. Kanban/notification: the server pushes events in both directions and needs rooms, reconnect and auth.
2. AI summary: the client sends a prompt and the server streams tokens one way; no rooms needed.

The spec chose Socket.IO but left Q2 open (Socket.IO or SSE).

## Decision

- **Socket.IO** for realtime kanban/notifications.
- **SSE** for `POST /ai/deals/:id/summary` (one-way HTTP streaming).
- Do not use SSE for the kanban; do not use WebSockets for AI summaries.

## Consequences

**Positive**

- Socket.IO offers rooms, reconnect, auth middleware and fallbacks; a good fit for notifications.
- SSE is simple for streaming, traverses HTTP/proxies easily and needs no client library.
- The two use cases stay clearly separated and easy to test.

**Negative / trade-offs**

- Two realtime mechanisms → two ways to handle reconnect/errors.
- Socket.IO adds a dependency/client bundle.
- SSE behind some proxies needs buffering disabled (`X-Accel-Buffering: no`).

## Rules

- Socket.IO: JWT handshake; rooms by user/role (ADR-012); at-most-once; clients refetch on reconnect.
- SSE: `POST` + `text/event-stream`; `meta/token/done/error` events; abort when the client disconnects.
- Never send unnecessary secrets/PII through either channel.
- E2E tests: kanban realtime ≤ 1s; AI first token ≤ 3s (mock).

## Rejected alternatives

- **SSE for everything**: no bidirectional rooms, awkward per-user/role notifications.
- **Plain WebSockets for AI**: overkill, no client→server traffic after the start.
- **Polling**: cannot meet < 1s and wastes resources.
