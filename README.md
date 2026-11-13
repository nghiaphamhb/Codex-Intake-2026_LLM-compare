# LLM Compare

So sánh câu trả lời của nhiều model cạnh nhau. Frontend dùng React/TypeScript/Vite; backend dùng Fastify.

## Trạng thái hiện tại

FE005 đã hoàn thành ở frontend: chọn 2–4 model, gửi câu hỏi, Retry, New, Copy code và xem suy nghĩ bằng dữ liệu giả trong bộ nhớ. Đáp án frontend vẫn trả ngay và reload khôi phục fixture ban đầu; **frontend hiện đang mock và chưa kết nối backend**. Ở phía backend, BE005 đã hoàn tất tích hợp AI Proxy (`GET /api/models`, `POST /api/generate`) và đạt kiểm thử local theo OpenAPI bằng HTTP stub cục bộ; **chưa nghiệm thu key/model BTC thật**, streaming, lưu lịch sử hoặc chia sẻ khôi phục dữ liệu.

## Cài đặt và chạy

Yêu cầu **Node.js 24**, npm. Chạy từ root repo:

```sh
npm ci
npm ci --prefix frontend
npm ci --prefix backend
npm run dev --prefix frontend
```

- [Màn hình so sánh](http://127.0.0.1:5173/)
- [Component Showcase](http://127.0.0.1:5173/?view=components)

Frontend hiện vẫn mock và chưa kết nối backend. Để chạy server backend (`npm run dev --prefix backend` hoặc `npm start --prefix backend`), sao chép [backend/.env.example](backend/.env.example) thành `backend/.env` và cấu hình `LLM_BASE_URL`, `LLM_API_KEY` hợp lệ: startup bắt buộc gọi `GET /models` tới proxy để nạp catalog thành công trước khi lắng nghe cổng. Bộ test tự động của backend (`npm test --prefix backend`) dùng HTTP stub cục bộ nên chạy được mà không cần key thật. Không commit secret.

## Các lệnh chính

| Thư mục chạy                | Lệnh                                      | Mục đích                                      |
| --------------------------- | ----------------------------------------- | --------------------------------------------- |
| Root                        | `npm run lint` / `npm run lint:fix`       | Kiểm tra / tự sửa ESLint                      |
| Root                        | `npm run format:check` / `npm run format` | Kiểm tra / áp dụng Prettier                   |
| Root                        | `npm run lint:staged`                     | Kiểm tra file đã stage                        |
| `frontend/` hoặc `backend/` | `npm test`                                | Unit/integration tests                        |
| `frontend/` hoặc `backend/` | `npm run typecheck`                       | Kiểm tra TypeScript                           |
| `frontend/` hoặc `backend/` | `npm run build`                           | Production build                              |
| `frontend/`                 | `npm run test:browser`                    | Kiểm tra layout và tương tác trên trình duyệt |
| `frontend/`                 | `npm run preview`                         | Xem bản frontend đã build                     |

`npm ci` ở root cài Husky. Pre-commit chạy lint-staged để sửa lint/format file đã stage và chặn commit khi còn lỗi; hook không chạy toàn bộ test/build. Code cũ có thể chưa đạt `format:check`; `format` sẽ sửa toàn bộ file không bị ignore.

Tooling root dùng TypeScript 5.9 cho parser ESLint; frontend vẫn dùng compiler TypeScript 7. Root ghim minimatch 11.0.1 để xử lý advisory của dependency glob.

## Browser tests và giới hạn

- Test nằm trong `frontend/tests/browser/`: `layout.mjs`, `interactions.mjs`, `helpers.mjs`; tự mở server cổng riêng, không cần chạy dev server trước.
- Mặc định dùng Microsoft Edge trên Windows. Có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` tới executable Chromium tương thích.
- Ảnh output ở `frontend/artifacts/verification/`, được ignore trong Git.
- Desktop hỗ trợ từ 1280px, mốc đối chiếu chính 1440px. Dưới 1280px vẫn cuộn ngang trên canvas desktop; mobile tabs thuộc bước 7.
- Còn cảnh báo bundle >500kB và chênh vị trí dọc so với Figma do cách hiển thị code; chi tiết trong spec FE005.

## Tài liệu

- [Lộ trình frontend](specs/FE000.md) · [Lộ trình backend](specs/BE000.md)
- [BE004 — Validation generation](specs/BE004-generate-validation.md) · [BE005 — Tích hợp AI Proxy](specs/BE005-ai-proxy-integration.md)
- [FE003 — Components](specs/FE003-ui-components.md)
- [FE004 — Desktop](specs/FE004-desktop-comparison.md)
- [FE005 — Tương tác và lịch sử nghiệm thu](specs/FE005-comparison-interactions.md)
- [Pattern viết spec](specs/F000-pattern.md) · [Quy tắc làm việc](AGENTS.md)

Bước tiếp theo: backend cần **BE006 (nghiệm thu key/model BTC thật)**; frontend vẫn giữ bước tiếp theo ở phía giao diện và **chưa kết nối API backend**.
