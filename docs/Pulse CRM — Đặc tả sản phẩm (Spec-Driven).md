# Pulse CRM — Đặc tả sản phẩm (Spec-Driven)

Phiên bản 0.1 · Mini Sales CRM cho startup · TypeScript, NestJS, PostgreSQL, React

## 0. Cách dùng tài liệu này

Spec là nguồn sự thật duy nhất. Quy trình cho mỗi tính năng: **Spec → Plan → Tasks → Code (AI) → Verify**.

- Mỗi yêu cầu có ID (FR-xx, NFR-xx) và tiêu chí chấp nhận (AC) kiểm chứng được.
- Khi nhờ AI code, luôn dán kèm: mục Ràng buộc (mục 3), ID yêu cầu và AC liên quan, schema liên quan.
- Code chỉ được merge khi mỗi AC có test và test pass.
- Muốn đổi hướng: sửa spec trước, ghi ADR, rồi mới sửa code.
- Việc của bạn: viết và duyệt spec, chọn đánh đổi, review code. Việc của AI: thực thi theo spec và phản biện spec.

## 1. Tổng quan

**Vấn đề.** Startup nhỏ (3-20 người bán hàng) theo dõi khách bằng Excel và chat: mất lead, quên follow-up, không biết deal nào đang kẹt.

**Giải pháp.** Pulse CRM quản lý lead và deal theo pipeline kéo thả, nhắc việc, thông báo realtime, báo cáo đơn giản. Giai đoạn sau thêm AI hỗ trợ sales.

**Mục tiêu**

- G1: Sales rep xử lý lead từ lúc vào đến lúc chốt mà không cần Excel.
- G2: Manager nắm tình hình pipeline và hiệu suất đội trong một màn hình.
- G3: Hệ thống đáng tin cậy: không mất dữ liệu, không lộ dữ liệu giữa các tổ chức.
- G4 (portfolio): mỗi quyết định kiến trúc có ADR để giải thích khi phỏng vấn.

**Ngoài phạm vi:** thanh toán thật, marketing automation đầy đủ, mobile app, kế toán/ERP, microservices, tích hợp Zalo/Messenger (có thể làm sau).

## 2. Người dùng và phân quyền (RBAC)

| Vai trò | Mô tả | Quyền chính |
| --- | --- | --- |
| Admin | Chủ tổ chức | Quản lý user, pipeline, webhook, audit log, export; xem toàn bộ |
| Manager | Trưởng nhóm | Xem và sửa mọi lead/deal trong tổ chức, phân công, xem báo cáo toàn đội |
| Sales | Nhân viên bán | Chỉ xem và sửa dữ liệu mình sở hữu hoặc được giao; xem báo cáo của mình |

Quy tắc bất biến: không ai truy cập được dữ liệu của tổ chức khác, kể cả khi đoán đúng ID.

## 3. Ràng buộc bắt buộc (Constitution)

- C1. TypeScript strict; không dùng any nếu không có comment lý do.
- C2. Phân lớp controller → service → repository. Controller không gọi DB trực tiếp.
- C3. Mọi bảng nghiệp vụ có org\_id; mọi truy vấn phải lọc theo org\_id của người dùng hiện tại.
- C4. Mọi thay đổi dữ liệu nghiệp vụ ghi audit log (ai, làm gì, khi nào, trước/sau).
- C5. Input được validate bằng schema (DTO hoặc zod). Lỗi trả định dạng thống nhất: { code, message, details? }.
- C6. Không đưa secret vào Git; có .env.example; cấu hình qua biến môi trường.
- C7. Việc nặng hoặc phụ thuộc bên ngoài (email, import, webhook, AI) chạy qua queue hoặc stream, không chặn request thường.
- C8. Mỗi endpoint có ít nhất một test happy path và một test lỗi/quyền.
- C9. Mỗi PR nhỏ và gắn với ID yêu cầu.

## 4. Stack và quyết định kiến trúc

| Thành phần | Lựa chọn | Vì sao | Đã loại |
| --- | --- | --- | --- |
| Frontend | React + Vite + TS, TanStack Query, Tailwind + shadcn/ui, dnd-kit | Nhẹ, dễ giải thích, kanban cần kéo thả | Next.js (không cần SSR cho app nội bộ) |
| Backend | NestJS + TS | Module, DI, guard rõ ràng; hay gặp trong tin tuyển dụng | Express thuần (phải tự dựng nhiều) |
| Database | PostgreSQL + Prisma | Dữ liệu quan hệ, transaction, full-text, thêm pgvector sau | MongoDB |
| Queue/Cache | Redis + BullMQ | Job nền, retry, rate limit, cache | RabbitMQ (thừa với quy mô này) |
| Realtime | Socket.IO, room theo org | Kanban và thông báo | Polling |
| Auth | JWT access (15 phút) + refresh token (7 ngày, rotate) | Stateless, phổ biến | Session cookie |
| Test | Vitest/Jest, Supertest, Playwright (vài luồng chính) | Phủ đủ các tầng | — |
| Vận hành | Docker Compose, GitHub Actions, pino, Sentry | Chạy lại được ở mọi máy, có quan sát | — |
| AI | SDK LLM gọi trực tiếp + pgvector | Ít lớp trừu tượng, dễ hiểu và dễ debug | LangChain + vector DB riêng |

**ADR-001 — Modular monolith.** Lý do: một người làm, cần chạy và deploy đơn giản, ranh giới module vẫn rõ để tách sau nếu cần. Đánh đổi: scale từng phần độc lập kém hơn microservices.

**ADR-002 — Multi-tenant bằng cột org\_id (shared schema).** Lý do: đơn giản, đủ cho quy mô đồ án. Đánh đổi: rủi ro quên lọc org\_id, nên bắt buộc test cách ly tenant ở mọi endpoint.

**ADR-003 — Audit log ghi trong cùng transaction với thay đổi dữ liệu.** Lý do: không bao giờ có thay đổi mà thiếu log. Đánh đổi: tăng nhẹ độ trễ ghi.

**ADR-004 — Webhook dùng idempotency key và xử lý qua queue.** Lý do: bên gửi có thể gửi lại; ta phải trả lời nhanh và không tạo trùng lead.

**ADR-005 — Optimistic locking (cột version) cho deal.** Lý do: hai người kéo cùng một deal không được ghi đè âm thầm lên nhau.

## 5. Kiến trúc

**Module:** auth, organizations, users, contacts, deals, pipeline, tasks, notifications, imports, webhooks, reports, audit, ai.

**Đồng bộ (trả lời ngay):** CRUD, kéo thả kanban, báo cáo (có cache).

**Bất đồng bộ (qua queue):** import CSV, xử lý webhook, gửi email, nhắc việc theo lịch, gọi LLM nặng.

**Realtime:** sự kiện deal.moved, deal.assigned, task.due phát qua Socket.IO tới room org\_id.

## 6. Mô hình dữ liệu

| Bảng | Trường chính |
| --- | --- |
| organizations | id, name, plan, created\_at |
| users | id, org\_id, email, password\_hash, name, role, active |
| refresh\_tokens | id, user\_id, token\_hash, family\_id, expires\_at, revoked\_at |
| contacts | id, org\_id, name, email, phone, company, source, owner\_id, deleted\_at |
| pipelines | id, org\_id, name |
| stages | id, pipeline\_id, name, position, is\_won, is\_lost |
| deals | id, org\_id, contact\_id, pipeline\_id, stage\_id, title, value, currency, owner\_id, expected\_close, status, lost\_reason, position, version |
| activities | id, org\_id, deal\_id, type (note/call/email/task), content, due\_at, done\_at, assignee\_id |
| notifications | id, org\_id, user\_id, type, payload, read\_at |
| webhook\_sources | id, org\_id, public\_key, secret\_hash |
| webhook\_events | id, org\_id, idempotency\_key (unique theo org), status, payload |
| import\_jobs | id, org\_id, status, total, success, failed, error\_report\_url |
| audit\_logs | id, org\_id, actor\_id, entity, entity\_id, action, before, after, created\_at |
| ai\_usage | id, org\_id, user\_id, feature, input\_tokens, output\_tokens, cost, created\_at |

**Index:** (org\_id, owner\_id), (org\_id, stage\_id, position), full-text trên contacts (name, email, company), unique (org\_id, email) cho contacts chưa xóa.

## 7. Yêu cầu chức năng

### Giai đoạn 1 — Core

**FR-01 Đăng ký tổ chức và đăng nhập**

- Given email chưa dùng, When đăng ký, Then tạo organization + user Admin và trả access/refresh token.
- Given sai mật khẩu 5 lần trong 15 phút, Then trả 429.
- Given refresh token đã rotate bị dùng lại, Then thu hồi cả chuỗi token.

**FR-02 Quản lý thành viên (Admin):** tạo, đổi vai trò, vô hiệu hóa.

- Given user bị vô hiệu hóa, When refresh token, Then bị từ chối.

**FR-03 Contacts:** CRUD, tìm kiếm, lọc, phân trang.

- Tìm theo tên/email/công ty với 10.000 bản ghi: p95 dưới 300ms.
- Sales chỉ thấy contact mình sở hữu; Manager/Admin thấy toàn tổ chức.

**FR-04 Pipeline và stage tùy chỉnh (Admin):** thêm, sửa, sắp xếp stage.

- Given stage đang có deal, When xóa, Then trả 409 và yêu cầu chuyển deal trước.

**FR-05 Deals và kanban kéo thả**

- Given deal ở stage A, When kéo sang stage B, Then stage\_id và position cập nhật, audit log được ghi, người khác trong org thấy thay đổi trong dưới 1 giây.
- Given hai người kéo cùng deal, Then người ghi sau nhận 409 và UI tải lại trạng thái mới.

**FR-06 Chốt thắng/thua:** chuyển vào stage is\_won hoặc is\_lost; thua bắt buộc có lý do.

**FR-07 Hoạt động và nhắc việc:** ghi note, cuộc gọi, tạo task có hạn.

- Given task quá hạn, Then hiện trong danh sách Quá hạn và sinh thông báo.

**FR-08 Dashboard:** lead mới, deal theo stage, tổng giá trị pipeline, tỷ lệ thắng, doanh thu dự kiến theo tháng; lọc theo thời gian và người phụ trách.

- Sales chỉ thấy số liệu của mình.

### Giai đoạn 2 — Backend nâng cao

**FR-09 Thông báo realtime:** giao deal, task đến hạn.

**FR-10 Import CSV contacts**

- Given file 5.000 dòng, When tải lên, Then trả job id ngay, xử lý nền, xem được tiến độ và tải được báo cáo dòng lỗi.
- Chạy lại cùng file không tạo trùng (khóa theo email).

**FR-11 Webhook nhận lead từ form web**

- Given chữ ký HMAC sai, Then trả 401.
- Given cùng idempotency key gửi hai lần, Then chỉ tạo một lead.
- Xử lý qua queue, retry backoff tối đa 3 lần, thất bại vào dead-letter.

**FR-12 Email nhắc việc/follow-up qua queue** (dùng mailer giả như Mailpit khi dev).

**FR-13 Audit log (Admin):** xem và lọc theo entity, người thực hiện, thời gian.

**FR-14 Export CSV (Admin/Manager).**

**FR-15 Rate limit và cache:** giới hạn theo user/IP; cache dashboard 60 giây, vô hiệu khi dữ liệu liên quan đổi.

### Giai đoạn 3 — AI

**FR-16 Tóm tắt lịch sử deal (streaming)**

- Token đầu tiên trong dưới 3 giây; chỉ dùng dữ liệu của org hiện tại; giới hạn token đầu vào.
- Given LLM lỗi hoặc timeout, Then báo lỗi thân thiện và deal không bị ảnh hưởng.

**FR-17 Soạn email follow-up nháp:** người dùng duyệt và sửa trước khi gửi; hệ thống không tự gửi.

**FR-18 Chấm điểm lead (0-100) kèm lý do:** lưu lịch sử; có bộ mẫu tối thiểu 30 lead để đo độ ổn định giữa các lần chạy.

**FR-19 Kiểm soát chi phí**

- Đếm token theo user và org, hạn mức theo ngày; Given vượt hạn mức, Then trả 429.
- Cache kết quả cho đầu vào giống hệt nhau.

**FR-20 (tùy chọn) Hỏi đáp trên ghi chú bằng RAG:** pgvector, có trích dẫn nguồn.

## 8. API (tiền tố /api/v1)

| Method | Đường dẫn | Quyền |
| --- | --- | --- |
| POST | /auth/register, /auth/login, /auth/refresh, /auth/logout | Công khai / đã đăng nhập |
| GET, POST, PATCH, DELETE | /contacts | Theo RBAC |
| GET, POST | /deals | Theo RBAC |
| PATCH | /deals/:id | Chủ sở hữu, Manager, Admin |
| PATCH | /deals/:id/move (stageId, position, version) | Chủ sở hữu, Manager, Admin |
| GET, POST | /deals/:id/activities | Theo RBAC |
| GET | /tasks?status=overdue | Người được giao |
| GET | /reports/summary | Theo RBAC |
| POST, GET | /imports/contacts, /imports/:id | Manager, Admin |
| POST | /webhooks/leads/:publicKey (có chữ ký) | Công khai có xác thực chữ ký |
| GET | /audit-logs | Admin |
| POST | /ai/deals/:id/summary (SSE) | Theo RBAC |

## 9. Yêu cầu phi chức năng

- NFR-01 Hiệu năng: p95 API đọc dưới 300ms với 10.000 contacts và 5.000 deals.
- NFR-02 Bảo mật: hash mật khẩu bằng argon2 hoặc bcrypt, helmet, CORS whitelist, kiểm tra OWASP Top 10 cơ bản, có test cách ly tenant.
- NFR-03 Tin cậy: endpoint /health, graceful shutdown, job có retry và dead-letter.
- NFR-04 Quan sát: log JSON có requestId, lỗi gửi về Sentry.
- NFR-05 Dữ liệu: migration có version, có script backup.
- NFR-06 Triển khai: setup local bằng vài lệnh ghi trong README; có script kiểm tra hạ tầng (DB, Redis kết nối được).
- NFR-07 Chất lượng: lint, typecheck, test chạy trong CI; coverage service layer từ 70% trở lên.

## 10. Chiến lược kiểm thử

- **Unit:** logic service (quy tắc pipeline, tính báo cáo).
- **Integration:** API với PostgreSQL và Redis thật chạy trong Docker.
- **E2E (Playwright):** đăng nhập → tạo deal → kéo kanban → thấy cập nhật realtime.
- **Bắt buộc:** với mỗi endpoint, thử bằng user của org khác và bằng role thấp hơn; test xung đột 409 của kanban; test idempotency của webhook và import.
- **AI:** mock LLM trong test tự động; bộ eval riêng chạy thủ công để đo chất lượng và chi phí.

## 11. Lộ trình và Definition of Done

| Mốc | Nội dung | Thời lượng gợi ý | DoD |
| --- | --- | --- | --- |
| M0 Nền tảng | Repo, Docker Compose, CI, health check, README, migration đầu | 1 tuần | Clone về chạy được đúng theo README |
| M1 Core | FR-01 đến FR-08 | 4-5 tuần | Demo trọn luồng lead → chốt, test quyền và tenant pass, có link deploy |
| M2 Backend nâng cao | FR-09 đến FR-15 | 3 tuần | Import 5.000 dòng, webhook idempotent, audit log, rate limit đều có test |
| M3 AI | FR-16 đến FR-19 | 2 tuần | Streaming chạy, đo được chi phí, có hạn mức |
| M4 Hoàn thiện | Tài liệu, sơ đồ kiến trúc, ADR, video demo | 1 tuần | Người lạ đọc README và hiểu hệ thống trong 10 phút |

**Checklist DoD cho mỗi tính năng:** AC có test pass; lint và typecheck sạch; kiểm tra quyền và org\_id; audit log đã ghi; spec và ADR được cập nhật nếu có thay đổi.

## 12. Mẫu prompt làm việc với AI

```
Bối cảnh: Pulse CRM, tuân thủ Constitution C1-C9 (dán kèm).
Nhiệm vụ: thực hiện FR-05 theo AC sau: (dán AC).
Schema liên quan: (dán bảng deals, stages, audit_logs).
Yêu cầu:
1) Nêu kế hoạch và các giả định trước khi viết code.
2) Viết test cho từng AC.
3) Không thêm tính năng ngoài spec.
4) Nêu rủi ro hoặc điểm yếu của cách làm.
```

**Prompt phản biện (dùng trước khi code):** “Đây là spec/schema của tôi. Hãy chỉ ra chỗ mơ hồ, mâu thuẫn, trường hợp biên bị thiếu và rủi ro bảo mật. Chưa viết code.”

## 13. Rủi ro và câu hỏi mở

**Rủi ro**

- Scope creep: chỉ thêm tính năng khi đã sửa spec.
- Code AI viết mà bạn không hiểu: mỗi tuần tự giải thích lại một module không nhìn code.
- Chi phí LLM: bắt buộc có hạn mức và dùng mock khi dev.
- Free tier hosting bị ngủ: ghi chú trong tài liệu demo.

**Câu hỏi mở (quyết định và ghi ADR trước M1)**

- Q1: Prisma hay Drizzle?
- Q2: Socket.IO hay SSE cho realtime?
- Q3: Gửi email thật (Resend/SES) hay chỉ dùng mailer giả?
- Q4: Có làm FR-20 (RAG) hay không?
