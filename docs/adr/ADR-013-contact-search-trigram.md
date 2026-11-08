# ADR-013 — Tìm kiếm contact bằng `pg_trgm` + `unaccent`

- **Trạng thái**: Proposed
- **Ngày**: 2026-11-08
- **Nguồn**: FR-03, mục 6
- **Liên quan**: NFR-01

## Bối cảnh

FR-03 yêu cầu tìm theo tên/email/công ty, p95 < 300ms với 10.000 contact. PostgreSQL full-text mặc định
(`to_tsvector`) không xử lý tốt tiếng Việt, đặc biệt tìm một phần từ, có dấu/không dấu, và tên công ty.

## Quyết định

Dùng trigram:

- Extension `pg_trgm` + `unaccent`.
- GIN index trên `lower(name)`, `lower(coalesce(email,''))`, `lower(coalesce(company,''))`.
- Query `ILIKE '%' || unaccent(lower($term)) || '%'` (hoặc `%` operator) trên các cột đã chuẩn hóa.
- Kết hợp filter owner/org và phân trang cursor.
- Giới hạn term 2–100 ký tự; bỏ ký tự wildcard đặc biệt nếu cần.

## Hệ quả

**Tích cực**

- Tìm substring, tiếng Việt có/không dấu tốt hơn full-text mặc định.
- Index trigram hiệu quả cho 10k–100k bản ghi.
- Đơn giản, dễ giải thích.

**Tiêu cực / đánh đổi**

- Index lớn hơn B-tree; ghi chậm hơn một chút.
- Không xếp hạng relevance như full-text.
- `unaccent` là immutable? Cần biểu thức index đúng; có thể phải tạo cột chuẩn hóa nếu hàm không immutable.

## Đối sách

- Nếu `unaccent` không dùng được trong index, lưu cột generated `search_text` (lower, unaccent) và index
  trigram trên đó. Quyết định cuối cùng khi implement migration, có test EXPLAIN.
- Đo p95 bằng seed 10k; nếu vượt, cân nhắc materialized column hoặc giới hạn trường tìm.

## Phương án đã loại

- **Full-text `tsvector`**: kém với tiếng Việt và substring.
- **`LIKE` không index**: full scan, không đạt p95.
- **Elasticsearch/Meilisearch**: thêm hạ tầng, không cần.
