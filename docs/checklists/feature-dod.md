# Checklist — Feature Definition of Done

Use for every feature/PR before merging. If it is not fully ticked, it is not done.

## Spec & traceability

- [ ] The feature has `spec.md`, `plan.md`, `tasks.md` with a clear status.
- [ ] Every AC has an ID and a matching test; `docs/traceability.md` is updated.
- [ ] No "NEEDS CLARIFICATION"/TBD left in the spec.
- [ ] Behaviour changes are reflected in the source spec or in an SCR/ADR.

## Behaviour & tests

- [ ] Every endpoint has happy path + validation failure + lower role + different tenant.
- [ ] Tests were written first and seen failing (note it in the PR when not possible).
- [ ] Tenant-isolation test: org B calling an org A ID → 404, no DB change.
- [ ] Optimistic-lock/idempotency/retry tests when the feature has them.
- [ ] Audit test: correct actor/entity/action/before-after; a rollback leaves no audit row.
- [ ] E2E for the main flow (when there is UI).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` are green; service coverage ≥ 70%.

## Data & migration

- [ ] Schema changes ship with a migration; it runs from an empty DB.
- [ ] New tables have `org_id` + composite FK.
- [ ] New queries have indexes; EXPLAIN shows no unexpected seq scan.
- [ ] The seed is idempotent and never touches production.
- [ ] A rollback/backup path exists if the migration is risky.

## Security

- [ ] Input is validated with zod/DTO; output leaks no sensitive field.
- [ ] No password/token/secret/unnecessary PII in logs.
- [ ] RBAC matches `docs/permissions-matrix.md`.
- [ ] Rate limits on public/heavy endpoints (when applicable).
- [ ] Secrets come from env; `.env.example` updated; nothing committed.
- [ ] `docs/checklists/security-review.md` has been run.

## Operations

- [ ] JSON logs carry requestId/org/user; 5xx errors reach Sentry.
- [ ] Health/ready is unaffected; graceful shutdown works.
- [ ] Jobs have retry/backoff/DLQ and are idempotent.
- [ ] Cache invalidation is correct (when applicable).
- [ ] Heavy work never blocks a request.

## Documentation & demo

- [ ] API/event/data model match `docs/`.
- [ ] `docs/quickstart.md` updated when commands or env vars change; the root `README.md` updated when the
      product scope or features change (client-facing only: no ADR/SCR/task IDs, no SDD index, no internals).
- [ ] New ADR (for architectural decisions) + index entry.
- [ ] The feature can be demoed from seed data in ≤ 5 minutes.
- [ ] The PR is small and describes FR/AC, impact and rollback.

## Sign-off

- [ ] Author: self-reviewed the diff.
- [ ] Reviewer: checked C1–C9 + tenant/audit.
- [ ] Date/PR link: ...
