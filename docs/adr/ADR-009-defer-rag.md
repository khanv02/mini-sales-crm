# ADR-009 — Hoãn FR-20 (RAG) khỏi M3

- **Trạng thái**: Proposed (cần duyệt trước M3)
- **Ngày**: 2026-11-08
- **Nguồn**: spec Q4, FR-20
- **Liên quan**: FR-16–FR-19

## Bối cảnh

FR-20 (hỏi đáp trên ghi chú bằng RAG, pgvector, trích dẫn nguồn) là tùy chọn. M3 đã có 4 tính năng AI
(summary, email draft, lead score, cost control) chiếm 2 tuần. RAG thêm embedding pipeline, chunking,
retrieval, citation, eval — vượt quá thời lượng và làm loãng mục tiêu portfolio.

## Quyết định

**Không làm FR-20 trong M3.** Giữ schema/kiến trúc sẵn sàng (PostgreSQL + pgvector có thể bật), nhưng không
thêm endpoint/UI/embedding. Nếu làm sau, cần ADR mới + spec mới.

## Hệ quả

**Tích cực**

- M3 tập trung vào streaming, quota, cost, eval — những thứ đo được.
- Giảm rủi ro chi phí LLM và phạm vi.
- Vẫn có thể mở rộng sau với dữ liệu đã có.

**Tiêu cực / đánh đổi**

- Portfolio thiếu một tính năng “AI nâng cao”.
- Nếu người dùng kỳ vọng RAG, cần truyền thông rõ.

## Điều kiện làm lại

- M3 đã xong và ổn định.
- Có dataset notes đủ lớn, sạch.
- Có ngân sách embedding + lưu vector.
- Có eval retrieval/citation rõ.
- ADR mới phê duyệt.

## Phương án đã loại

- **Làm RAG trong M3**: scope creep, giảm chất lượng các FR bắt buộc.
- **Bỏ hẳn**: giữ optional cho tương lai.
