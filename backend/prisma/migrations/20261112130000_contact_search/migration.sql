-- Contact search (ADR-013 implementation note).
--
-- `unaccent(text)` is STABLE in PostgreSQL 16, so it cannot appear in an index expression. Instead of a
-- generated `search_text` column (which Prisma does not model and would drift on the next `migrate dev`),
-- wrap it in an IMMUTABLE SQL function and index the normalised expression itself.

CREATE FUNCTION "pulse_unaccent"(value text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent', value) $$;

CREATE FUNCTION "pulse_contact_search"(name text, email text, company text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT lower(
      "pulse_unaccent"(
        coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(company, '')
      )
    )
  $$;

-- One index over name + email + company replaces the three per-column trigram indexes from 0002.
CREATE INDEX "contacts_search_trgm_idx"
  ON "contacts" USING gin ("pulse_contact_search"("name", "email", "company") gin_trgm_ops);

DROP INDEX IF EXISTS "contacts_name_trgm_idx";
DROP INDEX IF EXISTS "contacts_email_trgm_idx";
DROP INDEX IF EXISTS "contacts_company_trgm_idx";
