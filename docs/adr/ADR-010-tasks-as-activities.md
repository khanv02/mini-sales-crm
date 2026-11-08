# ADR-010 — Task là activity `type='task'`

- **Trạng thái**: Proposed (cần duyệt trước M1)
- **Ngày**: 2026-11-08
- **Nguồn**: FR-07, mục 6 và 8
- **Liên quan**: SCR-004

## Bối cảnh

Spec có bảng `activities` với `type (note/call/email/task)`, `due_at`, `done_at`, `assignee_id`, đồng thời
có endpoint `GET /tasks?status=overdue` nhưng không có bảng `tasks`. Cần chọn: thêm bảng riêng hay coi task
là một loại activity.

## Quyết định

Giữ **một** bảng `activities`. Task là activity `type='TASK'` với ràng buộc:

- `due_at` bắt buộc.
- `assignee_id` bắt buộc.
- `done_at` chỉ có khi task.
- `content` là tiêu đề/mô tả task.

`GET /tasks` là projection (view logic) của activities, không phải entity mới. `PATCH /tasks/:id` cập nhật
`done_at`, `due_at`, `assignee_id`, `content` trên activity tương ứng.

## Hệ quả

**Tích cực**

- Không trùng lặp dữ liệu/timeline.
- Một bảng cho hoạt động và task; báo cáo/timeline đơn giản.
- Ít migration, ít code.

**Tiêu cực / đánh đổi**

- Task luôn gắn với deal (spec hiện tại); không hỗ trợ task độc lập.
- Query task cần filter `type='TASK'` + partial index.
- Nếu sau này cần task template/subtask, phải mở ADR.

## Quy tắc

- Index partial `(org_id, assignee_id, due_at) WHERE type='TASK' AND done_at IS NULL`.
- Không cho tạo task không có deal trong MVP.
- Notification/email dựa trên task activity.
- Nếu cần task độc lập: thêm `deal_id nullable` + migration + ADR, không tạo bảng song song.

## Phương án đã loại

- **Bảng `tasks` riêng**: trùng timeline, phải đồng bộ 2 nơi, tăng phức tạp.
- **Chỉ dùng task, bỏ activity**: mất note/call/email timeline.
