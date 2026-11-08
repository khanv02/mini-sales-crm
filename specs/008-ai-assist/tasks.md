# Tasks: AI Assist

**Input**: `specs/008-ai-assist/`
**Prerequisites**: 003, 004, 007; plan.md, spec.md
**Tests**: Bắt buộc; mọi test CI dùng mock provider. Eval chạy tay.

## Phase 1 — Foundation

- [ ] **T700** Prisma/migration: `ai_usage`, `ai_results`; index; config `AI_*`/price table; cập nhật data-model.
- [ ] **T701** [P] `modules/ai/provider/{llm-provider.interface,mock.provider,openai-compatible.provider}.ts`;
      factory theo env; unit test timeout/retry.
- [ ] **T702** [P] `prompt.builder.ts`: context loader org-only, mask email/phone, truncate ≤ 8k, system prompt;
      unit test injection/mask.
- [ ] **T703** [P] `quota.service.ts` + `ai-cache.service.ts`: Redis daily counters, DB reconcile, 429, input
      hash cache 24h, single-flight; unit test.
- [ ] **T704** [P] SSE helper: headers, event writer, abort signal, timeout; unit test.

## Phase 2 — US1 Summary (P1)

### Tests first

- [ ] **T705** `apps/api/test/integration/ai-summary.spec.ts`: SSE order, first token, org isolation, truncation,
      provider error, client abort, RBAC/tenant, usage record.
- [ ] **T706** Frontend test: stream reader, error UI.

### Implementation

- [ ] **T707** `modules/ai/deal-summary.service.ts` + controller `POST /ai/deals/:id/summary`; quota/cache;
      usage; error mapping.
- [ ] **T708** `apps/web/src/features/ai/DealSummaryPanel.tsx`: stream, stop, copy, error.

## Phase 3 — US2 Email draft (P2)

### Tests first

- [ ] **T709** `apps/api/test/integration/ai-email-draft.spec.ts`: draft schema, no send/log, org/RBAC.

### Implementation

- [ ] **T710** `follow-up-email.service.ts` + controller; prompt; frontend dialog editable, copy, no send.

## Phase 4 — US3 Lead score (P2)

### Tests first

- [ ] **T711** `apps/api/test/integration/ai-score.spec.ts`: 202 run, 0–100/reason, history, cache, invalid
      output, quota 429, tenant.
- [ ] **T712** `apps/api/test/unit/score-output.spec.ts`: schema/range/retry.

### Implementation

- [ ] **T713** `score.controller.ts` + `score.worker.ts` (queue `ai` trên base queue 001 T020);
      `GET /ai/runs/:id`; history.
- [ ] **T714** Frontend score badge/reason/history; usage page `GET /ai/usage`.
- [ ] **T715** `evals/lead-scoring.json` ≥ 30 + `evals/score-stability.ts`: 3 runs, MAE/band/cost report.

## Phase 5 — Cost/verification

- [ ] **T716** `ai-usage.service` + endpoint `GET /ai/usage`; role/tenant; cost calculation.
- [ ] **T717** Integration quota/cache/cost: 429 before provider, cache hit no provider, cost matches price.
- [ ] **T718** Docs/traceability; ADR-009 status; security review PII/prompt/key; PR checklist.

## Dependencies

- T700 → T701–T704.
- Summary (T705–T708) cần 003/004 context.
- Draft (T709–T710) sau prompt.
- Score (T711–T715) cần queue `ai` trên base 001 T020 và provider.
- Usage (T716) sau usage schema.

## MVP checkpoint

Sau T708: summary stream + quota + usage. Sau T710: draft. Sau T715: score + eval.

## Notes

- FR-20/RAG không làm (ADR-009); không thêm pgvector/embedding.
- Mock provider mặc định; không gọi provider thật trong CI.

## Traceability (task → AC)

| AC | Task |
| --- | --- |
| AC-FR16-01..07 | T700–T708, T718 |
| AC-FR17-01..04 | T709–T710, T718 |
| AC-FR18-01..06 | T711–T715, T718 |
| AC-FR19-01..07 | T703, T714, T716–T718 |
- Không log prompt/response đầy đủ; mask PII.
- Email draft không auto-send; không tạo job email.
- Mọi AI call phải qua quota/cache; ghi usage kể cả lỗi.
