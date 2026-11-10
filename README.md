# Codex-Intake-2026_LLM-compare

Nền tảng so sánh câu trả lời từ nhiều mô hình ngôn ngữ lớn (LLM Compare) cạnh nhau cho cùng một câu hỏi.

## Giao diện Frontend

### Đường dẫn truy cập
- **Màn hình chính (So sánh Desktop FE004)**: `http://localhost:5173/` (hoặc `http://127.0.0.1:5173/`)
- **Trang Component Showcase (FE003)**: `http://localhost:5173/?view=components`

### Dữ liệu mẫu (Fixtures)
- Màn hình kết quả desktop sử dụng dữ liệu mẫu về trình soạn thảo `Editor.js` theo thiết kế Figma frame `2609:2229`:
  - 3 Models: Claude Haiku 5.5 (Anthropic), YandexGPT 5 Lite (Яндекс), GigaChat 2 (Сбер).
  - 2 Lượt hỏi (Turns): Lượt 1 gồm bảng so sánh định dạng, code JSON và trạng thái lỗi timeout của GigaChat; Lượt 2 gồm các bước cài đặt và code JavaScript.
  - Các nút hành động (`share`, `new`, `add`, `remove`, `retry`, `send prompt`) hiển thị thông báo phản hồi demo tiếng Nga (`role="status"`).

### Lệnh chạy (Frontend)

Di chuyển vào thư mục `frontend`:
```sh
cd frontend
```

- **Khởi chạy môi trường phát triển (Dev Server)**:
  ```sh
  npm run dev
  ```
- **Chạy kiểm thử hành vi (Unit Tests - Vitest)**:
  ```sh
  npm test
  ```
- **Kiểm tra kiểu dữ liệu (TypeScript typecheck)**:
  ```sh
  npm run typecheck
  ```
- **Xây dựng bản phát hành (Production Build)**:
  ```sh
  npm run build
  ```
- **Chạy kịch bản kiểm tra đối chiếu trình duyệt thật (Playwright / Edge)**:
  ```sh
  node verify-fe004.mjs
  ```

### Giới hạn hiện tại
- Giao diện được tối ưu chuẩn cho màn hình desktop từ **1280px** trở lên (chuẩn nghiệm thu chính tại **1440px**).
- Với màn hình dưới 1280px, trang giữ bố cục desktop tối thiểu và cho phép cuộn ngang (chế độ Mobile Tab sẽ được triển khai tại Bước 7).
- Dữ liệu hiện tại là fixture tĩnh; các luồng thêm/xóa model thực tế, gọi LLM streaming và chia sẻ liên kết sẽ được phát triển ở các bước tiếp theo.
