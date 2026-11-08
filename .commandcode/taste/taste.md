# Agent taste — standing preferences for this repository

> Read `AGENTS.md` at the repository root first. This file only adds local preferences; `AGENTS.md` and
> `.specify/memory/constitution.md` win any disagreement.

- **Read before acting**: `AGENTS.md` → `.specify/memory/constitution.md` → the feature
  `spec.md`/`plan.md`/`tasks.md` → the related `docs/*` contracts.
- **Language**: every repository artifact (docs, specs, plans, tasks, ADRs, checklists, config, code comments)
  in English; chat replies follow the user's language.
- **Edits**: small and surgical; never reformat or rewrite unrelated regions of a file; prefer the file-editing
  tools over shell redirection.
- **Identifiers**: preserve `FR-*`, `NFR-*`, `AC-*`, `T###`, `ADR-###`, `SCR-###` exactly; keep traceability
  and task/AC tables in sync when anything changes.
- **Style**: no emoji or decorative icons in files or in replies; mark state with markdown (tables using
  `Yes`/`No`/`Own`/`n/a`, task checkboxes `- [x]`, bold text, code spans).
- **Conflicts**: never resolve a document disagreement silently — fix the deviating document toward the
  governing artifact (constitution → source spec → feature spec → plan → tasks → supporting docs) or record an
  ADR/SCR, then report it.
- **Evidence**: verify by reading files back after editing; run lint/typecheck/tests when code exists; state
  uncertainty and gaps instead of guessing.
- **Reporting**: end every task with what changed, why, the evidence, and what remains.

