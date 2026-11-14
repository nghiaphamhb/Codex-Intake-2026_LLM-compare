# LLM Compare

So sánh câu trả lời của nhiều model cạnh nhau. Frontend dùng React/TypeScript/Vite; backend dùng Fastify.

## Trạng thái hiện tại

FE006 đã nối trang so sánh với API backend: catalog thật, 2–4 request độc lập, trạng thái chờ/kết quả/lỗi, Retry từng ô và New. Reload mở hội thoại rỗng; fixture chỉ dùng cho test/showcase. Đã kiểm tra local bằng HTTP stub qua Vite proxy, **chưa nghiệm thu browser → BTC thật**. Backend từng smoke live thành công với catalog 10 model và một GPT-5 mini ngày 2026-11-13. Chưa có streaming/Stop, token/giá, reasoning thật, persistence hoặc Share khôi phục dữ liệu.

## Cài đặt và chạy

Yêu cầu **Node.js 24**, npm. Chạy từ root repo:

```sh
npm ci
npm ci --prefix frontend
npm ci --prefix backend
npm run dev --prefix frontend
```

Chạy backend trong terminal thứ hai: `npm run dev --prefix backend`. Nếu đổi backend PORT khỏi 3000, cập nhật target trong `frontend/vite.config.ts`. Production cần reverse proxy `/api` cùng origin tới backend; Vite dev proxy/preview không thay thế cấu hình hosting.

- [Màn hình so sánh](http://127.0.0.1:5173/)
- [Component Showcase](http://127.0.0.1:5173/?view=components)

Frontend gọi relative `/api` qua Vite dev proxy tới backend cổng 3000. Để chạy server backend (`npm run dev --prefix backend` hoặc `npm start --prefix backend`), sao chép [.env.example](.env.example) thành `.env` tại thư mục gốc dự án và cấu hình `LLM_BASE_URL`, `LLM_API_KEY` hợp lệ: startup bắt buộc gọi `GET /models` tới proxy để nạp catalog thành công trước khi lắng nghe cổng. Bộ test tự động của backend (`npm test --prefix backend`) dùng HTTP stub cục bộ nên chạy được mà không cần key thật. Không commit secret.

## Cấu hình môi trường dùng chung

- Chỉ dùng một `.env` tại gốc repo, cạnh `.env.example`; không đặt trong `backend/` hoặc `frontend/`. Nếu đã có `backend/.env`, chuyển file đó lên gốc và giữ nguyên key.
- Backend đọc file này theo vị trí source/build, không phụ thuộc thư mục chạy; biến môi trường hệ thống được ưu tiên. Cấu hình hiện có: `PORT`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_TIMEOUT_MS`.
- Vite cũng đọc env ở gốc. Chỉ biến có tiền tố `VITE_` được công khai cho frontend qua `import.meta.env`; tuyệt đối không đặt key vào biến `VITE_`. Frontend không cần biến public nào cho API cùng origin.
- Khởi động lại dev server sau khi đổi env; biến public của frontend được cố định khi build. `.env` được Git ignore; `.env.example` chỉ chứa placeholder.

## Các lệnh chính

| Thư mục chạy                | Lệnh                                             | Mục đích                                      |
| --------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Root                        | `npm run lint` / `npm run lint:fix`              | Kiểm tra / tự sửa ESLint                      |
| Root                        | `npm run format:check` / `npm run format`        | Kiểm tra / áp dụng Prettier                   |
| Root                        | `npm run lint:staged`                            | Kiểm tra file đã stage                        |
| `frontend/` hoặc `backend/` | `npm test`                                       | Unit/integration tests                        |
| `frontend/` hoặc `backend/` | `npm run typecheck`                              | Kiểm tra TypeScript                           |
| `frontend/` hoặc `backend/` | `npm run build`                                  | Production build                              |
| `backend/`                  | `npm run smoke:proxy`                            | Smoke test catalog proxy BTC (Fastify inject) |
| `backend/`                  | `npm run smoke:proxy -- --generate --model <id>` | Smoke test 1 generation thật (tiêu quota)     |
| `frontend/`                 | `npm run test:browser`                           | Kiểm tra layout và tương tác trên trình duyệt |
| `frontend/`                 | `npm run preview`                                | Xem bản frontend đã build                     |

`npm ci` ở root cài Husky. Pre-commit chạy lint-staged để sửa lint/format file đã stage và chặn commit khi còn lỗi; hook không chạy toàn bộ test/build. Code cũ có thể chưa đạt `format:check`; `format` sẽ sửa toàn bộ file không bị ignore.

Tooling root dùng TypeScript 5.9 cho parser ESLint; frontend vẫn dùng compiler TypeScript 7. Root ghim minimatch 11.0.1 để xử lý advisory của dependency glob.

## Smoke test AI Proxy thủ công (BE006)

CLI kiểm tra kết nối AI Proxy upstream qua cấu hình `.env` thật mà không khởi động HTTP server mở cổng TCP ra ngoài.

Chạy từ gốc repo:

```sh
npm run smoke:proxy --prefix backend
npm run smoke:proxy --prefix backend -- --generate --model openai/gpt-5-mini
```

Hoặc từ thư mục `backend/`: `npm run smoke:proxy` và `npm run smoke:proxy -- --generate --model <id>`.

- **Mặc định (catalog mode)**: chỉ nạp `.env`, gọi `GET /models` upstream một lần, inject kiểm tra `GET /api/health` và `GET /api/models` nội bộ; không gửi prompt hay gọi endpoint generate.
  Output stdout: `{"ok":true,"mode":"catalog","modelCount":10,"health":"ok"}`
- **Generation mode (`--generate --model <id>`)**: nạp catalog, kiểm tra model tồn tại, gửi đúng 1 request `POST /api/generate` với prompt cố định `Reply with only: OK`.
  Output stdout: `{"ok":true,"mode":"generate","modelCount":10,"health":"ok","modelId":"openai/gpt-5-mini","durationMs":2278.86,"textNonEmpty":true}`

**Lưu ý và giới hạn:**

- Lệnh `--generate` gọi trực tiếp upstream thật và **tiêu hao quota** của key đã cấu hình.
- Smoke CLI dùng Fastify inject nội bộ + HTTP client thật; không kiểm tra server listen/TCP đang chạy và không thay thế tích hợp frontend.
- Thành công của catalog hoặc một model không chứng minh mọi model trong catalog đều hoạt động hay lượng quota còn lại của key.
- Pricing, token usage, streaming, Stop và reasoning chưa được nghiệm thu trong bước này.

## Browser tests và giới hạn

- Test nằm trong `frontend/scripts/`: `layout.mjs`, `interactions.mjs`, `helpers.mjs`; tự mở server cổng riêng, không cần chạy dev server trước.
- Mặc định dùng Microsoft Edge trên Windows. Có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` tới executable Chromium tương thích.
- Ảnh output ở `frontend/artifacts/verification/`, được ignore trong Git.
- Desktop hỗ trợ từ 1280px, mốc đối chiếu chính 1440px. Dưới 1280px vẫn cuộn ngang trên canvas desktop; mobile tabs thuộc FE009 (bước 9).
- Còn cảnh báo bundle >500kB và chênh vị trí dọc so với Figma do cách hiển thị code; chi tiết trong spec FE005.

## Tài liệu

- [Lộ trình frontend](specs/FE000.md) · [Lộ trình backend](specs/BE000.md)
- [BE004 — Validation generation](specs/BE004-generate-validation.md) · [BE005 — Tích hợp AI Proxy](specs/BE005-ai-proxy-integration.md)
- [FE003 — Components](specs/FE003-ui-components.md)
- [FE004 — Desktop](specs/FE004-desktop-comparison.md)
- [FE006 — Tích hợp API](specs/FE006-api-integration.md)
- [FE005 — Tương tác và lịch sử nghiệm thu](specs/FE005-comparison-interactions.md)
- [Pattern viết spec](specs/F000-pattern.md) · [Quy tắc làm việc](AGENTS.md)

Thứ tự tiếp theo: **BE007** bổ sung contract metadata → **FE007** hiện token/giá ước tính → **BE008/FE008** streaming, Stop và reasoning khi có → **FE009** mobile → **BE009/FE010** nghiệm thu/bàn giao. BE006 đã có CLI và kiểm thử local; FE006 đã triển khai và kiểm tra offline. BE007–BE009 và FE007–FE010 chưa soạn. Fixture mô phỏng tiếp tục phục vụ test; chưa nghiệm thu frontend với BTC thật.

Contract tham chiếu: [repo BTC](https://github.com/codex-team/ai-proxy) và [OpenAPI live](https://llm.codex.so/docs/json), đối chiếu 2026-11-13. Giá USD/triệu token và usage không đồng nghĩa quota của key; chi phí hiển thị sau này chỉ là ước tính.
