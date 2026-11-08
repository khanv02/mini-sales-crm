# Checklist — PR Review

## Scope

- [ ] The PR is small and covers one feature/task group; no large refactor mixed in.
- [ ] Title/commits carry `FR-xx`/`Txxx`.
- [ ] Description states which ACs are covered, how they are tested, schema/API impact and rollback.
- [ ] No dead code and no TODO without a reason.

## Architecture

- [ ] Controllers never call Prisma/DB directly.
- [ ] Services hold business rules/transactions/audit; repositories hold queries.
- [ ] No cross-module repository imports.
- [ ] No large dependency added without a reason.
- [ ] TypeScript strict; no `any` without a comment.

## Data

- [ ] New queries filter `org_id`; composite FK present.
- [ ] Migrations are versioned; merged migrations are never edited.
- [ ] New queries have indexes; no N+1.
- [ ] Audit inside the transaction; redaction applied.
- [ ] Idempotency/version where applicable.

## Tests

- [ ] Happy + error + role + tenant tests.
- [ ] Tests were red first (or the PR explains why not).
- [ ] No DB mocks in integration tests.
- [ ] Coverage did not drop below the threshold.
- [ ] E2E updated when there is UI.

## Security

- [ ] Input validated; output leaks no secret/PII.
- [ ] Log redaction; no token/password.
- [ ] Rate limit/cache/queue configured correctly.
- [ ] The security checklist has been run for sensitive features.

## Documentation

- [ ] Spec/plan/tasks/traceability updated.
- [ ] OpenAPI/events/data model match.
- [ ] ADR added for a new decision.
- [ ] README/quickstart updated when commands or env vars changed.

## Before merging

- [ ] CI is green.
- [ ] At least one reviewer (or a self-review note when solo).
- [ ] No conflicts; clean rebase.
- [ ] The demo/seed runs.
