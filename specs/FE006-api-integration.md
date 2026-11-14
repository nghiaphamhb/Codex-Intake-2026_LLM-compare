# FE006 - Tích hợp API thật vào màn hình so sánh

## Goal

Thay dữ liệu giả trong trang so sánh chính bằng catalog và câu trả lời từ backend hiện có; 2–4 model chạy độc lập, Retry đúng ô và không có response cũ ghi đè trạng thái mới. Không triển khai streaming hoặc metadata giá/token trong bước này.

**Trạng thái:** Gemini đã triển khai; Codex review/sửa và kiểm tra local ngày 2026-11-14. Chưa nghiệm thu browser → BTC thật. Theo [F000-pattern](F000-pattern.md). Người thực thi dự kiến: **Gemini 3.8 Flash**.

**Đọc trước khi code:** `AGENTS.md`, [FE000](FE000.md), [FE005](FE005-comparison-interactions.md), [BE000](BE000.md), source `frontend/src/features/compare/`, `frontend/vite.config.ts`, `frontend/scripts/` và routes backend hiện có. Áp dụng `karpathy-guidelines`, `ponytail`, TDD và verification. Spec đã có task; không tạo thêm plan/kiến trúc hoặc chọn lại stack. Soạn spec chưa phải quyền triển khai; tuân thủ xác nhận sửa file theo AGENTS.md.

**Phụ thuộc:** BE005 đã có contract cần dùng; FE006 có thể triển khai/test local ngay với stub. Không phải đợi metadata BE007. Phối hợp BE007 về cùng-origin khi triển khai; BE006 là công cụ nghiệm thu thủ công, không phải dependency runtime. Nếu BE007 bổ sung field, FE006 bỏ qua field dư, không tự hiện giá/token.

## User Story

Là người dùng, tôi muốn gửi một câu hỏi tới 2–4 model và xem kết quả/lỗi riêng từng cột, để so sánh câu trả lời thật và chỉ thử lại model lỗi.

## Scope

### In

- Trang `/` lấy catalog từ backend, khởi tạo tối đa ba model đầu theo thứ tự catalog, không có hội thoại mẫu. Không fallback catalog hoặc câu trả lời giả khi API lỗi.
- Send tạo một turn, snapshot các model đang chọn, gửi các POST độc lập ngay cùng lượt; mỗi ô pending → success/error, không đợi toàn bộ hoàn tất mới hiện kết quả.
- Retry chỉ ô lỗi; New xóa turn và hủy/loại bỏ request cũ; xóa model hủy request của model đó. Guard requestId kể cả khi fetch mock không tuân thủ abort.
- Loading/error/empty catalog, lựa chọn 2–4 model, API error mapping, giữ Markdown/Copy/IME/focus/validation hiện có.
- Vite dev proxy `/api` đến backend loopback; browser test dùng HTTP stub loopback do harness sở hữu, không gọi backend thật/BTC.
- Thời gian phản hồi từ `durationMs` đã có; cost không có thì ẩn. FE007 sẽ bổ sung token/giá sau.

### Out

- Không sửa backend; không fetch proxy BTC trực tiếp, không đưa key lên browser, không thêm env công khai cho key hoặc URL upstream.
- Không streaming, giả typing/thinking, Stop, giá/token giả, lịch sử bền vững, Share thật, auth, mobile tabs, multi-turn context hoặc tự đổi model khi lỗi.
- Không SDK/React Query/state library/dependency mới; không tự retry request, polling, cache nền hoặc model queue.
- Không đổi thiết kế desktop, asset/token/font, renderer Markdown/HTML policy hoặc refactor unrelated components.

### Contract cố định

Frontend dùng relative URL, native fetch, không `x-api-key`/Authorization. Backend là nơi gọi BTC. Chỉ body generation có `Content-Type: application/json`.

| API                  | Request                       | Response cần dùng                          |
| -------------------- | ----------------------------- | ------------------------------------------ |
| `GET /api/models`    | Không body                    | 200 `{ models: [{ id, name, provider }] }` |
| `POST /api/generate` | `{ prompt, modelId }`         | 200 `{ modelId, text, durationMs }`        |
| Lỗi backend          | Không suy luận từ raw message | `{ error: { code, message } }`             |

- Validate runtime dữ liệu unknown bằng kiểm tra nhỏ trong `comparisonApi.ts`, không cast rồi tin dữ liệu. Catalog phải là array; id/name/provider string không trắng hoặc whitespace hai đầu; ID duy nhất. `[]` hợp lệ. Một item sai → catalog error. Không lọc âm thầm item sai hoặc hardcode ID/nhãn/provider.
- Success generation: modelId khớp request, text là string (kể cả rỗng), durationMs number hữu hạn và >=0. Giữ nguyên text/whitespace/Markdown; không dùng `.trim()` để thay nội dung. Field dư như usage/pricing được bỏ qua.
- Không cần bắt lỗi bằng Content-Type: HTTP200 có JSON hợp lệ vẫn được xử lý. JSON hỏng/sai contract → `INVALID_RESPONSE`. HTTP khác 200 không được coi success.
- HTTP400 + INVALID_REQUEST → thông báo request không hợp lệ; 429/LIMIT → hết hạn mức; 504/TIMEOUT → timeout; AUTH_ERROR → lỗi cấu hình dịch vụ, không yêu cầu đăng nhập; 503/UNAVAILABLE → dịch vụ chưa sẵn sàng. Mã không biết hoặc lỗi mạng dùng generic. Không hiển thị raw message/body/stack/config/URL backend.

### API module — không tự chọn interface khác

Tạo `frontend/src/features/compare/comparisonApi.ts` với đúng public interface:

```ts
export type GenerateResponse = { modelId: string; text: string; durationMs: number };
export type ComparisonApiErrorCode =
  | 'INVALID_REQUEST'
  | 'GENERATION_UNAVAILABLE'
  | 'UPSTREAM_AUTH_ERROR'
  | 'UPSTREAM_LIMIT_EXCEEDED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';
export class ComparisonApiError extends Error {
  readonly code: ComparisonApiErrorCode;
  // constructor(code) đặt message cố định, không nhận raw message/cause.
}
export function fetchModels(signal: AbortSignal): Promise<CompareModel[]>;
export function generateAnswer(
  input: { prompt: string; modelId: string },
  signal: AbortSignal,
): Promise<GenerateResponse>;
```

`CompareModel` import từ types hiện có. Không export generic HTTP client/schema/service container. Abort do signal phải được truyền nguyên dạng để caller bỏ qua, không biến thành lỗi mạng trên UI; lỗi fetch khác → NETWORK_ERROR. Mã error envelope chỉ dùng whitelist union trên; HTTP status dùng làm fallback khi JSON lỗi hoặc code không biết (400 → INVALID_REQUEST, 429 → UPSTREAM_LIMIT_EXCEEDED, 503 → GENERATION_UNAVAILABLE, 504 → UPSTREAM_TIMEOUT; các status khác UPSTREAM_ERROR). Không cố dùng raw error để suy ra model/quota.

### State và vòng đời request

- `ComparisonState` giữ `catalog`, `models`, `turns`; initial cả ba `[]`, không import desktopFixtures/mockComparison vào runtime reducer/page. Catalog status `loading|ready|error` và message ở page; không tạo store toàn cục.
- Thêm union answer `{ state: 'pending'; requestId: string }`. Success/error cũng giữ optional `requestId?: string` để fixture cũ còn hợp lệ. `costLabel` của success đổi thành optional; `durationLabel` giữ string để tái sử dụng components. Không thêm fake thought cho response thật.
- Actions reducer: `catalog-loaded { catalog }`; `send { turnId, prompt, requests: Record<string,string> }`; `retry { turnId, modelId, requestId }`; `resolve { turnId, modelId, requestId, answer: Exclude<ResultAnswer,{state:'pending'}> }`; giữ `select-model {modelId}`, `remove-model {modelId}`, `new-comparison`.
- `catalog-loaded` lưu catalog và chọn `catalog.slice(0,3)`, chỉ khi tải thành công lúc khởi tạo/retry catalog; không dùng để refresh khi có hội thoại. `select-model` tra catalog trong state, giới hạn 4/unique; không gọi API cho turn cũ.
- `send` kiểm tra prompt như hiện tại, model count 2–4, turnId chưa có, requests có đúng một requestId không rỗng/duy nhất cho mỗi model chọn; tạo pending theo snapshot đó. Không gọi fetch trong reducer.
- `retry` chỉ khi model còn chọn, turn/ô tồn tại và ô error; đổi đúng ô thành pending, giữ question/ô khác. `resolve` chỉ nhận khi model còn chọn, turn còn tồn tại và ô vẫn pending có requestId trùng. Không tạo lại turn/ô đã xóa. Không thay question bằng prompt đang nhập.
- Page tạo UUID cho turn và từng request; giữ Map requestId → AbortController trong ref. Register controller trước khi fetch; cleanup map trong finally chỉ xóa đúng request đang theo dõi. Không dispatch từ finally để biến ô lỗi thành success.
- Send gọi runner cho từng model ngay trong event handler, không await tuần tự/không Promise.all làm chặn cập nhật riêng. Không đặt generation trong effect phụ thuộc turns; tránh duplicate POST và retry khi React StrictMode chạy lại effect.
- New: abort và clear tất cả request, xóa turns, giữ catalog/model selection; xóa prompt/error/message, trả focus textarea. Remove: abort request của model đó và xóa answers như FE005; thêm lại cùng ID không khôi phục response cũ. Unmount: abort catalog và generation, không update UI sau unmount.
- Catalog effect có AbortController và cờ ignore/cleanup; StrictMode có thể tạo GET đã abort, nhưng không có POST tự động. Test không ép GET chỉ một lần dưới StrictMode; chỉ một lần cho mỗi lượt load không bị cleanup.

### Quyết định UI đã chốt

| Tình huống          | Hành vi                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog đang tải    | `Загружаем модели…`, role status; Send/Add vô hiệu, chưa render grid 0 cột                                                                                       |
| Catalog lỗi         | `Не удалось загрузить модели.`, role alert + nút `Повторить загрузку`; không fixture fallback                                                                    |
| Catalog 0 model     | `Нет доступных моделей.`, không grid, Send/Add vô hiệu                                                                                                           |
| Catalog 1 model     | Hiện một header; `Для сравнения нужны минимум две модели.`, Send/Add vô hiệu                                                                                     |
| Catalog >=2 model   | Chọn 2 hoặc 3 model đầu; Send hoạt động khi prompt hợp lệ, thêm tối đa 4                                                                                         |
| Ô pending           | Dùng `AnswerStatus state="waiting"`; không giả generating/thinking                                                                                               |
| Success             | Render Markdown hiện có, thời gian `(durationMs / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 2}) + ' с'`; cost vắng thì không hiện cost/dấu phân cách |
| Model thêm sau turn | Giữ placeholder hiện có; không tự generation cho turn lịch sử                                                                                                    |
| Reload              | Tải lại catalog, hội thoại rỗng; không restore fixture/localStorage                                                                                              |

- Giữ `PromptForm busy={false}` trong FE006 để không lộ nút Stop giả. Thêm optional `disabled?: boolean = false` vào PromptForm: chặn submit/Enter, disable Send khi chưa có >=2 model/catalog chưa ready; textarea vẫn sửa được. Khi có request đang chờ vẫn cho phép Send turn mới, không có global busy lock. New luôn dùng được.
- AddModelColumn thêm optional `disabled?: boolean = false`, truyền native disabled. Disable khi catalog chưa ready, hết model chưa chọn hoặc đủ 4. Remove giữ minimum 2; ModelPicker nhận catalog thật và giữ modal/focus logic đã có.
- Lỗi ô dùng `AnswerError` hiện có và Retry. Message/description tĩnh tiếng Nga; chốt mapping: INVALID_REQUEST `Некорректный запрос.`; UNAVAILABLE `Генерация недоступна.`; AUTH `Ошибка настройки сервиса.`; LIMIT `Лимит запросов исчерпан.`; TIMEOUT `Время ожидания истекло.`; INVALID_RESPONSE/UPSTREAM_INVALID_RESPONSE `Некорректный ответ сервиса.`; NETWORK `Не удалось связаться с сервером.`; UPSTREAM_ERROR/unknown `Не удалось получить ответ.`. Description chung `Повторите запрос позже.` Không echo backend message. Catalog Retry chỉ GET, không gửi prompt.
- Giữ Share thông báo chưa hỗ trợ, Copy thật, IME/Shift+Enter, giới hạn 10.000 Unicode code points, focus restoration picker và aria-invalid/describedby. Không dùng số lượng role=status toàn trang bằng 1 khi giờ có nhiều ô pending.

### Dev proxy và triển khai

- Trong `frontend/vite.config.ts`, giữ `envDir: '..'`; thêm `server.proxy['/api'] = { target: 'http://127.0.0.1:3000', changeOrigin: true }`, không rewrite path. FE006 dùng backend PORT mặc định 3000; nếu người dùng chọn port khác, hướng dẫn sửa target tương ứng, không tự đọc/expose secret env trong Vite.
- Không thêm CORS hoặc đổi backend host/port. Production hosting phải reverse-proxy `/api` cùng origin tới backend; FE006 chỉ ghi hướng dẫn, không dựng hosting/nginx/container. Vite dev proxy không phải cấu hình production; không hứa `vite preview` thay reverse proxy production.
- Browser test override target proxy tại runtime về stub cổng ngẫu nhiên; không dùng backend cổng3000 của người dùng. Không thêm mock flag/query param hoặc runtime seed route vào ứng dụng.

### File scope khi được giao triển khai

| File                                                                       | Phạm vi                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `frontend/src/features/compare/comparisonApi.ts`, `.test.ts` — mới         | Fetch/validate/error mapping và unit tests                                  |
| `frontend/src/features/compare/types.ts`                                   | Pending/requestId và optional costLabel                                     |
| `frontend/src/features/compare/comparisonState.ts`, `.test.ts`             | Catalog, initial rỗng, pending/resolve guard, invariants                    |
| `frontend/src/features/compare/ComparePage.tsx`, `.test.tsx`               | Catalog lifecycle, controller registry, API orchestration và UI             |
| `frontend/src/features/compare/ComparePage.module.css`                     | Chỉ style status/error/retry catalog bằng token sẵn có nếu cần              |
| `frontend/src/features/compare/components/AnswerCell.tsx`, `.test.tsx`     | Pending và cost vắng; không đổi renderer                                    |
| `frontend/src/features/compare/components/PromptForm.tsx`, `.test.tsx`     | Optional disabled, giữ busy/Stop cũ cho showcase                            |
| `frontend/src/features/compare/components/AddModelColumn.tsx`, `.test.tsx` | Optional disabled native                                                    |
| `frontend/src/app/App.test.tsx`                                            | Mock API, cập nhật kỳ vọng initial rỗng; không bỏ test app routing/showcase |
| `frontend/vite.config.ts`                                                  | Proxy dev, giữ test config/envDir                                           |
| `frontend/scripts/apiStub.mjs` — mới                                       | Node HTTP stub catalog/generate deterministic, không secret                 |
| `frontend/scripts/helpers.mjs`, `layout.mjs`, `interactions.mjs`           | Chạy browser qua stub, cập nhật luồng async và assertions                   |
| `README.md`, `frontend/README.md`, `specs/FE000.md`, spec này              | Hướng dẫn chạy/trạng thái/kết quả sau khi kiểm tra                          |

Không sửa backend, package/lockfile, `.env*`, fixture/mockComparison cũ, renderer components, asset, BE000/BE006/FE005 hoặc thêm file ngoài bảng. Fixtures cũ còn dùng cho component showcase/tests; không xóa chỉ vì runtime page không dùng nữa. Nếu kiểu union mới làm consumer ngoài bảng không compile, chỉ sửa tối thiểu narrowing sau khi nêu file/lỗi và xác nhận mở rộng phạm vi; không refactor cả feature. Không stage/commit/push.

## Flow

1. Mount: initial rỗng, loading catalog; GET thành công chọn 2–3 model đầu, error/empty/one-model theo bảng. Retry catalog chỉ khi lỗi, không polling.
2. Người dùng nhập prompt; Send validate, snapshot model IDs, tạo turn/request IDs, dispatch pending, clear input/focus và khởi chạy một POST mỗi model.
3. Mỗi POST thành công/lỗi dispatch resolve đúng requestId; ô còn lại giữ nguyên. Giữ nguyên prompt gửi backend, không tự nối lịch sử hội thoại.
4. Retry ô error tạo requestId mới, gửi lại question của đúng turn/model, không gọi lại model thành công hoặc GET catalog.
5. New/Remove/unmount abort đúng request, guard reducer chặn response cũ. Re-add không điền lại turn cũ.
6. Copy/modal/IME/validation vẫn như FE005; reload khởi tạo rỗng. Không streaming/Stop/token/giá/thought giả.

## Edge Cases

- Catalog lỗi mạng/HTML/JSON sai, thiếu models, item sai/ID trùng, rỗng hoặc chỉ một model; không crash CSS grid hoặc fallback demo.
- Response success text rỗng/Markdown dài, duration 0/float, modelId sai, duration NaN/âm, text sai kiểu hoặc field dư.
- 2/3/4 POST overlap, trả sai thứ tự; một lỗi/timeout không xóa kết quả tốt; lỗi có raw sentinel không xuất hiện trên UI/console.
- Hai turn cùng prompt, nhiều request cùng model khác turn: phải tách bằng turnId/requestId, không key theo prompt hoặc chỉ modelId.
- Retry double-click trước React render: chỉ một POST cho ô lỗi; runner có synchronous in-flight guard theo turnId/modelId. Dispatch guard một mình không đủ ngăn request trùng.
- New hoặc remove/re-add trong lúc request chưa xong, fetch bỏ qua AbortSignal trong mock: late response vẫn không cập nhật UI.
- StrictMode mount/cleanup, catalog retry rồi unmount, abort không hiện error toast/ô lỗi mới. Không tự POST từ mount.
- Browser harness hiện fail mọi HTTP>=400/requestfailed: chỉ bỏ qua lỗi đã khai báo chính xác cho test (method/path/status hoặc abort URL do test chủ động), assert đúng số lượng đã tiêu thụ; mọi lỗi còn lại vẫn fail. Không bỏ listener, warn-only hoặc ignore toàn bộ `/api`.

## Acceptance Criteria

- [x] Trang chính không import/sinh câu trả lời mock, không hội thoại mẫu lúc mở/reload; showcase và fixture tests còn hoạt động.
- [x] Catalog loading/error/retry/empty/one-model và chọn 2–4 model đúng bảng, không gửi POST khi chưa đủ model/input sai.
- [x] 2/3/4 request được khởi chạy chồng lấn, từng ô pending/success/error độc lập; response đúng turn/model kể cả đảo thứ tự.
- [x] Retry chỉ ô lỗi, dùng câu hỏi lịch sử; double-click không tạo POST trùng; không auto retry hoặc đổi model.
- [x] New/Remove/unmount hủy request; requestId guard chống late response kể cả mock bỏ qua abort.
- [x] Runtime validate success/error, không lộ raw message/key; không hiện cost/thought/token giả, không có nút Stop trong page.
- [x] Giữ Copy, modal keyboard/focus, IME/Shift+Enter, Unicode validation, multiline/reduced motion/showcase và hình học desktop phù hợp nội dung mới.
- [x] Dev `/api` đi qua Vite proxy; test browser dùng stub HTTP riêng, không gọi backend thật/BTC hoặc phụ thuộc key/cổng3000.
- [x] Unit tests/typecheck/build/lint/browser/targeted format/diff đạt; báo cáo giới hạn/bundle warning đúng thực tế, không tuyên bố khớp Figma tuyệt đối.

## Tasks

Thực hiện lần lượt khi được người dùng giao code; viết regression fail trước mỗi đổi hành vi. npm frontend chạy ở `frontend/`, lint/format ở root. Test dùng Vitest/Testing Library hiện có, fetch mock hoặc Node HTTP stub; không thêm thư viện.

### TASK-001 — API module

- [x] Tạo `comparisonApi.test.ts`: stub global fetch, assert relative URL/method/header/body/signal, validation catalog matrix và duplicate ID; success generation text nguyên trạng/rỗng/duration0/float/modelId mismatch và field dư.
- [ ] Matrix lỗi envelope/status fallback/JSON hỏng/HTTP200 sai body/network/abort; raw sentinel không thành message. Restore global fetch sau test. Chạy thấy fail do thiếu API module.
- [x] Implement đúng public interface trên bằng helper private nhỏ; không fetch ở module scope. Chạy API tests/typecheck.

### TASK-002 — Reducer async và components

- [x] Chuyển test initial fixture sang initial rỗng và catalog-loaded; giữ các test invariants 2–4/unique/Unicode/missing answer, cập nhật send/retry thay cho kỳ vọng createMockAnswer.
- [x] Thêm pending→resolve, wrong requestId, response sau New/remove/re-add, duplicate turnId, hai turn cùng prompt và Retry chỉ error; assert literal content đúng model/turn cho 2/3/4 model.
- [x] Implement state/actions/types theo thiết kế, không side effect/reducer network. Giữ mockComparison/desktopFixtures phục vụ test riêng.
- [x] AnswerCell dùng AnswerStatus waiting và metadata không separator khi cost undefined; PromptForm/AddModelColumn thêm disabled với unit tests. Giữ các props cũ tương thích showcase và không sửa renderer.

### TASK-003 — Page orchestration và UI regressions

- [ ] Mock API bằng deferred promises trong ComparePage tests, catalog khác fixture production IDs. Viết fail cho loading/error/retry/0/1/2/3/4 model và reload/new initial behavior.
- [x] Assert Send 2/3/4 lời gọi xuất hiện trước resolve bất kỳ lời gọi nào; resolve lệch thứ tự, một reject, Retry đúng prompt/ô/counter; nhập prompt mới khi cũ pending vẫn tạo turn mới.
- [x] Test double Retry trước render, New/remove/unmount, remove/re-add cùng ID và late resolve dù mock ignore signal; assert abort flag và không có old text.
- [x] Implement page theo Flow/controller map, dùng error messages đã chốt; add synchronous in-flight guard cho Retry, không queue/global busy. Không console.log prompt/response.
- [x] Cập nhật App.test với API stub; giữ regression Copy/denied clipboard, picker ba đường trả focus, Share, IME, validation/focus. Test status theo đúng vùng, không dựa global count cũ. Chạy unit suite/typecheck/build.

### TASK-004 — Vite proxy và browser verification offline

- [x] Thêm proxy `/api` theo cấu hình đã chốt. Tạo apiStub.mjs bằng node:http, cổng hệ điều hành cấp, catalog >=5 model unique, id/name/provider cố định; response theo model/prompt, có counter/barrier cho overlap và điều khiển delay/lỗi từng request. Không random, không fallback network thật.
- [x] Helpers khởi động stub trước Vite, override target `/api` sang stub, đóng browser/Vite/stub trong finally. Giữ thu console/page/HTTP/request errors; cho phép test khai báo lỗi dự kiến chính xác và assert đã gặp, không ignore blanket.
- [x] Layout/interactions không còn dựa turn demo có sẵn. Trước đo geometry, thực hiện Send qua UI với prompt fixture và chờ đáp án stub rich Markdown/code/bảng; cập nhật expectation theo nội dung deterministic. Không thêm runtime seed/mock switch hoặc ép height để giữ số y cũ.
- [x] Browser assert loading độc lập, 2/3/4 cột và request overlap bằng barrier/counters có deadline, success/error/Retry, New khi pending/late response, remove/re-add, catalog retry/empty/one-model. Giữ geometry1440/1280, divider/alignment, sticky16, composer760x54, Copy/denied clipboard, modal keyboard/focus, validation/IME, multiline160, reduced-motion, showcase, fallback390.
- [x] Chạy `npm run test:browser`; ảnh chỉ trong artifacts/verification hiện có. Expected HTTP/abort fault probe vẫn bị fail nếu không khai báo; lỗi console/page luôn fail. Không chạy thêm suite hoặc server người dùng để thay thế assert.

### TASK-005 — Kiểm tra và bàn giao

- [x] Frontend `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser`; root `npm run lint`, targeted `npx --no-install prettier --check` cho toàn bộ file tạo/sửa và `git diff --check`. Ghi số test/exit code thực tế, không sao chép số FE005.
- [x] Rà runtime imports không còn fixture/mockComparison trong ComparePage/reducer; build/client code không có API key, request proxy upstream hay model ID hardcode để chọn mặc định. Chỉ test/stub/showcase còn dữ liệu mẫu.
- [x] README/frontend README cập nhật trạng thái thật, lệnh hai terminal/backend3000/frontend5173, proxy dev và yêu cầu same-origin production; sửa thông tin fixture reload/demo cũ ở phần trạng thái hiện hành, không xóa lịch sử spec cũ. FE000 ghi trạng thái gọn; chi tiết test/sai khác nằm cuối spec này.
- [ ] Live end-to-end chỉ khi được người dùng cho phép riêng lúc thực thi: dùng hai model được chỉ định/xác nhận trong catalog, một Send ngắn (hai POST), không lặp/dò model. Nếu chưa được phép, ghi chỉ đạt offline, chưa nghiệm thu browser→BTC thật; không đánh dấu live dựa trên stub hoặc smoke BE006.

### 2026-11-14 — Review và sửa implementation Gemini (Codex)

- Baseline kiểm tra độc lập: 22 unit files, 159/159 tests, typecheck/build đạt; browser layout đạt nhưng interactions thất bại tại focus sau thêm model thứ tư. Không coi unit/build xanh là nghiệm thu toàn bộ.
- Sửa focus khi đóng picker: trả về Add nếu còn enabled, ngược lại về textarea. Callback Close ổn định để tránh modal bị cleanup/mở lại khi response ô khác cập nhật.
- Registry request dùng tuple JSON cho turn/model, không split dấu hai chấm làm hỏng ID model có ':'. Bỏ response success đã bị abort, giữ requestId guard ở reducer. Cleanup effect giữ tham chiếu map ổn định để đáp ứng lint.
- API giữ nguyên abort khi đọc body sau headers, cho cả success và HTTP error; không đổi abort thành INVALID_RESPONSE/timeout. Bốn regression body abort, focus model4 và abort model ID chứa ':' đã fail trước sửa, pass sau sửa. Thêm kiểm tra unmount và remove/re-add với late response bỏ qua signal.
- Browser harness sửa luồng Add tối đa4, trả focus phù hợp, mock IME bằng KeyboardEvent composition thay vì yêu cầu native Enter trong composition giả không chèn newline. Sửa race bằng đợi counter/barrier có deadline; xác minh overlap2/3/4, release từng model và Retry chỉ tăng một POST, không GET catalog lại.
- Expected lỗi HTTP/abort khớp method/path/status và số lượng; resource console diagnostic chỉ được bỏ qua khi khớp chính response dự kiến. Abort StrictMode chỉ chấp nhận GET đầu bị hủy có request thay thế; lỗi console/page/network khác vẫn fail. Stub/harness cleanup cả khởi tạo Vite lỗi và connection đang giữ.
- Reviewer độc lập kiểm tra harness và chạy fault probes: HTTP không khai báo, sai URL/method, console/page lỗi và lỗi connection thật vẫn fail; expected504/resource và cặp StrictMode hợp lệ đạt. Không dùng reviewer thay cho suite chạy thực tế.
- Sửa token CSS chưa tồn tại trong catalog banners bằng token hiện có; không đổi layout hoặc asset. README/frontend README/FE000 phản ánh API integration và giới hạn live; production cần reverse proxy cùng origin, không dùng Vite preview thay hosting.
- Verification cuối: **22 test files, 164/164 tests pass** bằng npm test -- --maxWorkers=2; typecheck/build, npm run lint, targeted Prettier và git diff --check đạt. Browser layout/interactions đều exit0 với HTTP stub qua proxy Vite, không cổng backend/key thật.
- Đã xem screenshot layout-initial: Markdown/bảng/code, các cột và composer hiển thị ổn với stub. Hai turn geometry1440: hàng600/578px, composer760x54 tại x340/y1563; không so y với fixture FE005 có nội dung khác, không ép height hoặc tuyên bố pixel-perfect Figma. Ảnh ở frontend/artifacts/verification, không commit.
- Giới hạn: JS bundle **510,53kB**, gzip156,92kB còn cảnh báo >500kB. Chưa chạy browser→BTC live, metadata token/giá, streaming/Stop/reasoning thật, mobile tabs/persistence/Share thật. Không có log để xác minh trình tự TDD của Gemini; checkbox nghiệm thu local không thay bằng chứng live.
- Không sửa backend/.env/package/lockfile, không gọi model thật, không stage/commit/push.

### 2026-11-14 — Cập nhật checklist và mở app kiểm tra thủ công

- Tick các task triển khai/kiểm tra local dựa trên lượt review 164 tests và browser suite đã đạt ở trên. Hai task có yêu cầu tái hiện fail trước implementation vẫn để trống vì chưa có log xác minh trình tự TDD của Gemini; không có nghĩa phần API/catalog chưa được code.
- Live end-to-end vẫn chưa tick: mở app và GET health/catalog không thay thế một Send qua browser đến BTC. Người dùng sẽ tự thực hiện theo hướng dẫn kiểm tra.
