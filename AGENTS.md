# AGENTS.md — Working rules for AI agents in this repository

> **READ THIS FILE FIRST.** Before planning, editing, generating or running anything here, read `AGENTS.md`
> completely, then read `.specify/memory/constitution.md`. If this file and the constitution disagree, the
> constitution wins. If either disagrees with a feature `spec.md`, stop and align the documents before writing
> code.

## 1. Project

Pulse CRM — a small, multi-tenant CRM built spec-first: contacts, pipeline/deals, activities, tasks and
dashboard, realtime notifications, import/webhook/email, governance layers, and AI assist.

**Current state**: specification only. No application code exists yet, so do not invent files, code paths,
endpoints, tables, events or dependencies that the SDD does not describe.

Where to look:

| Need | Read |
| --- | --- |
| Human-facing introduction (Vietnamese) | `README.md` |
| Project law (C1–C9, quality gates) | `.specify/memory/constitution.md` |
| SDD index, feature map, ID conventions | `specs/README.md` |
| Feature requirements + acceptance criteria | `specs/00X-*/spec.md` |
| Architecture/technical decisions per feature | `specs/00X-*/plan.md` |
| Test-first task list per feature | `specs/00X-*/tasks.md` |
| FR/NFR → AC → feature → task → test | `docs/traceability.md` |
| NFR acceptance criteria | `docs/nfr.md` |
| Schema, constraints, indexes | `docs/data-model.md` |
| REST conventions, errors, pagination, auth | `docs/api-conventions.md`, `docs/error-codes.md` |
| RBAC per endpoint | `docs/permissions-matrix.md` |
| Realtime and queue contracts | `docs/events.md` |
| Test strategy | `docs/testing-strategy.md` |
| Local setup | `docs/quickstart.md` |
| Decisions, spec critique, change requests | `docs/adr/`, `docs/spec-review.md` |

## 2. Language policy

- Every repository artifact — documentation, specs, plans, tasks, ADRs, checklists, config files and code
  comments — is written in **English**. Identifiers, code, API paths, error codes and database objects are
  English as well.
- Do not add new Vietnamese documentation. When you touch a file that still holds Vietnamese legacy text,
  convert that file to English while applying your change, and keep all IDs untouched.
- The language rule covers **repository artifacts**. User-facing copy (UI strings, error messages, email
  templates) is product content, not documentation: it stays Vietnamese by default and is selected through
  `Accept-Language` (see `docs/api-conventions.md` section 2).
- No emoji or decorative icons in repository artifacts (or in status reports). Mark state with plain markdown:
  tables using `Yes`/`No`/`Own`/`n/a`/`public`, task checkboxes (`- [x]`), bold text and code spans.
- Exception: the root `README.md` is the human-facing introduction and is maintained in **Vietnamese**. Every
  other repository artifact stays English.
- Reply to the user in the language they used, but keep every repository artifact in English.

## 3. Binding rules (condensed; the constitution is authoritative)

1. **Spec is the only source of truth.** Every behaviour change starts from a requirement ID (`FR-xx`,
   `NFR-xx`) with verifiable acceptance criteria (`AC-FRxx-yy`). No "convenience" code outside the spec.
2. **Tenant isolation.** Every business table carries `org_id`; every read/write filters `org_id` taken from
   the authenticated principal (JWT), never from the client. Cross-tenant access returns `404 NOT_FOUND`.
   Sales sees only owned or assigned records; Manager/Admin see the whole org.
3. **Audit inside the transaction.** Every business mutation writes an `audit_logs` row in the same
   transaction: append-only, actor/action/entity/before-after, no secrets or raw PII, rolled back together
   with the business change.
4. **Test-first per AC.** Each endpoint needs happy path, validation failure, lower role and cross-tenant
   tests; business rules need unit tests; service-layer coverage ≥ 70%; main flows need E2E.
5. **Layering.** `controller → service → repository → Prisma`. Controllers only parse/validate, call the
   service and map responses; repositories are the only Prisma-aware layer and always take `orgId`.
6. **Validate and fail uniformly.** zod/DTO validation on every input; every error uses
   `{ code, message, details?, requestId }` with codes from `docs/error-codes.md`.
7. **Secrets.** No secret in Git, only `.env.example`; the env schema fails fast at startup; never log
   tokens, passwords, secrets or full PII payloads.
8. **Async by default.** Heavy or external work goes through BullMQ queues (or SSE for AI streaming);
   requests are never blocked by it.
9. **Small, traceable changes.** One feature slice or task group per change, the FR/AC ID in the description,
   and `docs/traceability.md` updated in the same change.
10. **Separate apps.** Frontend and backend live in separate folders: `apps/api` (backend, NestJS) and `apps/web`
    (frontend, React + Vite); shared types/zod live in `packages/shared`. Never mix server and client code in one
    folder, and never import across the two apps (go through `packages/shared`).