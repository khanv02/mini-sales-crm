# Pulse CRM

**Mini CRM cho đội sales** — khách hàng, pipeline và cơ hội bán hàng trên một màn hình duy nhất.

> **Trạng thái**: sản phẩm đang được xây dựng theo lộ trình. Phần nền tảng kỹ thuật, đăng nhập và quản lý
> thành viên đã chạy được; các phần CRM còn lại đang trong quá trình phát triển. Tài liệu này mô tả sản phẩm ở
> góc độ người dùng.

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

Sản phẩm gồm hai ứng dụng tách riêng — giao diện và máy chủ — dùng chung một gói kiểu dữ liệu và quy tắc
kiểm tra đầu vào, để hai bên không bao giờ lệch nhau về hợp đồng dữ liệu.

### 7.1. Giao diện (frontend)

| Thành phần | Công nghệ | Dùng để làm gì |
| --- | --- | --- |
| Ngôn ngữ | TypeScript | Kiểu dữ liệu chặt, hạn chế lỗi khi refactor |
| Thư viện UI | React 19 | Xây dựng giao diện theo component |
| Build tool | Vite 6 | Chạy dev server tức thời, build ra bundle tĩnh |
| Gọi API & cache | TanStack Query 5 | Đồng bộ dữ liệu với máy chủ, tự làm mới sau khi ghi |
| Điều hướng | React Router 7 | Chuyển màn hình khách hàng, pipeline, báo cáo |
| Giao diện & style | Tailwind CSS 3 | Hệ thống style nhất quán, không viết CSS rời rạc |
| Component nền | Bộ UI tự dựng theo phong cách shadcn/ui | Nút, thẻ, ô nhập dùng chung toàn ứng dụng |
| Icon | lucide-react | Bộ icon nhẹ, đồng bộ nét vẽ |
| Kiểm thử | Vitest + Testing Library | Test component và luồng phía client |
| Kiểm thử E2E | Playwright | Chạy thử luồng chính trên trình duyệt thật |

Thành phần sẽ bổ sung khi làm phần pipeline: **dnd-kit** cho kéo–thả thẻ trên bảng kanban.

### 7.2. Máy chủ (backend)

| Thành phần | Công nghệ | Dùng để làm gì |
| --- | --- | --- |
| Ngôn ngữ | TypeScript | Chung một ngôn ngữ với giao diện |
| Framework | NestJS 11 | Tách module theo nghiệp vụ: xác thực, thành viên, khách hàng, pipeline, báo cáo, tích hợp, AI |
| Cơ sở dữ liệu | PostgreSQL 16 | Dữ liệu quan hệ, giao dịch, tìm kiếm văn bản |
| ORM & migration | Prisma 6 | Định nghĩa schema, phiên bản hoá thay đổi cơ sở dữ liệu |
| Hàng đợi & cache | Redis 7 + BullMQ 5 | Chạy nền import, webhook, email nhắc việc, chấm điểm AI; cache báo cáo |
| Kiểm tra đầu vào | zod + class-validator | Chặn dữ liệu sai ngay ở cửa vào |
| Bảo mật | helmet, Argon2id, JWT | Header an toàn, hash mật khẩu mạnh, phiên đăng nhập ngắn hạn |
| Ghi log | pino | Log dạng JSON, có mã yêu cầu để truy vết |
| Giám sát lỗi | Sentry | Bắt lỗi phía máy chủ và phía giao diện |
| Tài liệu API | Swagger | Danh sách endpoint kèm thử nghiệm trực tiếp khi dev |
| Kiểm thử | Jest + Supertest | Test đơn vị và test tích hợp với cơ sở dữ liệu thật |

### 7.3. Cập nhật trực tiếp và trợ lý AI

- **Socket.IO**: đẩy thay đổi bảng kanban và thông báo tới đúng người có quyền xem, không phát cho cả tổ chức.
- **Streaming**: trả dần kết quả trợ lý AI ngay khi máy chủ bắt đầu sinh câu trả lời.
- **Trợ lý AI**: tích hợp qua lớp adapter, có thể thay nhà cung cấp mô hình mà không đổi nghiệp vụ. Chỉ tóm
  tắt, soạn nháp và chấm điểm; người dùng quyết định trước khi gửi.

### 7.4. Hạ tầng phát triển

- Docker Compose dựng sẵn PostgreSQL, Redis và một hộp thư giả để xem email gửi ra mà không cần gửi thật.
- Một lệnh cài đặt và một lệnh chạy cho cả hai ứng dụng; kiểm thử tự động chạy trên mỗi thay đổi.

## 8. Liên hệ

Sản phẩm đang trong giai đoạn phát triển. Cần bản demo hoặc trao đổi thêm, vui lòng liên hệ tác giả.


