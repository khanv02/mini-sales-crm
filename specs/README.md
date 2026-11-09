# Pulse CRM — SDD Index

This documentation set turns product spec v0.1 into a **Spec → Plan → Tasks → Code → Verify** workflow that can be
executed by AI and reviewed by humans. The original concept PRD remains `Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md`
(v0.1 reference archive); the living, executable specification is maintained in `specs/` and `docs/`, with
clarifications in `docs/spec-review.md` and `docs/adr/`.

## 1. Structure

```text
.specify/memory/constitution.md   # Project law (C1–C9 + quality gates)
specs/                            # Feature specs following Spec Kit
  001-foundation/
    spec.md                       # Requirements + AC
    plan.md                       # Architecture/technical decisions + Constitution Check
    tasks.md                      # Test-first tasks with file paths
  002-identity-access/
  ...
docs/
  spec-review.md                  # Spec critique, SCRs, decisions
  traceability.md                 # FR/AC → feature → task → test
  data-model.md                   # ERD, tables, constraints, indexes
  api-conventions.md              # REST conventions, pagination, errors, auth
  error-codes.md                  # Error code catalog
  permissions-matrix.md           # RBAC per endpoint
  events.md                       # Socket.IO + queue event contracts
  testing-strategy.md             # Unit/integration/E2E/perf/AI eval
  nfr.md                          # AC definitions for NFR-01…NFR-07
  quickstart.md                   # M0: run from a fresh clone
  adr/                            # Architecture Decision Records
  checklists/                     # DoD, security review
  api/openapi.yaml                # OpenAPI 3.1 contract
```

## 2. Feature map

Feature numbers are sequential and stable. A feature may cover several `FR-xx` entries but must be an
independently demoable slice.

| # | Feature | Source | Milestone | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | Foundation | M0 | M0 | - | Implemented, M0 gates green |
| 002 | Identity & Access | FR-01, FR-02 | M1 | 001 | Draft |
| 003 | Contacts, Pipeline & Deals | FR-03, FR-04, FR-05, FR-06 | M1 | 002 | Draft |
| 004 | Activities, Tasks & Dashboard | FR-07, FR-08 | M1 | 003 | Draft |
| 005 | Realtime & Notifications | FR-09 | M2 | 003, 004 | Draft |
| 006 | Integrations (Import, Webhook, Email) | FR-10, FR-11, FR-12 | M2 | 002, 003, 004, 007 | Draft |
| 007 | Governance (Audit, Export, Rate limit, Cache) | FR-13, FR-14, FR-15 | M2 | 003, 004 | Draft |
| 008 | AI Assist | FR-16–FR-20 | M3 | 003, 004, 007 | Draft; FR-20 deferred |

Recommended delivery order: `001 → 002 → 003 → 004 → 007 (audit/cache/rate limit) → 005 → 006 → 008`.
Rationale: 007 provides the audit/cache/rate-limit layers reused by 005/006/008, and 005 needs deal/activity to be
stable. The 005/006 order may change for a good reason, as long as traceability is updated. 006 additionally
depends on 004 (task reminder scheduler + notification service) and on 007 (generic limiter wired into the webhook
endpoint, see `specs/006-integrations/tasks.md`).

## 3. ID conventions

| Kind | Format | Example |
| --- | --- | --- |
| Source requirement | `FR-xx`, `NFR-xx` | `FR-05`, `NFR-02` |
| Feature requirement | `FR-xx.y` | `FR-05.3` |
| Acceptance criterion | `AC-FRxx-yy` | `AC-FR05-04` |
| User story | `US-x` inside a feature | `US-2` |
| Task | global `T###` | `T213` |
| Decision | `ADR-###` | `ADR-011` |
| Spec change | `SCR-###` | `SCR-003` |

Task IDs are allocated in ranges so parallel work never collides:

| Feature | Task range |
| --- | --- |
| 001 Foundation | T001–T099 |
| 002 Identity & Access | T100–T199 |
| 003 Contacts/Pipeline/Deals | T200–T299 |
| 004 Activities/Dashboard | T300–T399 |
| 005 Realtime/Notifications | T400–T499 |
| 006 Integrations | T500–T599 |
| 007 Governance | T600–T699 |
| 008 AI Assist | T700–T799 |

## 4. Working with Spec Kit

Spec Kit is installed in the repo (`.specify/`). The available commands are:

```text
/speckit.constitution   # already completed: .specify/memory/constitution.md
/speckit.specify        # create a new feature spec
/speckit.clarify        # resolve ambiguous points
/speckit.plan           # create plan + research/data-model/contracts
/speckit.tasks          # create tasks
/speckit.analyze        # check spec/plan/tasks consistency
/speckit.implement      # execute tasks
```

The specs in this repo were written up front. When re-running `/speckit.plan` or `/speckit.tasks`, keep the AC IDs
and the decisions recorded in `docs/spec-review.md` intact; if the tool generates duplicate files, review instead of
blindly overwriting.

### Example prompt for delegating work to AI

```text
Context: Pulse CRM. Read .specify/memory/constitution.md, specs/00X-.../spec.md,
plan.md, tasks.md and docs/data-model.md. Comply with C1–C9.

Task: implement Txxx (AC-FRxx-yy).
Before coding:
1) Summarise the AC and assumptions.
2) List the files to change and the tests to write.
3) Point out tenant/audit/security risks.

After coding:
1) Run lint, typecheck and the relevant tests.
2) Check each AC and give the evidence (test names).
3) Do not add features beyond the spec.
```

## 5. Definition of Done (summary)

A feature is only done when:

- Every AC has a passing test; happy path + error/permission + tenant cases exist.
- Audit rows are written in the same transaction for every mutation.
- `org_id` is filtered in every query; a cross-org test exists.
- Lint, typecheck, build and service coverage ≥ 70% are green.
- API/event/data model match `docs/api/openapi.yaml`, `docs/events.md`, `docs/data-model.md`.
- Spec/plan/tasks/traceability are updated when anything changes.
- The feature flow can be demoed with seed data.

Details: `docs/checklists/feature-dod.md`.

## 6. Approved decisions & pending spec updates

The following architectural decisions have been **Accepted** (recorded in `docs/adr/`):

1. `ADR-006`: use Prisma as the ORM.
2. `ADR-007`: Socket.IO for realtime, SSE for AI streaming.
3. `ADR-008`: Mailpit in dev; email adapter, no real email sent in M1/M2.
4. `ADR-009`: defer FR-20 (RAG) beyond M3.
5. `ADR-010`: task is an activity with type='task'.
6. `ADR-011`: store the webhook secret encrypted (replaces `secret_hash` in the source spec).
7. `ADR-012`: realtime rooms by role/user instead of broadcasting to the whole org.
8. `ADR-013`: contact search with `pg_trgm` + `unaccent` (FR-03, M1).
9. `ADR-014`: fractional position for kanban ordering (FR-05, M1).
10. `ADR-015`: refresh token in an HttpOnly cookie, access token in the body (FR-01, M1).

The pending SCRs in `docs/spec-review.md` (SCR-003, SCR-007, SCR-008, SCR-015) remain to be folded into spec v0.2
during the regular milestone convergence. Implementation proceeds per the accepted ADRs and feature specs.
