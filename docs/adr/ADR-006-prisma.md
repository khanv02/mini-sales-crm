# ADR-006 — Dùng Prisma làm ORM

- **Trạng thái**: Proposed (cần duyệt trước M1)
- **Ngày**: 2026-11-08
- **Nguồn**: spec Q1
- **Liên quan**: NFR-05, NFR-07

## Bối cảnh

Spec chọn PostgreSQL + Prisma nhưng để Q1 mở (Prisma hay Drizzle). Cần ORM type-safe, migration rõ, dễ dùng
với NestJS và AI code, đồng thời đủ khả năng viết SQL thô cho báo cáo/perf.

## Quyết định

Chọn **Prisma**. Dùng `prisma migrate` cho migration có version; `prisma db seed`; Prisma Client trong
repository. Truy vấn phức tạp (dashboard, search) dùng `$queryRaw` tham số hóa, vẫn nằm trong repository.

## Hệ quả

**Tích cực**

- Type-safety tốt, generated client khớp schema.
- Migration/version rõ, rollback qua migration SQL.
- Hệ sinh thái lớn, tài liệu nhiều, dễ tuyển dụng/giải thích.
- Hỗ trợ transaction interactive cho audit.

**Tiêu cực / đánh đổi**

- Ít linh hoạt hơn Drizzle ở SQL thô; generated client nặng.
- Một số tính năng PostgreSQL (partial index, trigram, composite FK) phải viết migration SQL thủ công.
- `$queryRaw` vẫn cần review tenant.

## Đối sách

- Partial index/trigram/composite FK: viết trong migration SQL, giữ `schema.prisma` đồng bộ bằng
  `@@index`/`@@unique` khi có thể; test migration từ DB trống.
- Query phức tạp: raw SQL + test EXPLAIN; không lạm dụng ORM.
- Khóa version Prisma trong lockfile; nâng cấp có ADR nếu breaking.

## Phương án đã loại

- **Drizzle**: nhẹ, SQL-first, nhưng ecosystem/tài liệu và migration workflow kém quen hơn; đổi lại không
  có lợi ích rõ cho quy mô này.
- **TypeORM**: dễ lệch schema, ít type-safe hơn.
- **SQL thuần**: kiểm soát tốt nhưng tốn thời gian, dễ sai mapping.

## Kiểm chứng

- `pnpm db:migrate` từ DB trống tạo đúng schema.
- `prisma migrate diff` không có drift trong CI.
- Query dashboard/search có test perf và EXPLAIN.
