# ADR-014 — Position bằng fractional indexing

- **Trạng thái**: Proposed
- **Ngày**: 2026-11-08
- **Nguồn**: FR-05
- **Liên quan**: ADR-005

## Bối cảnh

Kanban cần chèn card vào giữa hai card khác. Nếu dùng integer `position` và reindex toàn stage mỗi lần kéo,
ta phải update nhiều row trong transaction, tăng khóa và xung đột. Spec chỉ nói `position`, không nói kiểu.

## Quyết định

Dùng `position numeric(20,10)`:

- Client gửi `position` là index đích (0-based) trong stage.
- Server lấy neighbor trước/sau, tính midpoint: `(prev + next) / 2`; nếu đầu/cuối thì `prev - 1` / `next + 1`.
- Nếu khoảng giữa quá nhỏ (< 1e-9) → rebalance toàn stage trong transaction (hiếm), giữ thứ tự.
- Sort `(position asc, id asc)` để ổn định khi trùng.
- `version` của deal bảo vệ xung đột cùng deal; hai deal khác nhau có thể trùng position, tie-break id.

## Hệ quả

**Tích cực**

- Move chỉ update 1 row (trừ rebalance hiếm).
- Không khóa toàn stage; phù hợp kéo thả.
- Chèn giữa dễ, không cần integer gap.

**Tiêu cực / đánh đổi**

- `numeric` chậm hơn integer một chút; index lớn hơn.
- Cần xử lý rebalance và test precision.
- Client phải hiểu position là index đích, server trả position thực.

## Quy tắc

- Không unique `(stage_id, position)` vì có thể trùng khi đua; sort tie-break.
- Khi move sang stage mới, tính position trong stage đích.
- Rebalance trong transaction, audit một lần move (không audit từng row).
- Test: chèn đầu/giữa/cuối; 100 lần chèn liên tiếp vẫn giữ thứ tự; rebalance khi precision cạn.

## Phương án đã loại

- **Integer + reindex**: ghi nhiều, khóa, chậm.
- **LexoRank string**: tốt nhưng phức tạp hơn, khó debug; không cần.
- **Float**: precision kém, dễ trùng.
