# Phản biện Spec & Decision Log

**Đối tượng review**: `Pulse CRM — Đặc tả sản phẩm (Spec-Driven).md` v0.1
**Ngày**: 2026-11-08
**Người review**: AI (theo yêu cầu mục 12 của spec)
**Trạng thái**: Đề xuất — cần người duyệt trước khi code M1

Mục đích: chỉ ra chỗ mơ hồ, mâu thuẫn, trường hợp biên và rủi ro bảo mật **trước khi viết code**, đồng thời
ghi lại quyết định đã áp dụng trong bộ SDD. Các quyết định lớn có ADR riêng; các thay đổi nhỏ nằm trong
bảng SCR.

> Quy tắc: nếu một mục dưới đây chưa được duyệt, phần code liên quan không được bắt đầu. Spec gốc vẫn là
> nguồn sự thật; các SCR cần được merge vào spec v0.2.

## 1. Phát hiện nghiêm trọng (P0 — phải sửa trước khi code)

### 1.1 `webhook_sources.secret_hash` không thể dùng để xác thực HMAC

Spec yêu cầu xác thực chữ ký HMAC (FR-11) nhưng schema chỉ lưu `secret_hash`. HMAC cần **secret gốc** để
tính lại chữ ký; hash một chiều không dùng được. Nếu lưu hash, server không thể verify.

**Quyết định**: lưu secret đã mã hóa bằng AES-256-GCM với khóa từ biến môi trường
`WEBHOOK_SECRET_ENC_KEY`; thêm `secret_last4` để hiển thị và `rotated_at` để xoay vòng. Không bao giờ trả
secret qua API sau khi tạo. Chi tiết: `ADR-011`, `SCR-003`.

### 1.2 Realtime room theo org làm lộ dữ liệu của Sales

Spec mục 5 nói phát sự kiện tới `room org_id`. Nếu Sales trong cùng org nhận `deal.moved` của deal do người
khác sở hữu, họ biết được deal tồn tại, stage, giá trị — vi phạm quy tắc “Sales chỉ thấy dữ liệu mình sở
hữu”. Payload tối giản vẫn lộ ID/hoạt động.

**Quyết định**: route theo quyền, không broadcast toàn org:

- `user:{userId}`: owner hiện tại và owner trước đó (deal.moved, deal.assigned).
- `org:{orgId}:managers`: Manager/Admin nhận mọi deal event trong org.
- `user:{assigneeId}`: task.due, notification.
- `org:{orgId}:system`: event không chứa dữ liệu nghiệp vụ (ví dụ maintenance).

Chi tiết: `ADR-012`, `docs/events.md`, `SCR-008`.

### 1.3 `stages` thiếu `org_id`, vi phạm C3

C3 nói mọi bảng nghiệp vụ có `org_id`, nhưng `stages` chỉ có `pipeline_id`. Nếu truy vấn stage theo ID mà
quên join pipeline, có thể lộ stage của org khác. `activities` thì có `org_id` nhưng `deal_id` không đủ để
lọc tenant nếu không join.

**Quyết định**: thêm `org_id` vào `stages`; dùng composite FK `(org_id, pipeline_id)` và
`(org_id, id)`; mọi bảng nghiệp vụ đều có `org_id`. Chi tiết: `SCR-001`, `docs/data-model.md`.

### 1.4 Thiếu `closed_at` trên deal

FR-08 cần tỷ lệ thắng và doanh thu theo tháng; FR-06 chốt thắng/thua. Nếu chỉ dựa vào `updated_at` hoặc
`status`, không thể tính chính xác “thắng trong khoảng thời gian” và không phân biệt deal đóng cũ bị sửa.

**Quyết định**: thêm `closed_at timestamptz null`, set khi chuyển sang WON/LOST, clear khi reopen. Check
constraint: `closed_at` khác null khi và chỉ khi `status != OPEN`. Chi tiết: `SCR-002`.

### 1.5 Thiếu bảng/history cho kết quả AI

FR-18 yêu cầu lưu lịch sử chấm điểm; FR-19 yêu cầu cache theo input giống hệt. `ai_usage` chỉ có token/cost,
không có output, score, reason, input hash.

**Quyết định**: thêm `ai_results` (mỗi lần chạy lưu output/score/reason/input_hash) bên cạnh `ai_usage`
(cost ledger). Cache đọc bản ghi gần nhất theo `input_hash`; history vẫn đầy đủ. Chi tiết: `SCR-005`,
`ADR-009` (RAG deferred).

### 1.6 Task không có bảng riêng nhưng có endpoint `/tasks`

Schema chỉ có `activities` với `type=task`, `due_at`, `done_at`, `assignee_id`; API lại có
`GET /tasks?status=overdue`. Nếu tạo bảng `tasks` mới sẽ trùng lặp timeline; nếu giữ `activities` phải định
nghĩa rõ task là projection.

**Quyết định**: giữ **một** bảng `activities`; task là activity `type='task'` với `due_at` bắt buộc và
`assignee_id` bắt buộc. `/tasks` là projection của `activities`, không phải entity mới. Nếu sau này cần
task không gắn deal, sẽ mở ADR mới. Chi tiết: `SCR-004`.

### 1.7 Thiếu idempotency/file hash cho import; thiếu attempts cho webhook

FR-10 yêu cầu chạy lại cùng file không tạo trùng; `import_jobs` không có `file_hash`, `created_by`,
`started_at`, `finished_at`, `error_report_key`. FR-11 yêu cầu retry/dead-letter; `webhook_events` thiếu
`attempts`, `last_error`, `processed_at`.

**Quyết định**: bổ sung các cột trên; unique `(org_id, idempotency_key)` cho webhook; import kiểm tra
`(org_id, file_hash)` trong 24 giờ và trả job cũ nếu đã có. Chi tiết: `SCR-006`.

## 2. Phát hiện mức cao (P1)

### 2.1 `deals.status` và `stage.is_won/is_lost` có thể lệch nhau

Spec có cả `status` trên deal và cờ trên stage. Nếu chỉ set một nơi, báo cáo sai.

**Quyết định**: `status` là trạng thái nghiệp vụ được **service** suy ra từ stage khi move và lưu lại để
query/report; DB check ràng buộc `lost_reason`/`closed_at`. Không cho client gửi `status` trực tiếp.

### 2.2 Đa tiền tệ nhưng báo cáo không nói tỷ giá

Deal có `currency`; dashboard “tổng giá trị pipeline” và “doanh thu dự kiến” không nói quy đổi.

**Quyết định**: MVP mỗi org một tiền tệ (`organizations.currency`, mặc định `VND`); deal phải dùng đúng
currency của org. Báo cáo không quy đổi. Đa tiền tệ + tỷ giá là out-of-scope, cần ADR mới.

### 2.3 Công thức dashboard chưa định nghĩa

“Lead mới”, “tỷ lệ thắng”, “doanh thu dự kiến theo tháng” có thể hiểu nhiều cách.

**Quyết định** (chi tiết `SCR-011`):

- Lead mới = số `contacts.created_at` trong khoảng lọc.
- Deal theo stage = snapshot hiện tại của các deal `OPEN`, group theo stage.
- Tổng pipeline = `sum(deals.value)` của deal `OPEN`.
- Tỷ lệ thắng = `WON / (WON + LOST)` theo `closed_at` trong khoảng.
- Doanh thu dự kiến theo tháng = `sum(value)` của deal `OPEN` theo tháng `expected_close`, không trọng số.
- Bộ lọc thời gian áp dụng theo từng chỉ số như trên; ghi rõ trong tooltip/README.
- Sales: `owner_id = currentUser`; Manager/Admin: toàn org.

### 2.4 Unique email của contact và soft delete

Spec ghi unique `(org_id, email)` cho contact chưa xóa. Cần chống case-insensitive và cho phép tạo lại sau
khi xóa.

**Quyết định**: chuẩn hóa email lowercase/trim; partial unique index
`(org_id, lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL`. Xóa là soft delete; không restore
trong MVP.

### 2.5 Refresh token trả về body hay cookie?

Spec nói trả access/refresh token; SPA lưu refresh token ở localStorage sẽ tăng rủi ro XSS.

**Quyết định**: access token trả trong body, dùng ở `Authorization: Bearer`; refresh token đặt trong
cookie `HttpOnly; Secure; SameSite=Lax`, path `/api/v1/auth`. API client không phải browser có thể gửi
refresh token trong body để test/tích hợp. Không lưu refresh token trong localStorage. Chi tiết
`SCR-009`, `ADR-015`.

### 2.6 Thiếu luồng quên/đổi mật khẩu, xác thực email

Spec không có. Không được tự thêm UI/endpoint.

**Quyết định**: out-of-scope M1–M3; Admin tạo user với mật khẩu tạm và yêu cầu đổi ngoài hệ thống (hoặc
bổ sung FR mới trước M1 nếu cần). Ghi vào `docs/spec-review.md` là rủi ro vận hành.

### 2.7 Xóa stage/pipeline và ràng buộc “stage cuối”

FR-04 chỉ nói stage đang có deal thì 409. Chưa nói xóa stage cuối, xóa pipeline, hay tính duy nhất của
`is_won`/`is_lost`.

**Quyết định**:

- Không xóa stage nếu còn deal (409 `STAGE_HAS_DEALS`).
- Không xóa stage cuối cùng của pipeline (409 `LAST_STAGE`).
- Mỗi pipeline phải còn ít nhất một stage `is_won` và một stage `is_lost`; không cho xóa/đổi cờ nếu vi phạm.
- Xóa pipeline có deal → 409 `PIPELINE_HAS_DEALS`.
- Admin có thể tạo nhiều pipeline; org mới được seed “Sales Pipeline” với New/Qualified/Proposal/Won/Lost.

### 2.8 Position và kéo thả đồng thời

Spec có `position` nhưng không nói kiểu dữ liệu hay cách chèn. Integer + reindex toàn stage gây ghi nhiều
dòng và dễ conflict.

**Quyết định**: `position numeric(20,10)` (fractional index). Khi move, server tính midpoint giữa hai
neighbor; nếu không đủ khoảng trống thì rebalance stage trong transaction. Sort tie-break `(position, id)`.
Client gửi `position` là index đích; server trả position thực. Optimistic lock theo `version` bảo vệ từng
deal; hai deal khác nhau có thể cùng position, sort ổn định.

### 2.9 Audit có thể chứa PII/secret

`before/after` JSONB của user/contact/webhook có thể chứa password hash, token, secret.

**Quyết định**: `AuditService` redact các key `password*, token*, secret*, authorization`, giới hạn độ sâu
và kích thước; không log toàn bộ payload webhook. Audit user chỉ ghi email/name/role/active, không ghi hash.
Chi tiết: `SCR-013`.

### 2.10 Rate limit khi Redis lỗi

Không nói fail-open hay fail-closed.

**Quyết định**: auth/login fail-closed (503/429 có kiểm soát) vì bảo mật; đọc thường fail-open (bỏ qua
limit, log warn) để không sập app; webhook fail-closed vì chống lạm dụng. Ghi trong `docs/error-codes.md`.

### 2.11 Thiếu API notification và webhook source management

FR-09 cần đọc/đánh dấu đã đọc; FR-11 cần Admin tạo/xoay public key/secret nhưng bảng API mục 8 không có.

**Quyết định**: bổ sung endpoint (coi là phần bắt buộc của FR-09/FR-11, không phải feature mới):

- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`.
- `GET/POST /webhook-sources`, `PATCH /webhook-sources/:id`, `POST /webhook-sources/:id/rotate-secret`,
  `DELETE /webhook-sources/:id` (Admin).

### 2.12 Tìm kiếm tiếng Việt và full-text

PostgreSQL full-text mặc định không xử lý tốt tiếng Việt không dấu/có dấu. Spec yêu cầu tìm theo
tên/email/công ty, p95 < 300ms với 10k bản ghi.

**Quyết định**: dùng `pg_trgm` + `unaccent` (nếu cần) với GIN index trên `lower(name/email/company)`;
truy vấn `ILIKE '%term%'`. Đây là “full-text search” theo nghĩa sản phẩm; ghi rõ trong ADR-013. Với 10k
bản ghi, trigram dư sức đạt p95.

### 2.13 Đo “dưới 1 giây” và p95

AC realtime “người khác thấy trong dưới 1 giây” không đo được bằng unit test; p95 cần phương pháp.

**Quyết định**: E2E Playwright đo từ lúc click move đến khi DOM bên kia cập nhật, p95 của 20 lần chạy
≤ 1000ms (CI có thể nới 1500ms). NFR-01 đo bằng script seed + autocannon/k6, ghi p50/p95/p99, chạy trên
Docker local, không tính thời gian khởi động. Chi tiết `docs/testing-strategy.md`.

### 2.14 Phân trang, thời gian, ID

Chưa quy định.

**Quyết định**: cursor pagination (`cursor`, `limit` mặc định 50, tối đa 100), response
`{ data, nextCursor, hasMore }`; thời gian ISO-8601 UTC, hiển thị theo timezone org (mặc định
`Asia/Ho_Chi_Minh`); ID UUID v4; không tuần tự để tránh enumeration. Chi tiết `docs/api-conventions.md`.

### 2.15 Chi phí/quotas AI chưa có số

FR-19 yêu cầu hạn mức nhưng không nêu ngưỡng.

**Quyết định**: cấu hình qua env, mặc định org 200.000 token/ngày, user 50.000 token/ngày; vượt → 429
`AI_QUOTA_EXCEEDED`. Cache input hash trong 24 giờ. Giá model lấy từ bảng cấu hình, không hard-code.
Chi tiết `SCR-012`, `docs/error-codes.md`.

### 2.16 Webhook secret rotation và replay

Chưa nói timestamp/replay.

**Quyết định**: header `X-Pulse-Signature: t=<unix>,v1=<hex>`; HMAC-SHA256 trên `${t}.${rawBody}`; từ chối
nếu lệch > 300 giây; so sánh timing-safe; idempotency key bắt buộc; body tối đa 256KB.

### 2.17 Export CSV và CSV injection

**Quyết định**: escape ô bắt đầu bằng `=`, `+`, `-`, `@`, tab, CR; bọc quote; UTF-8 BOM để Excel đọc tiếng
Việt; giới hạn 100.000 dòng/lần; stream để không giữ toàn bộ trong RAM; audit hành động export.

### 2.18 AI gửi PII ra ngoài

**Quyết định**: mask email/phone trước khi gửi LLM; chỉ gửi dữ liệu org hiện tại; không gửi secret/audit;
prompt template cố định, nội dung CRM được đặt trong delimiter và coi là untrusted; không cho model gọi
tool. Ghi rõ trong `ADR-009`/feature 008 plan.

## 3. Câu hỏi mở trong spec gốc

| ID | Câu hỏi | Quyết định đề xuất | ADR |
| --- | --- | --- | --- |
| Q1 | Prisma hay Drizzle? | **Prisma** — type-safe, migration rõ, phổ biến; đánh đổi ít linh hoạt SQL thô nhưng đủ. | ADR-006 |
| Q2 | Socket.IO hay SSE cho realtime? | **Socket.IO** cho kanban/notification; **SSE** chỉ cho AI streaming (một chiều). | ADR-007 |
| Q3 | Email thật hay mailer giả? | **Mailpit khi dev/test**; adapter provider; chưa gửi email thật đến khi có quyết định vận hành. | ADR-008 |
| Q4 | Có làm FR-20 (RAG) không? | **Hoãn** khỏi M3; giữ schema sẵn sàng pgvector, chỉ làm khi có phê duyệt riêng. | ADR-009 |

## 4. Câu hỏi mới cần chốt

| ID | Câu hỏi | Mặc định trong SDD | Ảnh hưởng nếu đổi |
| --- | --- | --- | --- |
| Q5 | Có cần reset mật khẩu/verify email ở M1? | Không; Admin tạo mật khẩu tạm | Thêm FR + bảng token + email |
| Q6 | Đa tiền tệ? | Không; 1 org = 1 currency | Cần bảng tỷ giá + công thức quy đổi |
| Q7 | Nhiều pipeline? | Có; seed 1 pipeline mặc định | UI chọn pipeline, báo cáo theo pipeline |
| Q8 | Xóa cứng deal/contact? | Contact soft delete; deal không có API xóa | Cần soft delete + restore + audit |
| Q9 | Lưu audit bao lâu? | Không auto-delete trong MVP; đề xuất 12 tháng khi vận hành | Cần job retention + chính sách |
| Q10 | FR-20 RAG? | Hoãn | Cần pgvector + embedding + eval |

## 5. Spec Change Requests (SCR)

Trạng thái: **Applied in SDD** = đã phản ánh trong spec/plan/tasks; **Pending** = cần sửa file spec gốc.

| ID | Thay đổi | Lý do | Ảnh hưởng | Trạng thái |
| --- | --- | --- | --- | --- |
| SCR-001 | Thêm `stages.org_id`; composite FK `(org_id, id)` cho bảng nghiệp vụ | C3, chống lộ tenant | Schema, repository, test | Applied in SDD |
| SCR-002 | Thêm `deals.closed_at`, `organizations.currency`; check constraint status/lost_reason/closed_at | FR-06/FR-08 chính xác | Schema, report | Applied in SDD |
| SCR-003 | Đổi `webhook_sources.secret_hash` → `secret_ciphertext`, `secret_last4`, `rotated_at` | HMAC cần secret gốc | Schema, API, bảo mật | Applied in SDD; Pending spec |
| SCR-004 | Task = activity `type='task'`, không thêm bảng `tasks` | Tránh trùng mô hình | API `/tasks`, query | Applied in SDD |
| SCR-005 | Thêm `ai_results`; mở rộng `ai_usage` | FR-18 history, FR-19 cache/cost | Schema, AI service | Applied in SDD |
| SCR-006 | Thêm `import_jobs.file_hash/created_by/started_at/finished_at/error_report_key`; `webhook_events.attempts/last_error/processed_at` | Idempotency/retry | Schema, worker | Applied in SDD |
| SCR-007 | Thêm `notifications.dedupe_key`; endpoint notifications | FR-09, chống spam | Schema, API | Applied in SDD; Pending spec |
| SCR-008 | Realtime room theo role/user, không broadcast org | RBAC, Sales privacy | Gateway, events | Applied in SDD; Pending spec |
| SCR-009 | Refresh token qua HttpOnly cookie; access token body | Giảm XSS | Auth API, web | Applied in SDD |
| SCR-010 | Search dùng `pg_trgm` + `unaccent` thay full-text mặc định | Tiếng Việt, p95 | Index, query | Applied in SDD |
| SCR-011 | Định nghĩa công thức dashboard + filter | FR-08 kiểm chứng được | Report service/UI | Applied in SDD |
| SCR-012 | Chốt quota AI mặc định + endpoint usage/score | FR-18/FR-19 | AI module, env | Applied in SDD |
| SCR-013 | Audit redaction, append-only, không log secret/PII | C4, bảo mật | Audit service | Applied in SDD |
| SCR-014 | Cursor pagination, UUID v4, ISO UTC, timezone org | Nhất quán API | Toàn API | Applied in SDD |
| SCR-015 | Thêm endpoint quản lý webhook source + notification | FR-09/FR-11 thiếu API | API, RBAC | Applied in SDD; Pending spec |

## 6. Ngoài phạm vi / hoãn

- Thanh toán thật, marketing automation, mobile app, ERP/kế toán, microservices, Zalo/Messenger.
- Quên/đổi mật khẩu, verify email, SSO, 2FA (trừ khi bổ sung FR).
- Đa tiền tệ, tỷ giá, thuế.
- RAG/FR-20 (ADR-009).
- Gửi email thật tới khách hàng bên ngoài; chỉ email nội bộ qua Mailpit/queue ở M2.
- Data retention tự động, GDPR delete request, restore soft-delete.
- Multi-region, HA, horizontal scaling worker (có thể thêm sau).

## 7. Checklist review spec (dùng lại mỗi lần đổi spec)

- [ ] Mỗi FR có AC đo được, có ID, không trùng.
- [ ] Mỗi AC map được tới ít nhất một test.
- [ ] Mọi bảng nghiệp vụ có `org_id` và composite FK.
- [ ] Mọi mutation có audit trong transaction.
- [ ] Mọi input có schema; lỗi thống nhất.
- [ ] Mọi việc nặng/ngoài hệ thống đi qua queue/stream.
- [ ] Không có secret/PII trong log, audit, error.
- [ ] Có test tenant + role thấp hơn.
- [ ] Có phương án khi Redis/LLM/provider lỗi.
- [ ] Có ADR cho quyết định kiến trúc mới.
