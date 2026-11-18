# ADR-013 — Contact search with `pg_trgm` + `unaccent`

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: FR-03, section 6
- **Related**: NFR-01

## Context

FR-03 requires searching by name/email/company with p95 < 300ms over 10,000 contacts. PostgreSQL default full-text
search (`to_tsvector`) does not handle Vietnamese well — especially partial-word search, with or without diacritics,
and company names.

## Decision

Use trigram:

- Extensions `pg_trgm` + `unaccent`.
- GIN indexes on `lower(name)`, `lower(coalesce(email,''))`, `lower(coalesce(company,''))`.
- Query `ILIKE '%' || unaccent(lower($term)) || '%'` (or the `%` operator) over the normalised columns.
- Combine owner/org filters with cursor pagination.
- Limit the term to 2–100 characters; strip special wildcard characters when needed.

## Consequences

**Positive**

- Substring search and Vietnamese with/without diacritics work better than default full-text.
- Trigram indexes are effective from 10k to 100k rows.
- Simple and easy to explain.

**Negative / trade-offs**

- Larger than a B-tree index; slightly slower writes.
- No relevance ranking like full-text.
- Is `unaccent` immutable? The index expression must be right; a normalised column may be required when the
  function is not immutable.

## Mitigations

- If `unaccent` cannot be used inside an index, store a generated `search_text` column (lower, unaccent) and put the
  trigram index on it. The final decision is made while implementing the migration, with an EXPLAIN test.
- Measure p95 with the 10k seed; if it fails, consider a materialised column or restricting the searched fields.

## Rejected alternatives

- **`tsvector` full-text**: poor for Vietnamese and substring search.
- **Unindexed `LIKE`**: full scan, cannot meet p95.
- **Elasticsearch/Meilisearch**: extra infrastructure, unnecessary.

## Implementation note (2026-11-12)

`unaccent(text)` is STABLE in PostgreSQL 16.15 (verified through `pg_proc.provolatile`), so it cannot back an
index expression. A generated `search_text` column would work, but Prisma does not model generated columns and
the next `migrate dev` would try to drop it. The `contact_search` migration therefore:

- wraps `public.unaccent` in the IMMUTABLE `pulse_unaccent(text)` helper;
- adds `pulse_contact_search(name, email, company)` = `lower(pulse_unaccent(name || ' ' || email || ' ' || company))`;
- indexes that expression with `gin_trgm_ops` and drops the three per-column trigram indexes from `0002`.

The repository filters on the same expression, so the planner can use the index. `EXPLAIN (ANALYZE, BUFFERS)`
shows a bitmap index scan for selective terms (1,000 of 10,000 rows: ~11ms including the sort).
