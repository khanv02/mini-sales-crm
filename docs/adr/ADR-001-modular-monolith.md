# ADR-001 — Modular monolith

- **Trạng thái**: Accepted
- **Ngày**: 2026-11-08
- **Nguồn**: spec mục 4
- **Liên quan**: C2, C7, NFR-03

## Bối cảnh

Dự án một người làm, cần chạy/deploy đơn giản, nhưng vẫn muốn ranh giới module rõ để có thể tách sau.
Microservices tăng chi phí vận hành, tracing, deploy, và không cần cho quy mô 3–20 sales/org.

## Quyết định

Xây một NestJS app duy nhất, chia module theo bounded context: auth, users, contacts, pipeline, deals,
activities, notifications, imports, webhooks, reports, audit, ai. Mỗi module có controller/service/
repository riêng; giao tiếp qua service công khai hoặc domain event nội bộ. Worker BullMQ chạy trong cùng
process ở MVP, có thể tách process sau mà không đổi contract.

## Hệ quả

**Tích cực**

- Một repo, một pipeline CI, một Docker image; deploy đơn giản.
- Transaction xuyên module dễ (audit + nghiệp vụ).
- Debug một process; phù hợp portfolio và thời gian.

**Tiêu cực / đánh đổi**

- Scale từng phần kém; một module lỗi có thể ảnh hưởng toàn app.
- Ranh giới module dễ bị phá nếu import chéo repository.
- Worker nặng có thể tranh CPU với API nếu chạy chung.

## Đối sách

- Cấm import chéo repository; chỉ dùng service/event.
- Tách worker thành process riêng khi tải tăng (cùng codebase, khác entrypoint).
- Giữ module không phụ thuộc vòng; review dependency graph ở M4.

## Phương án đã loại

- **Microservices**: quá nhiều hạ tầng cho một người, không có nhu cầu scale độc lập.
- **Express thuần**: phải tự dựng DI, guard, validation, module; Nest đã có.
