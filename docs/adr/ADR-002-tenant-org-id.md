# ADR-002 — Multi-tenant bằng cột `org_id` (shared schema)

- **Trạng thái**: Accepted
- **Ngày**: 2026-11-08
- **Nguồn**: spec mục 4, C3
- **Liên quan**: NFR-02, SCR-001

## Bối cảnh

Cần cách ly dữ liệu giữa các tổ chức với chi phí thấp, phù hợp đồ án và quy mô nhỏ. Các lựa chọn:
database-per-tenant, schema-per-tenant, shared schema + `org_id`.

## Quyết định

Dùng shared schema: mọi bảng nghiệp vụ có `org_id`; mọi truy vấn lọc theo org lấy từ JWT. Dùng composite
FK `(org_id, id)` để CSDL chặn tham chiếu chéo tenant. Bổ sung `org_id` cho `stages` (SCR-001).

## Hệ quả

**Tích cực**

- Một migration, một connection pool, backup đơn giản.
- Dễ query báo cáo toàn org; chi phí hạ tầng thấp.
- Composite FK tạo “lưới an toàn” ở DB, không chỉ ở code.

**Tiêu cực / đánh đổi**

- Rủi ro quên `org_id` ở một truy vấn → lộ dữ liệu.
- Không cách ly vật lý; một lỗi SQL có thể ảnh hưởng nhiều org.
- Index phải bắt đầu bằng `org_id`; có thể phình.

## Đối sách bắt buộc

- Repository nhận `orgId` tường minh; không `findUnique({id})` cho dữ liệu nghiệp vụ.
- Test cách ly tenant cho **mọi** endpoint (org B gọi ID org A → 404).
- `$queryRaw` phải có `org_id = $1`; review thủ công.
- Composite FK + unique `(org_id,id)` trên bảng cha.
- Không dùng `orgId` từ body/query/header.

## Phương án đã loại

- **Schema-per-tenant**: migration N lần, connection phức tạp, không cần.
- **Database-per-tenant**: chi phí vận hành cao, khó báo cáo chéo (không cần).
