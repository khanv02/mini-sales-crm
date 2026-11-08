# Checklist — Feature Definition of Done

Dùng cho mỗi feature/PR trước khi merge. Không tick đủ thì chưa xong.

## Spec & traceability

- [ ] Feature có `spec.md`, `plan.md`, `tasks.md`; status rõ.
- [ ] Mỗi AC có ID và test tương ứng; `docs/traceability.md` đã cập nhật.
- [ ] Không có “NEEDS CLARIFICATION”/TBD trong spec.
- [ ] Thay đổi hành vi đã cập nhật spec gốc hoặc SCR/ADR.

## Hành vi & test

- [ ] Mỗi endpoint có happy path + lỗi validation + role thấp hơn + tenant khác.
- [ ] Test viết trước, đã thấy fail (ghi chú PR nếu không).
- [ ] Test cách ly tenant: org B gọi ID org A → 404, DB không đổi.
- [ ] Test optimistic lock/idempotency/retry nếu feature có.
- [ ] Test audit: đúng actor/entity/action/before-after; rollback không audit.
- [ ] E2E cho luồng chính (nếu UI).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` xanh; coverage service ≥ 70%.

## Dữ liệu & migration

- [ ] Schema thay đổi có migration; chạy từ DB trống thành công.
- [ ] `org_id` + composite FK cho bảng mới.
- [ ] Index cho query mới; EXPLAIN không seq scan bất thường.
- [ ] Seed idempotent; không ảnh hưởng production.
- [ ] Có rollback/backup nếu migration rủi ro.

## Bảo mật

- [ ] Input validate zod/DTO; output không lộ field nhạy cảm.
- [ ] Không log password/token/secret/PII thừa.
- [ ] RBAC đúng `docs/permissions-matrix.md`.
- [ ] Rate limit cho endpoint public/nặng (nếu có).
- [ ] Secret lấy từ env; `.env.example` cập nhật; không commit.
- [ ] Checklist `docs/checklists/security-review.md` đã chạy.

## Vận hành

- [ ] Log JSON có requestId/org/user; lỗi 5xx lên Sentry.
- [ ] Health/ready không bị ảnh hưởng; graceful shutdown.
- [ ] Job có retry/backoff/DLQ; idempotent.
- [ ] Cache invalidation đúng (nếu có).
- [ ] Không chặn request bởi việc nặng.

## Tài liệu & demo

- [ ] API/event/data model khớp `docs/`.
- [ ] README/quickstart cập nhật nếu lệnh/env đổi.
- [ ] ADR mới (nếu quyết định kiến trúc) + index.
- [ ] Demo được bằng seed trong ≤ 5 phút.
- [ ] PR nhỏ, mô tả FR/AC, ảnh hưởng, rollback.

## Ký xác nhận

- [ ] Tác giả: đã tự review diff.
- [ ] Reviewer: đã kiểm tra C1–C9 + tenant/audit.
- [ ] Ngày/PR link: ...
