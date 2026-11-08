# ADR-012 — Room realtime theo role/user, không broadcast toàn org

- **Trạng thái**: Proposed (bắt buộc trước khi code FR-09)
- **Ngày**: 2026-11-08
- **Nguồn**: FR-09, mục 5
- **Liên quan**: ADR-007, SCR-008

## Bối cảnh

Spec nói phát sự kiện tới `room org_id`. Nhưng Sales chỉ được thấy deal mình sở hữu. Nếu mọi Sales trong
org nhận `deal.moved`, họ biết deal/stage/giá trị của người khác — vi phạm RBAC và quy tắc bất biến về
tenant/quyền.

## Quyết định

Không dùng room chung `org:{orgId}` cho dữ liệu nghiệp vụ. Dùng:

| Room | Ai | Event |
| --- | --- | --- |
| `user:{userId}` | user | deal của mình, task, notification |
| `org:{orgId}:managers` | Manager/Admin | mọi deal/import/webhook event trong org |
| `org:{orgId}:system` | tất cả | thông báo không chứa dữ liệu nghiệp vụ |

Khi deal đổi owner: phát cho owner cũ, owner mới, và managers. Không phát cho toàn org.

## Hệ quả

**Tích cực**

- Tuân thủ RBAC; Sales không thấy deal người khác.
- Payload tối giản; giảm rò rỉ.
- Manager vẫn có realtime toàn đội.

**Tiêu cực / đánh đổi**

- Logic chọn room phức tạp hơn broadcast.
- Nếu role thay đổi, phải re-join/leave room (reconnect hoặc server cập nhật).
- Nhiều socket/room hơn; cần test kỹ.

## Quy tắc

- Server tự join room từ JWT; client không gửi room.
- Manager/Admin join `org:{orgId}:managers`; Sales không.
- Khi đổi role: disconnect socket hoặc emit `role.changed` để client reconnect.
- Event `deal.assigned` phải tới cả owner cũ (nếu còn active) và owner mới.
- Test: Sales B không nhận event deal của Sales A; Manager nhận; owner cũ nhận assign.
- Không đưa title/value/email vào payload; client có quyền refetch.

## Phương án đã loại

- **Broadcast org**: vi phạm quyền.
- **Chỉ room user**: Manager không thấy realtime đội.
- **Lọc ở client**: dữ liệu đã tới client, không an toàn.
