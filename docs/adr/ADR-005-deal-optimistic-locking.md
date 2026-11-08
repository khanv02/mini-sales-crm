# ADR-005 — Optimistic locking cho deal

- **Trạng thái**: Accepted
- **Ngày**: 2026-11-08
- **Nguồn**: spec mục 4, FR-05
- **Liên quan**: ADR-014

## Bối cảnh

Kanban cho phép nhiều người kéo cùng một deal. Nếu update “last write wins”, người sau ghi đè âm thầm lên
thay đổi của người trước (mất dữ liệu, audit sai).

## Quyết định

Dùng cột `deals.version` (integer, default 1). Mọi update/move gửi kèm `version` hiện tại. Repository thực
hiện:

```sql
UPDATE deals
SET stage_id = $1, position = $2, version = version + 1, ...
WHERE id = $3 AND org_id = $4 AND version = $5;
```

Nếu `rowCount = 0`: đọc lại deal; nếu tồn tại → `409 DEAL_VERSION_CONFLICT` kèm `currentVersion`; nếu
không → 404. Không retry tự động cho move của người dùng.

## Hệ quả

**Tích cực**

- Không ghi đè âm thầm; client biết xung đột và tải lại.
- Không cần khóa bi quan, phù hợp tải đọc nhiều.
- Audit chỉ ghi mutation thắng.

**Tiêu cực / đánh đổi**

- Client phải gửi version và xử lý 409.
- Mọi update deal phải tăng version; quên → mất bảo vệ.
- Không giải quyết xung đột vị trí giữa hai deal khác nhau (chấp nhận tie-break).

## Quy tắc

- `version` chỉ tăng ở server; client không được set.
- `PATCH /deals/:id` và `/move` đều dùng version.
- Update hàng loạt (import/assign) không dùng version; dùng transaction + audit.
- UI: optimistic update, rollback + toast khi 409, refetch deal/board.
- Test đua 2 request cùng version → một 200, một 409; DB nhất quán.

## Phương án đã loại

- **Pessimistic lock**: giữ transaction/row lock lâu, dễ deadlock, không cần.
- **Last write wins**: vi phạm AC và trải nghiệm.
