# ADR-006 — Use Prisma as the ORM

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec Q1
- **Related**: NFR-05, NFR-07

## Context

The spec chose PostgreSQL + Prisma but left Q1 open (Prisma or Drizzle). We need a type-safe ORM with clear
migrations that is easy to use with NestJS and AI-written code, while still allowing raw SQL for reports/perf.

## Decision

Choose **Prisma**. Use `prisma migrate` for versioned migrations, `prisma db seed`, and Prisma Client inside
repositories. Complex queries (dashboard, search) use parameterised `$queryRaw`, still inside the repository.

## Consequences

**Positive**

- Good type safety; the generated client matches the schema.
- Clear migration/versioning; rollback through migration SQL.
- Large ecosystem and documentation; easy to explain/hire for.
- Interactive transactions support the audit design.

**Negative / trade-offs**

- Less flexible than Drizzle for raw SQL; the generated client is heavy.
- Some PostgreSQL features (partial index, trigram, composite FK) require hand-written migration SQL.
- `$queryRaw` still needs a tenant review.

## Mitigations

- Partial index/trigram/composite FK: write them in migration SQL and keep `schema.prisma` in sync with
  `@@index`/`@@unique` where possible; test migrations from an empty DB.
- Complex queries: raw SQL + EXPLAIN tests; do not overuse the ORM.
- Pin the Prisma version in the lockfile; a breaking upgrade requires an ADR.

## Rejected alternatives

- **Drizzle**: light and SQL-first, but its ecosystem/documentation and migration workflow are less familiar and
  it brings no clear benefit at this scale.
- **TypeORM**: drifts from the schema easily and is less type-safe.
- **Raw SQL**: great control but time-consuming and easy to map incorrectly.

## Verification

- `pnpm db:migrate` from an empty DB produces the right schema.
- `prisma migrate diff` shows no drift in CI.
- Dashboard/search queries have perf tests and EXPLAIN.
