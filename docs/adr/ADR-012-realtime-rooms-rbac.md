# ADR-012 — Realtime rooms by role/user, no org-wide broadcast

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: FR-09, section 5
- **Related**: ADR-007, SCR-008

## Context

The spec emits events to `room org_id`. But Sales may only see deals they own. If every Sales user in the org
receives `deal.moved`, they learn another user's deal/stage/value — violating RBAC and the tenant/permission
invariants.

## Decision

Do not use a shared `org:{orgId}` room for business data. Use:

| Room | Who | Events |
| --- | --- | --- |
| `user:{userId}` | the user | own deals, tasks, notifications |
| `org:{orgId}:managers` | Manager/Admin | every deal/import/webhook event in the org |
| `org:{orgId}:system` | everyone | notices carrying no business data |

When a deal changes owner: emit to the previous owner, the new owner and managers. Never to the whole org.

## Consequences

**Positive**

- RBAC-compliant; Sales never see another user's deal.
- Minimal payloads; less leakage.
- Managers still get realtime for the whole team.

**Negative / trade-offs**

- Room-selection logic is more complex than broadcasting.
- A role change requires re-joining/leaving rooms (reconnect or a server-side update).
- More sockets/rooms; needs careful tests.

## Rules

- The server joins rooms from the JWT; clients never send a room.
- Manager/Admin join `org:{orgId}:managers`; Sales do not.
- On a role change: disconnect the socket or emit `role.changed` so the client reconnects.
- `deal.assigned` must reach both the previous owner (when still active) and the new owner.
- Tests: Sales B never receives Sales A's deal events; Manager does; the previous owner receives the assignment.
- Never put title/value/email in the payload; clients with permission refetch.

## Rejected alternatives

- **Broadcast to the org**: violates permissions.
- **Only user rooms**: managers lose team realtime.
- **Filter on the client**: the data already reached the client, so it is unsafe.
