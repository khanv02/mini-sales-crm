# Feature Specification: AI Assist

**Feature Branch**: `008-ai-assist`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-16, FR-17, FR-18, FR-19; FR-20 deferred (ADR-009); NFR-01, NFR-02; SCR-005, SCR-012

## User Scenarios & Testing

### US-1 — Tóm tắt lịch sử deal (Priority: P1)

Sales mở deal, bấm “Tóm tắt”; server stream token ngay (< 3s), chỉ dùng dữ liệu org hiện tại.

**Vì sao P1**: FR-16 là demo AI chính; streaming là điểm kỹ thuật portfolio.

**Kiểm thử độc lập**: Mock provider; gọi SSE; đo first token; kiểm tra prompt không chứa org khác; lỗi provider.

**Acceptance Scenarios**:

1. **AC-FR16-01** Given deal của mình, When `POST /ai/deals/:id/summary`, Then SSE `meta` rồi `token`; first
   token p95 < 3s; kết thúc `done` có usage.
2. **AC-FR16-02** Given input, When build prompt, Then chỉ gồm contact/deal/activity của org hiện tại; không
   có org khác; email/phone được mask.
3. **AC-FR16-03** Given lịch sử quá dài, When build prompt, Then cắt còn ≤ 8.000 token ước tính; giữ phần mới
   nhất + tóm tắt; không vượt limit.
4. **AC-FR16-04** Given provider lỗi/timeout, When stream, Then event `error` code thân thiện; deal/DB không
   đổi; user có thể thử lại.
5. **AC-FR16-05** Given client disconnect, When stream, Then abort provider; ghi usage `ERROR/CANCELLED`; không
   treo connection.
6. **AC-FR16-06** Given summary xong, When kiểm tra `ai_usage`, Then có token/cost/latency/user/org/feature.
7. **AC-FR16-07** Given Sales B, When summary deal Sales A, Then `404`; Manager/Admin được; org khác `404`.

---

### US-2 — Nháp email follow-up (Priority: P2)

Sales tạo nháp email từ deal; hệ thống không tự gửi; user sửa rồi tự gửi ngoài hệ thống (MVP).

**Vì sao P2**: FR-17; giá trị cao nhưng phụ thuộc summary/context.

**Kiểm thử độc lập**: Gọi endpoint; nhận draft; kiểm tra không có email gửi; sửa nội dung ở UI.

**Acceptance Scenarios**:

1. **AC-FR17-01** Given deal, When tạo draft, Then trả `subject`, `body`, `tone`, `language`; nội dung dựa
   trên contact/deal/activity trong org.
2. **AC-FR17-02** Given draft, When kiểm tra queue email/log, Then **không** có email nào được gửi; chỉ trả text.
3. **AC-FR17-03** Given UI, When user sửa subject/body, Then lưu nháp local/không ghi đè deal; có thể copy.
4. **AC-FR17-04** Given Sales B/org khác, When tạo draft deal A, Then `404`; prompt không chứa dữ liệu ngoài org.

---

### US-3 — Chấm điểm lead (Priority: P2)

Hệ thống chấm 0–100 kèm lý do, lưu lịch sử, có bộ eval 30 lead để đo ổn định.

**Vì sao P2**: FR-18; cần queue/eval, làm sau summary.

**Kiểm thử độc lập**: Chấm 1 contact; kiểm tra score/reason/history; chấm lại; cache; chạy eval 30 lead.

**Acceptance Scenarios**:

1. **AC-FR18-01** Given contact của mình, When `POST /ai/contacts/:id/score`, Then `202 runId`; worker xử lý;
   `GET /ai/runs/:id` trả `score` 0–100 + `reason` + `model`.
2. **AC-FR18-02** Given chấm nhiều lần, When xem history, Then mỗi lần là một bản ghi `ai_results`; không ghi đè.
3. **AC-FR18-03** Given bộ eval ≥ 30 lead, When chạy `pnpm eval:score`, Then báo MAE giữa 3 lần chạy + tỷ lệ
   trong band; lưu report.
4. **AC-FR18-04** Given eval, When 3 lần cùng input, Then MAE trung bình ≤ 10 điểm; nếu vượt, ghi cảnh báo
   (không chặn CI).
5. **AC-FR18-05** Given cùng input hash trong 24h, When chấm lại, Then trả cache (không gọi provider), ghi
   `cache_hit=true`; history vẫn có bản ghi cache.
6. **AC-FR18-06** Given Sales B/org khác, When chấm contact A, Then `404`; score không rò dữ liệu.

---

### US-4 — Kiểm soát chi phí (Priority: P1)

Đếm token theo user/org, hạn mức ngày, cache input, báo 429 khi vượt.

**Vì sao P1**: FR-19; không có quota thì rủi ro chi phí LLM.

**Kiểm thử độc lập**: Set quota thấp; gọi AI đến khi 429; kiểm tra provider không gọi; cache hit.

**Acceptance Scenarios**:

1. **AC-FR19-01** Given mỗi lần gọi AI, When xong, Then `ai_usage` ghi input/output token, cost, user, org,
   feature, latency, status.
2. **AC-FR19-02** Given org/user vượt hạn mức ngày, When gọi AI, Then `429 AI_QUOTA_EXCEEDED` trước khi gọi
   provider; `Retry-After` đến ngày mới.
3. **AC-FR19-03** Given cùng input hash, When gọi lần 2 trong TTL, Then cache hit, cost 0/provider không gọi.
4. **AC-FR19-04** Given bảng giá model, When tính cost, Then `cost_usd` khớp `tokens * price` (làm tròn 6
   chữ số); không hard-code.
5. **AC-FR19-05** Given sang ngày mới (timezone org), When gọi, Then quota reset; usage cũ vẫn còn.
6. **AC-FR19-06** Given user, When `GET /ai/usage`, Then thấy usage của mình; Admin/Manager thấy org/tổng
   hợp; Sales không thấy người khác.
7. **AC-FR19-07** Given org B, When xem usage org A, Then `404`/không thấy; quota tách theo org.

### Edge Cases

- Provider trả về giữa chừng rồi đứt → lưu partial usage, status ERROR; không tính là thành công.
- Model trả JSON score thiếu field/ngoài 0–100 → retry 1 lần rồi `AI_OUTPUT_INVALID`; không lưu score rác.
- Input rỗng/quá ngắn → trả message thân thiện, không gọi provider.
- Prompt injection trong note (“bỏ qua hướng dẫn…”) → coi là dữ liệu; system prompt cố định; output không
  thực thi.
- Email/phone mask nhưng tên công ty giữ; không gửi secret/audit.
- Quota Redis mất → reconcile từ DB; có thể chậm hơn nhưng không vượt quá nhiều.
- Nhiều request đồng thời cùng input → single-flight lock (Redis) để tránh gọi trùng.
- Client disconnect giữa stream → abort; không tính full output.
- RAG (FR-20) không có endpoint; trả 404/không hiển thị.

## Requirements

### Functional Requirements

- **FR-16.1**: `POST /ai/deals/:id/summary` SSE; event `meta/token/done/error`; first token p95 < 3s;
  timeout 30s; abort on disconnect.
- **FR-16.2**: Prompt chỉ dữ liệu org hiện tại; mask email/phone; input ≤ 8.000 token ước tính; system prompt
  cố định; nội dung CRM là untrusted.
- **FR-16.3**: Lỗi provider không ảnh hưởng deal; trả message thân thiện; log requestId.
- **FR-17.1**: `POST /ai/deals/:id/follow-up-email` trả draft JSON; **không** gửi email; user sửa/copy.
- **FR-18.1**: `POST /ai/contacts/:id/score` → 202 runId; worker `ai`; `GET /ai/runs/:id`; score 0–100 + reason;
  history `ai_results`.
- **FR-18.2**: Eval dataset ≥ 30 lead; script đo MAE/band/cost; chạy tay.
- **FR-19.1**: `ai_usage` mỗi lần gọi; quota ngày org 200k/user 50k (env); 429 trước provider; cache 24h.
- **FR-19.2**: `GET /ai/usage` theo quyền; cost từ bảng giá cấu hình; không hard-code.
- **FR-19.3**: Single-flight/cache theo input hash; không cache cross-org.
- **FR-20**: Không implement (ADR-009); không route/UI.

### Key Entities

- `ai_usage` (cost ledger), `ai_results` (output/history/cache); chi tiết `docs/data-model.md` 4.14–4.15.
- Deal/Contact/Activity là nguồn context; không copy sang bảng AI.

## Success Criteria

- **SC-001**: First token p95 < 3s với mock; < 5s với provider thật (ghi rõ môi trường).
- **SC-002**: 0 dữ liệu org khác trong prompt (test + review).
- **SC-003**: 100% lần gọi có usage; quota chặn trước provider; cache hit không cost.
- **SC-004**: Eval 30 lead chạy được; MAE ≤ 10; báo cáo lưu.
- **SC-005**: 100% AC có test; provider mock trong CI.

## Assumptions

- `AI_PROVIDER=mock` mặc định dev/test; production cấu hình provider thật.
- Model/giá cấu hình qua env/bảng JSON; không hard-code.
- Summary/draft dùng context giới hạn; chưa có RAG.
- Score chạy queue; summary stream trực tiếp (C7 cho phép stream).
- Email draft không gửi; gửi thật ngoài scope (Q3/Q5).
- Mask PII đơn giản (email/phone) trước khi gửi; có thể cải tiến.

## Out of Scope

- RAG/FR-20, embedding, pgvector.
- Auto-send email, chỉnh sửa và gửi trong hệ thống (cần FR mới).
- Fine-tuning, model tự host.
- Multi-model routing/fallback phức tạp.
- AI chat tự do ngoài 3 use case.
- Billing/payment cho AI.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-16 | AC-FR16-01..07 | T700–T708, T718 |
| FR-17 | AC-FR17-01..04 | T709–T710, T718 |
| FR-18 | AC-FR18-01..06 | T711–T715, T718 |
| FR-19 | AC-FR19-01..07 | T703, T714, T716–T718 |
| FR-20 | — | ADR-009 (deferred) |
