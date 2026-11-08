# Checklist — PR Review

## Phạm vi

- [ ] PR nhỏ, một feature/task group; không trộn refactor lớn.
- [ ] Tiêu đề/commit có `FR-xx`/`Txxx`.
- [ ] Mô tả: AC nào, cách test, ảnh hưởng schema/API, rollback.
- [ ] Không có code chết/TODO không lý do.

## Kiến trúc

- [ ] Controller không gọi Prisma/DB trực tiếp.
- [ ] Service chứa nghiệp vụ/transaction/audit; repository chứa query.
- [ ] Không import chéo repository giữa module.
- [ ] Không thêm dependency lớn không lý do.
- [ ] TypeScript strict; không `any` không comment.

## Dữ liệu

- [ ] `org_id` trong query mới; composite FK.
- [ ] Migration có version; không sửa migration đã merge.
- [ ] Index cho query mới; không N+1.
- [ ] Audit trong transaction; redaction.
- [ ] Idempotency/version nếu có.

## Test

- [ ] Test happy + lỗi + role + tenant.
- [ ] Test đỏ trước (hoặc giải thích).
- [ ] Không mock DB ở integration.
- [ ] Coverage không giảm dưới ngưỡng.
- [ ] E2E cập nhật nếu UI.

## Bảo mật

- [ ] Input validate; output không lộ secret/PII.
- [ ] Log redaction; không token/password.
- [ ] Rate limit/cache/queue đúng.
- [ ] Checklist security đã chạy nếu feature nhạy cảm.

## Tài liệu

- [ ] Spec/plan/tasks/traceability cập nhật.
- [ ] OpenAPI/events/data-model khớp.
- [ ] ADR nếu quyết định mới.
- [ ] README/quickstart nếu lệnh/env đổi.

## Trước khi merge

- [ ] CI xanh.
- [ ] Ít nhất 1 reviewer (hoặc self-review có ghi chú nếu solo).
- [ ] Không conflict; rebase sạch.
- [ ] Demo/seed chạy.
