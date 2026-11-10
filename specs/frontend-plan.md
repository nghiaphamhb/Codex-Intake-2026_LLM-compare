| Bước | Đầu việc | Kết quả cần đạt |
|---|---|---|
| **1. Khảo sát và chốt phạm vi** | Đọc cấu trúc repo, xác định framework và phần có thể tái sử dụng; đối chiếu các frame; liệt kê những hành vi Figma chưa mô tả | Danh sách màn hình, tương tác và tiêu chí nghiệm thu rõ ràng |
| **2. Chuẩn bị nền giao diện** | Trích xuất màu, font Inter/JetBrains Mono, khoảng cách, bo góc, đường viền và hiệu ứng nền mờ; lấy logo, icon từ Figma | Bộ quy ước giao diện và asset dùng chung |
| **3. Xây component cơ bản** | Button, input, model header, question bubble, nội dung câu trả lời, bảng, code block có Copy, trạng thái suy nghĩ, thông báo lỗi | Các thành phần tái sử dụng và đủ trạng thái cần thiết | [FE003-ui-components.md](./FE003-ui-components.md) (Hoàn tất) |
| **4. Ghép màn hình desktop** | Header; các cột model; câu hỏi chung và hàng câu trả lời tương ứng; vùng thêm model; ô nhập câu hỏi phía dưới | Màn hình kết quả khớp bố cục Figma ở kích thước mẫu 1440px | [FE004-desktop-comparison.md](./FE004-desktop-comparison.md) (Hoàn tất) |
| **5. Hoàn thiện tương tác** | Gửi câu hỏi; tìm/thêm/xóa model; mở/đóng phần suy nghĩ; copy code; tạo so sánh mới; thử lại model lỗi | Luồng sử dụng hoàn chỉnh bằng dữ liệu giả lập |
| **6. Mô phỏng sinh câu trả lời** | Cho từng model chuyển trạng thái độc lập: chờ → suy nghĩ/sinh nội dung → hoàn tất hoặc lỗi; hiển thị thời gian và chi phí mẫu | Kiểm chứng UI khi các model trả lời khác tốc độ |
| **7. Làm responsive và mobile** | Desktop hiển thị nhiều cột; mobile hiển thị model đang chọn bằng thanh tab cuộn ngang; xử lý bảng/code dài, header sticky và ô nhập | Khớp mẫu mobile 390px, sử dụng được ở kích thước trung gian | (sau)
| **8. Kiểm tra và bàn giao** | Đối chiếu ảnh giao diện với từng frame; kiểm tra bàn phím, focus, cuộn trang, nội dung dài và các luồng chính; chạy build/check của repo | Bản frontend chạy được, kèm hướng dẫn chạy và danh sách phần cần tích hợp API | (sau)

## Bước 3 — Xây component cơ bản

**Trạng thái:** Đã hoàn thành theo đặc tả [FE003-ui-components.md](./FE003-ui-components.md). Toàn bộ 54/54 behavioral tests pass, typecheck và production build thành công; các component sẵn sàng để ghép màn hình ở Bước 4.

### Mục tiêu và phạm vi

Xây bộ component bám Figma để bước 4 có thể ghép màn desktop. Dùng React,
TypeScript, CSS Modules và token/asset/font của bước 2. Component nhận dữ liệu
qua props và phát sự kiện qua callback; chưa gọi API, quản lý cuộc so sánh,
mô phỏng streaming hoặc triển khai luồng thêm model đầy đủ.

Nguồn đối chiếu: file Figma tUMuB5lsAJ9gBPuQ6bJIQB, component kit 2608:2201,
desktop 2609:2229, generation 2610:2439 và mobile 2611:2452.
Giữ nội dung mẫu tiếng Nga như Figma để so sánh bố cục.

### Cấu trúc dự kiến

- `frontend/src/components/ui/`: Button, IconButton, TextInput và CSS Module tương ứng.
- `frontend/src/features/compare/components/`: ModelHeader, QuestionBubble,
  AnswerContent, CodeBlock, ThoughtStatus, AnswerError, PromptForm, AnswerStatus.
- `frontend/src/features/compare/types.ts`: kiểu trạng thái và dữ liệu chung thực sự
  cần dùng; ưu tiên props cục bộ cho component riêng lẻ.
- `frontend/src/app/App.tsx`: mở rộng trang xem mẫu hiện có để trình diễn các biến thể.
- `frontend/src/**/*.test.tsx`: kiểm thử hành vi cần thiết, đặt cạnh component.
- `frontend/package.json` và lockfile: thêm công cụ kiểm thử/renderer nếu cần.

Chỉ tạo file khi thực sự sử dụng; không tạo thư mục rỗng, framework UI hoặc
các lớp trừu tượng chưa cần. Không thay đổi backend.

### Các đầu việc theo thứ tự

| Đầu việc | Nội dung | Đầu ra / điều kiện hoàn tất |
|---|---|---|
| **3.1. Đối chiếu thiết kế** | Đọc chi tiết các component/biến thể từ Figma; rà token và SVG có sẵn; xác định default, hover, focus, disabled | Danh sách biến thể; phân biệt giá trị từ Figma với quy ước bổ sung cho trạng thái chưa được thiết kế |
| **3.2. Điều khiển dùng chung** | Button primary/secondary, IconButton có tên truy cập, TextInput; dùng HTML native | Hoạt động bằng chuột/bàn phím, disabled đúng, focus rõ và giữ kích thước SVG gốc |
| **3.3. Khối hiển thị so sánh** | ModelHeader (tên, provider, nút xóa), QuestionBubble; AnswerContent hỗ trợ đoạn văn, tiêu đề, danh sách, link và bảng | Dữ liệu nhận từ props; callback xóa model; nội dung dài không làm vỡ vùng chứa |
| **3.4. CodeBlock** | Nhãn ngôn ngữ, font mono, nội dung code, cuộn ngang và nút Copy | Copy đúng code; có phản hồi thành công/thất bại; không báo thành công nếu clipboard lỗi |
| **3.5. Các trạng thái câu trả lời** | ThoughtStatus đang suy nghĩ/hoàn tất, mở/đóng; AnswerStatus chờ/sinh nội dung; AnswerError có Retry | Trạng thái nhận từ props; mở/đóng bằng bàn phím; Retry phát callback; không cần timer hay request thật |
| **3.6. Ô nhập câu hỏi** | PromptForm có nội dung điều khiển từ bên ngoài, nút gửi/dừng theo trạng thái | Không gửi chuỗi trắng; Enter gửi, Shift+Enter xuống dòng; không gửi khi IME đang tổ hợp; nút dừng phát callback |
| **3.7. Trang xem mẫu và nghiệm thu** | Hiển thị đầy đủ biến thể trong trang mẫu, đối chiếu Figma và kiểm tra kích thước hẹp | Bộ component sẵn sàng ghép màn hình, có kết quả kiểm tra và các sai khác còn lại nếu có |

### Quyết định kỹ thuật dự kiến

- State cục bộ chỉ dùng cho tương tác của component như Copy hoặc mở/đóng.
  State của cuộc so sánh thuộc bước sau.
- Dùng renderer Markdown gọn, hỗ trợ bảng GFM và code block; không render HTML thô.
  Chọn dependency cụ thể sau khi kiểm tra tính tương thích, không tự viết parser.
- Bảng nằm trong AnswerContent, chưa tách thành component dùng chung khi chưa có nhu cầu.
- CodeBlock dùng màu và font từ thiết kế; chỉ thêm thư viện highlight nếu đối chiếu
  Figma cho thấy cần thiết, không thêm trình soạn code.
- Không dùng nội dung suy nghĩ tự tạo từ model thật; bước này chỉ trình diễn dữ liệu mẫu.
- Bổ sung token chỉ khi component cần; không rải giá trị trùng lặp trong CSS.

### Kiểm tra và tiêu chí duyệt hoàn tất

1. Viết kiểm thử hành vi trước khi triển khai logic: Copy thành công/thất bại,
   mở/đóng suy nghĩ, callback Retry/xóa, gửi/rỗng/IME/xuống dòng/dừng của PromptForm.
   Dự kiến dùng Vitest + React Testing Library trong phạm vi frontend.
2. Kiểm tra renderer với đoạn văn, bảng, code, URL dài và nội dung HTML không được thực thi.
3. Chạy typecheck, bộ kiểm thử và production build.
4. So sánh trực quan các biến thể với Figma, gồm typography, khoảng cách, viền, màu và icon.
   Nếu công cụ trình duyệt lỗi, báo rõ phần chưa xác minh thay vì coi kiểm tra HTTP là kiểm tra hình ảnh.
5. Kiểm tra ở vùng chứa desktop và mobile 390px: bảng/code tự cuộn,
   không tràn trang; kiểm tra focus và reduced motion.
6. Không có request LLM thật; không làm mất hay sửa ngoài phạm vi dữ liệu/backend hiện có.

### Chưa làm trong bước 3

- Ghép màn desktop hoàn chỉnh, header sticky và đồng bộ cột (bước 4).
- Luồng tìm/thêm model, tạo so sánh mới, chia sẻ và quản lý lịch sử (bước 5).
- Streaming, timeout, thời gian/chi phí thật hoặc giả lập theo tiến trình (bước 6).
- Chuyển bố cục toàn ứng dụng sang tab model trên mobile (bước 7).

### Quy trình phê duyệt

Người dùng duyệt kế hoạch bước 3 trước. Sau khi được cho phép triển khai,
thực hiện 3.1–3.7, báo kết quả xác minh và bàn giao bộ component cho bước 4.

## Bước 4 — Ghép màn hình desktop

**Trạng thái:** Đã hoàn thành theo đặc tả [FE004-desktop-comparison.md](./FE004-desktop-comparison.md). Toàn bộ 90/90 tests pass, typecheck/build exit 0, ảnh chụp 1440×1490px khớp frame Figma 2609:2229 và đã đối chiếu bằng trình duyệt thật (Playwright / Edge). Bàn giao cho Bước 5 để hoàn thiện tương tác và quản lý dữ liệu so sánh.
