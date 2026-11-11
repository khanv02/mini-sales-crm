# Pulse CRM

**Mini CRM cho đội sales** — khách hàng, pipeline và cơ hội bán hàng trên một màn hình duy nhất.

> **Trạng thái**: sản phẩm đang được xây dựng theo lộ trình. Tài liệu này mô tả sản phẩm ở góc độ người dùng;
> bản demo sẽ được công bố khi hoàn tất giai đoạn đầu.

## 1. Vấn đề

Đội sales nhỏ thường quản lý khách hàng rải rác trên Excel, chat và email, dẫn tới:

- Không biết cơ hội bán hàng đang ở bước nào và ai đang phụ trách.
- Quên follow-up vì không có gì nhắc khi công việc quá hạn.
- Cuối tháng phải tổng hợp số liệu bằng tay.
- Dữ liệu khách hàng không được bảo vệ: người này xem được dữ liệu của người kia.

Pulse CRM gom tất cả vào một nơi, gọn nhẹ, phù hợp đội 3–20 người.

## 2. Tính năng chính

**Khách hàng**

- Hồ sơ khách hàng: tên, email, điện thoại, công ty, nguồn.
- Tìm kiếm tức thời theo tên/email/công ty, hỗ trợ tiếng Việt có dấu và không dấu.
- Phân chia khách hàng theo người phụ trách; xóa mềm để không mất lịch sử.

**Pipeline & cơ hội bán hàng**

- Bảng kanban kéo–thả theo từng bước bán hàng; cấu hình bước linh hoạt.
- Mỗi cơ hội: giá trị, ngày dự kiến chốt, người phụ trách, trạng thái thắng/thua kèm lý do.
- Hai người thao tác cùng lúc trên một cơ hội: hệ thống phát hiện xung đột và yêu cầu tải lại thay vì ghi đè.

**Hoạt động & công việc**

- Ghi chú, cuộc gọi, email theo từng cơ hội (dòng thời gian).
- Công việc có hạn và người thực hiện; nhắc tự động khi sắp đến hạn hoặc quá hạn.
- Thông báo trong ứng dụng theo thời gian thực.

**Báo cáo**

- Khách hàng mới, giá trị pipeline, tỷ lệ thắng, doanh thu dự kiến theo tháng.
- Lọc theo khoảng thời gian, người phụ trách và pipeline.

**Tích hợp & trợ lý AI**

- Import khách hàng từ CSV, chống trùng khi import lại cùng một tệp.
- Nhận lead từ form web bên ngoài qua webhook có xác thực chữ ký và chống gửi lặp.
- Email nhắc việc nội bộ.
- Trợ lý AI: tóm tắt tình hình cơ hội, soạn nháp email follow-up, chấm điểm tiềm năng khách hàng — có hạn mức
  chi phí và không tự gửi email.

**Quản trị**

- Thêm hoặc vô hiệu hóa thành viên, phân quyền theo vai trò.
- Nhật ký hoạt động (ai làm gì, khi nào) và xuất dữ liệu CSV.

## 3. Vai trò & quyền

| Vai trò | Phạm vi |
| --- | --- |
| Quản trị viên | Toàn bộ dữ liệu trong tổ chức; quản lý thành viên, pipeline, tích hợp, nhật ký, xuất dữ liệu |
| Quản lý | Khách hàng và cơ hội bán hàng của cả đội; phân công, xem báo cáo, xuất dữ liệu |
| Nhân viên sales | Chỉ khách hàng và cơ hội của mình; tự xử lý công việc được giao |

Dữ liệu của mỗi tổ chức được tách biệt hoàn toàn: không vai trò nào xem được dữ liệu của tổ chức khác.

## 4. Một luồng làm việc điển hình

1. Tạo khách hàng mới bằng tay, import CSV hoặc nhận từ webhook.
2. Tạo cơ hội bán hàng gắn với khách hàng, đặt giá trị và ngày dự kiến chốt.
3. Ghi lại các trao đổi và tạo công việc follow-up có hạn.
4. Kéo cơ hội qua các bước khi khách hàng tiến triển.
5. Chốt thắng/thua (thua phải ghi lý do) — báo cáo và dashboard cập nhật ngay.

## 5. Bảo mật & độ tin cậy

- Tách biệt dữ liệu theo tổ chức ở tầng cơ sở dữ liệu, không chỉ ở tầng ứng dụng.
- Phân quyền theo vai trò và quyền sở hữu dữ liệu; với người không có quyền, dữ liệu được coi như không tồn tại.
- Nhật ký hoạt động không thể sửa hoặc xóa, được ghi trong cùng giao dịch với thay đổi dữ liệu.
- Mật khẩu lưu dưới dạng hash mạnh; phiên đăng nhập ngắn hạn và được gia hạn an toàn.
- Bí mật của các tích hợp được mã hóa; log không chứa thông tin nhạy cảm.
- Tác vụ nặng (import, webhook, email, AI) chạy nền nên không làm chậm thao tác của người dùng.

## 6. Lộ trình

| Giai đoạn | Nội dung |
| --- | --- |
| 1 | Nền tảng kỹ thuật: môi trường chạy, cơ sở dữ liệu, kiểm thử tự động, tích hợp liên tục |
| 2 | Lõi CRM: khách hàng, pipeline, cơ hội bán hàng, hoạt động, báo cáo |
| 3 | Vận hành: cập nhật thời gian thực, import, webhook, email nhắc việc, nhật ký, xuất dữ liệu |
| 4 | Trợ lý AI: tóm tắt, nháp email, chấm điểm tiềm năng, kiểm soát chi phí |
| 5 | Đưa lên môi trường thật: triển khai, sao lưu, giám sát |

## 7. Công nghệ

**Giao diện (frontend)**

- React + TypeScript, đóng gói bằng Vite: ứng dụng nội bộ chạy nhanh, dễ mở rộng.
- TanStack Query: đồng bộ dữ liệu với máy chủ và tự làm mới khi có thay đổi.
- Tailwind CSS + shadcn/ui: giao diện thống nhất, dễ tùy biến.
- dnd-kit: kéo–thả thẻ trên bảng kanban mượt, phản hồi tức thời.
- React Router: điều hướng giữa các màn hình khách hàng, pipeline, báo cáo.

**Máy chủ (backend)**

- NestJS + TypeScript: tách module rõ ràng theo nghiệp vụ (khách hàng, cơ hội, công việc, báo cáo, tích hợp, AI).
- PostgreSQL: cơ sở dữ liệu chính; Prisma quản lý schema và migration.
- Redis: hàng đợi tác vụ nền và bộ nhớ đệm cho báo cáo.
- BullMQ: xử lý nền import, webhook, email nhắc việc và chấm điểm AI, không chặn thao tác của người dùng.

**Cập nhật trực tiếp**

- Socket.IO: đẩy thay đổi bảng kanban và thông báo tới đúng người có quyền.
- Streaming: trả dần kết quả trợ lý AI ngay khi máy chủ bắt đầu sinh câu trả lời.

**Trợ lý AI**

- Tích hợp qua lớp adapter: có thể thay nhà cung cấp mô hình mà không đổi nghiệp vụ.
- Chỉ tóm tắt, soạn nháp và chấm điểm; người dùng quyết định trước khi gửi.

## 8. Liên hệ

Sản phẩm đang trong giai đoạn phát triển. Cần bản demo hoặc trao đổi thêm, vui lòng liên hệ tác giả.


