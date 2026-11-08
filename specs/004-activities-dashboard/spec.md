# Feature Specification: Activities, Tasks & Dashboard

**Feature Branch**: `004-activities-dashboard`
**Created**: 2026-11-08
**Status**: Draft
**Input**: FR-07, FR-08; ADR-010; SCR-011; NFR-01

## User Scenarios & Testing

### US-1 — Ghi hoạt động trên deal (Priority: P1)

Sales ghi note/cuộc gọi/email vào timeline deal; Manager/Admin xem được timeline trong org.

**Vì sao P1**: Không có lịch sử tương tác thì CRM chỉ là bảng giá trị; đây là dữ liệu cho AI sau này.

**Kiểm thử độc lập**: Tạo note/call trên deal; list timeline; kiểm tra quyền và audit.

**Acceptance Scenarios**:

1. **AC-FR07-01** Given deal của mình, When tạo activity `NOTE`/`CALL`/`EMAIL` với content, Then `201`,
   `created_by` = mình, audit `ACTIVITY_CREATED`; timeline trả mới nhất trước.
2. **AC-FR07-02** Given Sales B, When tạo activity trên deal Sales A, Then `404`; Manager/Admin tạo được.
3. **AC-FR07-03** Given activity, When list `GET /deals/:id/activities?limit=...`, Then cursor pagination,
   đúng thứ tự, không lẫn activity org khác.
4. **AC-FR07-04** Given activity của mình, When sửa content, Then `200`, audit before/after; người khác sửa →
   `404`/`403` theo quyền.

---

### US-2 — Task và nhắc quá hạn (Priority: P1)

Sales tạo task có hạn/assignee; task quá hạn hiện trong danh sách và sinh thông báo.

**Vì sao P1**: FR-07 AC chính; chống quên follow-up là lý do sản phẩm tồn tại.

**Kiểm thử độc lập**: Tạo task due quá khứ; gọi `/tasks?status=overdue`; kiểm tra notification.

**Acceptance Scenarios**:

1. **AC-FR07-05** Given deal, When tạo `TASK` với `dueAt` + `assigneeId` cùng org, Then `201`, task hiện
   trong timeline và `/tasks` của assignee.
2. **AC-FR07-06** Given thiếu `dueAt` hoặc assignee, When tạo task, Then `400 TASK_DUE_REQUIRED`/
   `TASK_ASSIGNEE_REQUIRED`; không ghi DB.
3. **AC-FR07-07** Given task chưa xong, When assignee đánh dấu done, Then `done_at` set, task rời overdue;
   đánh dấu lần 2 idempotent (200) hoặc 409 theo quy ước; audit.
4. **AC-FR07-08** Given task quá hạn (`due_at < now`, `done_at null`), When scheduler quét, Then task có trong
   `/tasks?status=overdue` và tạo **một** notification `TASK_OVERDUE` (dedupe), không spam mỗi phút.
5. **AC-FR07-09** Given Sales B, When xem/sửa task của Sales A, Then `404`; Manager/Admin xem được task
   trong org; chỉ assignee/creator được đánh dấu done (Manager/Admin được override).
6. **AC-FR07-10** Given Admin org B, When đọc activity/task org A, Then `404`; DB không đổi.

---

### US-3 — Dashboard (Priority: P2)

Manager/Sales xem lead mới, deal theo stage, tổng pipeline, tỷ lệ thắng, forecast theo tháng; lọc thời gian/owner.

**Vì sao P2**: Cần cho G2, nhưng kanban + task đã đủ demo M1 lõi.

**Kiểm thử độc lập**: Seed nhiều deal WON/LOST/OPEN; gọi summary; đối chiếu số liệu tính tay.

**Acceptance Scenarios**:

1. **AC-FR08-01** Given contacts tạo trong khoảng, When summary, Then `newLeads` = số contact có
   `created_at` trong khoảng (đã xóa mềm không tính).
2. **AC-FR08-02** Given deal OPEN, When summary, Then `dealsByStage` group theo stage, chỉ deal tạo trong
   khoảng và còn OPEN; count + value đúng.
3. **AC-FR08-03** Given deal OPEN, When summary, Then `pipelineValue` = tổng `value` của deal OPEN trong
   khoảng/lọc owner; không gồm WON/LOST.
4. **AC-FR08-04** Given deal WON/LOST, When summary, Then `winRate = won / (won + lost)` theo `closed_at`
   trong khoảng; không có deal đóng → 0 (không chia 0).
5. **AC-FR08-05** Given deal OPEN có `expected_close`, When summary, Then `forecastByMonth` = tổng value
   theo tháng `expected_close` trong 6 tháng kể from; deal không có expected_close bị bỏ qua.
6. **AC-FR08-06** Given filter `from/to/ownerId/pipelineId`, When summary, Then áp dụng đúng; `from > to` hoặc
   > 366 ngày → `400 INVALID_DATE_RANGE`/`REPORT_RANGE_TOO_LARGE`.
7. **AC-FR08-07** Given Sales, When summary, Then chỉ số liệu owner = mình; `ownerId` khác bị bỏ qua/403;
   Manager/Admin thấy toàn org hoặc filter owner.
8. **AC-FR08-08** Given Admin org B, When summary, Then không thấy dữ liệu org A.
9. **AC-FR08-09** Given 5.000 deal, When summary, Then p95 < 300ms; không N+1; số liệu khớp query SQL.

### Edge Cases

- Deal WON nhưng `closed_at` null do dữ liệu cũ → không tính win rate; log warn; migration backfill nếu cần.
- `expected_close` quá khứ → vẫn vào tháng tương ứng; forecast có thể âm thời gian, UI ghi rõ.
- Currency khác org (dữ liệu cũ) → cộng theo org currency; log warn; không quy đổi.
- Contact xóa mềm sau khi tạo → không tính newLeads.
- Task quá hạn nhưng assignee inactive → vẫn tạo notification cho assignee? Không gửi email; notification DB
  vẫn tạo cho Admin/Manager? Quyết định: chỉ assignee; nếu inactive, skip email, vẫn giữ task overdue.
- Scheduler chạy đồng thời 2 instance → dedupe unique key bảo vệ.
- Date range qua timezone org → tính theo `Asia/Ho_Chi_Minh`; API nhận `from/to` date.
- Dashboard rỗng → trả số 0/array rỗng, không 404.
- Activity content chứa HTML/script → lưu text, render escape.

## Requirements

### Functional Requirements

**Activities & tasks**

- **FR-07.1**: Tạo activity `NOTE/CALL/EMAIL/TASK` gắn deal; content 1–10.000; author = current.
- **FR-07.2**: Task bắt buộc `due_at` + `assignee_id`; assignee active cùng org; done_at khi hoàn thành.
- **FR-07.3**: Timeline list theo `created_at desc, id desc`, cursor; filter type.
- **FR-07.4**: `/tasks` filter `status=open|overdue|done`, `assigneeId` (Manager/Admin), `dueFrom/To`;
  Sales mặc định assignee = mình.
- **FR-07.5**: Scheduler mỗi phút tạo notification overdue/due sớm với `dedupe_key`; không trùng.
- **FR-07.6**: Audit mọi create/update activity; task done audit.
- **FR-07.7**: RBAC/tenant theo permissions matrix.

**Dashboard**

- **FR-08.1**: `GET /reports/summary?from&to&ownerId&pipelineId` trả:
  `newLeads`, `dealsByStage[]`, `pipelineValue`, `winRate`, `forecastByMonth[]`, `generatedAt`.
- **FR-08.2**: Công thức theo SCR-011/AC-FR08-01..05; ghi rõ trong response metadata/README.
- **FR-08.3**: Sales ép owner = mình; Manager/Admin filter owner tùy chọn; pipeline filter tùy chọn.
- **FR-08.4**: Date range mặc định tháng hiện tại; tối đa 366 ngày; timezone org.
- **FR-08.5**: Query aggregate ở DB, không N+1; index theo data-model; cache 60s ở 007.
- **FR-08.6**: Không trả PII contact; chỉ số tổng hợp.

### Key Entities

- Activity (gồm task), Notification; Deal/Stage/Contact cho aggregate. Chi tiết `docs/data-model.md`.

### Công thức chính thức (SCR-011)

```text
from, to = ngày theo timezone org (mặc định: đầu tháng → hôm nay)
newLeads = count(contacts where created_at in [from,to] and deleted_at is null)
dealsByStage = group(open deals where created_at in [from,to]) by stage
pipelineValue = sum(open deals.value where created_at in [from,to])
winRate = won / (won + lost) where closed_at in [from,to]; nếu mẫu = 0 → 0
forecastByMonth = group(open deals where expected_close in [from, from+6 tháng]) by month
```

## Success Criteria

- **SC-001**: Tạo task + thấy overdue + notification trong < 2 phút (scheduler 1 phút).
- **SC-002**: Dashboard khớp 100% với tính tay trên seed; p95 < 300ms.
- **SC-003**: 100% AC có test; 100% endpoint có tenant/role test.
- **SC-004**: 0 notification trùng khi scheduler chạy 10 lần.

## Assumptions

- Task luôn gắn deal (ADR-010); chưa có task độc lập.
- Notification DB là nguồn sự thật; realtime/email là kênh phụ (005/006).
- Dashboard MVP dùng tiền tệ org, không quy đổi.
- `expected_close` là ngày dự kiến chốt, do sales nhập.
- Scheduler chạy trong process API MVP; có thể tách worker.

## Out of Scope

- Activity attachments/file, mention, comment thread.
- Recurring task, subtask, checklist.
- Weighted forecast theo xác suất stage.
- Export dashboard (feature 007 export contact/deal).
- Custom dashboard builder.

## Traceability

| Nguồn | AC | Task |
| --- | --- | --- |
| FR-07 | AC-FR07-01..10 | T300–T310, T316–T317, T319 |
| FR-08 | AC-FR08-01..09 | T311–T315, T318–T319 |
| NFR-01 | AC-NFR01-01..02 | T312, T607 |
