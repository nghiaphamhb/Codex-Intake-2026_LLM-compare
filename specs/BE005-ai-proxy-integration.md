# BE005 - Tích hợp AI Proxy: catalog và sinh câu trả lời đầy đủ

## Goal

Kết nối backend với contract AI Proxy của BTC: nạp catalog, gọi đúng model, trả Markdown đầy đủ kèm thời gian và xử lý lỗi độc lập. Kiểm thử tự động dùng HTTP upstream cục bộ, chưa cần key thật. Phụ thuộc BE001–BE004; BE004 đã triển khai và kiểm tra cục bộ ngày 2026-11-12. BE005 thay placeholder 501 của mốc BE004 bằng generation và giữ validation đã nghiệm thu.

**Trạng thái:** đã triển khai và đạt kiểm thử local theo OpenAPI (HTTP stub cục bộ) ngày 2026-11-12; chưa nghiệm thu key/model BTC thật hoặc tích hợp frontend. Theo [F000-pattern](F000-pattern.md). Nghiệm thu bằng key BTC thuộc BE006.

**Người thực thi:** Gemini 3.8 Flash. Đọc `AGENTS.md`, [BE000](BE000.md), [BE004](BE004-generate-validation.md) và source hiện tại; spec này đã có task, không cần tạo thêm plan hoặc tài liệu kiến trúc. Giữ code nhỏ theo `karpathy-guidelines`/`ponytail`; không tự commit. Việc cập nhật spec không phải quyền tự triển khai code.

## User Story

Là người dùng, tôi muốn chọn model thực sự được proxy hỗ trợ và nhận câu trả lời cùng thời gian phản hồi, để so sánh nhiều model mà một request lỗi không làm hỏng những request khác.

## Scope

### In

- Dùng Node.js 24 `fetch`, `AppConfig` của BE002 và header `x-api-key`. Production BTC dùng `https://llm.codex.so`; HTTP loopback dành cho test. Không thêm dependency.
- Lấy `GET /models` một lần trước listen; kiểm tra dữ liệu, bổ sung provider và truyền snapshot qua `buildApp({ models })`. GET `/api/models` giữ contract BE003.
- Giữ validation BE004. Thay 501 bằng generation: nội bộ `{ prompt, modelId }` → proxy `{ prompt, model: modelId }` → nội bộ `{ modelId, text, durationMs }`.
- Timeout riêng từng request, bao trùm cả đọc body; đo thời gian đơn điệu từ trước fetch generation đến sau đọc/kiểm tra body, không tính nạp catalog/validation prompt.
- Chuẩn hóa lỗi, không lộ key/prompt/raw response/stack; kiểm thử 2–4 request song song và retry thủ công độc lập.
- Test inject, HTTP stub cục bộ và startup child process. Tách kết quả local khỏi nghiệm thu thật.

### Out

- Gọi provider trực tiếp, `/v1/chat/completions`, tự host proxy/Redis, key quản trị/gateway hoặc tự đăng ký key.
- Streaming/Stop, Thinking, token/chi phí, multi-turn context, batch API, queue, auto retry, refresh catalog nền và persistence.
- Sửa frontend hoặc gửi prompt đến BTC từ test suite/CI/startup.

**Nguồn và mức xác minh**

- [OpenAPI](https://llm.codex.so/docs/json), GET công khai kiểm tra ngày 2026-11-12: `/models` và `/generate` cần `x-api-key`; generation nhận `prompt` và `model` tùy chọn. Ứng dụng luôn gửi model đã chọn. Schema công bố chưa chứng minh quyền truy cập bằng key thật.
- [Repo tại 80891e2](https://github.com/slaveeks/ai-proxy/tree/80891e28730da6e85d41fe9fa1b4024ed8bb237e): generation chỉ nhận prompt, model cố định bởi env, không có `/models`. Không port contract cũ này vào backend.
- [Đề bài](https://codex.so/llm-compare): token nhận trong chat, chỉ server gọi model, lưu token trong `.env`, có hạn mức. Quota/thời hạn/model giá rẻ phải xác minh ở BE006.

**Contract triển khai**

| Hướng            | Request                                                                 | Response thành công                                              |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Backend → proxy  | `GET /models`, `x-api-key`                                              | `{ models: [{ id: string, name: string }], default?: string }`   |
| Backend → proxy  | `POST /generate`, `x-api-key`, JSON `{ prompt: string, model: string }` | `{ text: string }`                                               |
| Client → backend | `POST /api/generate`, JSON `{ prompt: string, modelId: string }`        | HTTP 200 `{ modelId: string, text: string, durationMs: number }` |

- Upstream body phải là object đúng kiểu field cần dùng; không coerce. Bỏ qua field bổ sung, chỉ đưa field công khai ra API. `default` không dùng để chọn model và không đưa ra frontend.
- Catalog: array `models`; mỗi `id`/`name` không rỗng, không whitespace hai đầu, ID duy nhất. Giữ nguyên ID/name; item sai làm cả catalog lỗi. `[]` hợp lệ.
- Provider là nhãn suy ra, không phải field proxy xác nhận: prefix trước `/` đầu tiên. Mapping `openai` → `OpenAI`, `anthropic` → `Anthropic`, `google` → `Google`, `deepseek` → `DeepSeek`, `moonshotai` → `Moonshot AI`, `spacexai` → `xAI`. Prefix khác dùng nguyên prefix; thiếu prefix hoặc phần sau `/` dùng `Unknown`. Không sửa ID.
- `text` phải là string; `''` hợp lệ. Giữ Markdown, newline, whitespace; không trim, render HTML hoặc giả nội dung khi thiếu text.
- `durationMs` là milliseconds hữu hạn, không âm, chưa làm tròn; frontend định dạng giây. Không tạo metrics giá/token giả.
- `default` và mọi field upstream không dùng được bỏ qua kể cả sai kiểu; chỉ validate `models`/`id`/`name` hoặc `text` là các field thực sự tiêu thụ. Không reject catalog vì `default` không thuộc danh sách. Không phụ thuộc chính xác danh sách trong description của OpenAPI.
- Catalog thiếu dấu `/` vẫn là ID hợp lệ nếu thỏa BE003, provider là `Unknown`. Khi suy ra prefix dùng bảng mapping an toàn (`Map` hoặc kiểm tra own property), không tra object prototype bằng ID upstream. Kiểm thử prefix lạ `constructor`/`__proto__` vẫn tạo provider string, không trả object/function.

**Bản đồ file và quyết định không cần đoán**

| File                                                            | Trách nhiệm / thay đổi                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `backend/src/aiProxy.ts` — mới                                  | Native HTTP client, kiểm tra JSON, chuẩn hóa catalog, timeout và lỗi upstream; không đọc env |
| `backend/src/app.ts`                                            | Thêm optional generation dependency, truyền vào route; giữ snapshot và error handler BE004   |
| `backend/src/routes/generate.ts`                                | Giữ body schema/validation; thay nhánh 501 bằng generation hoặc 503                          |
| `backend/src/server.ts`                                         | Tạo client, lấy catalog trước listen, log startup an toàn                                    |
| `backend/test/helpers/upstream.ts` — mới                        | HTTP stub loopback, teardown dùng chung cho test                                             |
| `backend/test/aiProxy.test.ts` — mới                            | Contract client thật qua HTTP stub                                                           |
| `backend/test/proxyIntegration.test.ts` — mới                   | Toàn luồng catalog/generation, parallel và retry                                             |
| `backend/test/generate.test.ts`                                 | Giữ test reject BE004; thay test đường hợp lệ và thêm lỗi generation                         |
| `backend/test/startup.test.ts`                                  | Giữ test config/env; cập nhật URL giả thành stub, thêm catalog failure/startup               |
| `backend/.env.example`, `README.md`, `specs/BE000.md`, spec này | Hướng dẫn cấu hình, kết quả local, trạng thái bàn giao khi được giao thực thi                |

- Không sửa `config.ts`, `models.ts`, routes/models, frontend, package/lockfile hoặc thêm env option. Dùng `AppConfig`/`Model`/`validateModels` đã có; `configuredModels` mặc định vẫn `[]`. Không biến `buildApp` thành async, không thêm network ở import/module scope hoặc trong GET `/api/models`.
- Import source/type nội bộ bằng đuôi `.js` theo NodeNext, dù file source `.ts`. Helpers chỉ trong `test/`; npm test hiện thu thập `test/*.test.ts`, không đổi glob hoặc tạo test top-level ngoài mẫu này. Build chỉ xuất `src`, không đưa stub vào `dist`.
- Client giữ config trong closure; methods là function closure, không dùng `this`, để truyền `client.generate` trực tiếp không mất binding. Chỉ các test trực tiếp client mới được gọi với input fixture; route luôn validation trước.
- URL ghép bằng base đã loại slash cuối rồi thêm `/models` hoặc `/generate`; ví dụ base `http://127.0.0.1:port/proxy/` → `/proxy/models`. Không thêm `/v1`, encode model vào path hay cho request client thay base URL. Giữ HTTP loopback tương thích BE002; chỉ `.env.example` dùng HTTPS BTC.
- GET gửi `x-api-key`, không gửi body. POST gửi `x-api-key`, `Content-Type: application/json`, chỉ stringify `{ prompt, model: modelId }`; không đặt Content-Length thủ công, Bearer header, key trong query/body hoặc spread toàn config/input.
- Response 200 parse JSON kể cả khi server không khai báo đúng Content-Type; không thêm quy tắc header chưa có trong contract. Catalog/text chỉ đọc own fields của object khác null/array; không ép `unknown` thành interface bằng type assertion rồi tin là hợp lệ.
- Giữ nguyên thứ tự BE004: schema → prompt trắng → unknown model → thiếu dependency (503) → upstream. Vì vậy `buildApp()` với catalog rỗng vẫn trả 400 cho model lạ, không phải 503. Test 503 phải inject catalog có model hợp lệ.
- Route trả `{ modelId: request.body.modelId, text: result.text, durationMs: result.durationMs }`, không spread result/upstream; ID lấy từ lựa chọn đã kiểm tra. Chỉ thêm response schema 200, không gắn success schema cho mọi status khiến lỗi bị mất field.

**Lỗi generation:** envelope `{ error: { code, message } }`; message cố định, không dựa trên raw upstream message. Lỗi validation/parser BE004 giữ nguyên.

| Nguyên nhân                                   | HTTP nội bộ | code                        | message                                      |
| --------------------------------------------- | ----------- | --------------------------- | -------------------------------------------- |
| Proxy 401/403                                 | 502         | `UPSTREAM_AUTH_ERROR`       | `Model service authentication failed`        |
| Proxy 429                                     | 429         | `UPSTREAM_LIMIT_EXCEEDED`   | `Model service limit exceeded`               |
| Hết timeout                                   | 504         | `UPSTREAM_TIMEOUT`          | `Model service timed out`                    |
| Proxy status khác 200, lỗi mạng hoặc redirect | 502         | `UPSTREAM_ERROR`            | `Model service request failed`               |
| HTTP 200 nhưng JSON/body sai contract         | 502         | `UPSTREAM_INVALID_RESPONSE` | `Model service returned an invalid response` |
| App thiếu dependency generation               | 503         | `GENERATION_UNAVAILABLE`    | `Text generation is not configured`          |

Proxy 400 vẫn là `UPSTREAM_ERROR`: input đã qua validation local, catalog có thể thay đổi. Không tự chọn model khác/refresh/retry. Không chuyển 401/403 upstream thành lỗi đăng nhập người dùng. Với non-200, phân loại theo status, hủy body không dùng, không parse/echo error body. Redirect bị từ chối (`redirect: 'error'`), không gửi key tiếp đến host khác.

**Interface lỗi cố định:** export union `AiProxyErrorCode` gồm đúng năm mã `UPSTREAM_*` trong bảng; export `class AiProxyError extends Error` có `readonly code: AiProxyErrorCode`, `readonly statusCode: number`, constructor chỉ nhận `code` rồi tự chọn status/message từ bảng. Không nhận raw message/status/cause từ upstream. 503 thiếu dependency không thuộc lớp này; route trả trực tiếp. Không thêm error class/framework khác.

**Deadline và phân loại lỗi:** dùng helper HTTP private cùng file để GET/POST có cùng hành vi. Mỗi invocation tạo controller/timer mới; timer chỉ gọi `controller.abort()`. Bao fetch và đọc `response.text()` trong try/finally, dùng signal cho fetch; sau đó `JSON.parse` với kết quả `unknown`, kiểm tra schema cần dùng. Outer catch giữ nguyên `AiProxyError` đã phân loại; controller do deadline abort → timeout; lỗi fetch/đứt kết nối khi đọc body → upstream error; chỉ lỗi cú pháp JSON hoặc sai dữ liệu mới invalid response. Không phân loại chỉ theo tên `AbortError`/`TypeError`.

- Khi non-200, tạo lỗi theo status ngay; cancel body theo kiểu best effort, lỗi cleanup không được che lỗi auth/quota gốc. Không chờ đọc hết body lỗi hoặc dùng raw body để tạo message.
- Dọn timer ở finally dù success/failure. Không chỉ `Promise.race` bỏ mặc fetch đang chạy, không share controller giữa request và không dùng `.unref()` khiến CLI thoát khi request vẫn đang chờ. Không cache/mutate câu trả lời giữa các lần gọi.
- Đọc/parse/validate phải còn trong thời gian đo; kiểm tra elapsed so với timeout trước trả success để phần xử lý đồng bộ cuối không bỏ qua deadline. `durationMs` chỉ có ở success. Không đọc body hai lần hoặc gọi `.json()` sau `.text()`.

## Flow

1. `server.ts` load `.env` và `readConfig` như BE002, tạo client proxy. Không bỏ yêu cầu key bắt buộc để hỗ trợ test.
2. GET catalog với timeout, kiểm tra/chuẩn hóa rồi `buildApp({ logger: true, models, generate: client.generate })` và listen. Lỗi catalog/network/auth/timeout: startup exit khác 0, không listen/fallback, chỉ ghi phân loại an toàn.
3. `buildApp` vẫn đồng bộ, không đọc env/gọi mạng. Snapshot dùng chung cho GET models và validation. Test inject model/hàm generation không cần config thật.
4. Input sai bị chặn trước generation; input đúng gọi proxy đúng một lần, giữ prompt và model ID.
5. Client đo thời gian, đọc/kiểm tra body trong deadline; route trả kết quả hoặc lỗi theo bảng.
6. Controller/timer riêng từng request, dọn timer ở `finally`. Một lỗi không abort request khác/khóa toàn cục. Timeout dừng chờ HTTP, không khẳng định proxy đã dừng tính phí.
7. Retry thủ công là POST mới cho model đó. Catalog giữ đến restart, không GET lại mỗi lần generation. Catalog rỗng vẫn startup nhưng mọi POST bị validation từ chối.

## Edge Cases

- Catalog thiếu/null/sai kiểu, ID trùng, prefix provider lạ hoặc catalog rỗng; không fallback danh sách model trong description OpenAPI.
- Base URL có path prefix: `https://host/proxy` phải gọi `/proxy/models`, `/proxy/generate`, không làm mất prefix bằng URL bắt đầu `/`.
- 200 với JSON hỏng, array, HTML, thiếu text hoặc `text: null`; field dư bị bỏ qua, empty string hợp lệ.
- Timeout trước headers hoặc sau headers nhưng body chưa xong; lỗi mạng/redirect, non-200 với HTML. Không coi mọi network error là timeout.
- Catalog lỗi thời làm upstream trả 400; báo lỗi riêng request, không đổi model hoặc retry tự động.
- Client gửi thêm key/URL/alias `model` vẫn bị BE004 reject; không cho client điều khiển URL/header upstream.
- 2–4 request lệch tốc độ, một lỗi/timeout không làm mất kết quả còn lại; retry chỉ thêm một POST.
- Entry point vẫn cần key; test HTTP dùng loopback và key giả. Không thêm chế độ mock production hoặc khởi động bằng catalog giả khi proxy lỗi.

## Acceptance Criteria

- [x] Startup lấy catalog đúng path/header, chuẩn hóa provider và truyền snapshot cho GET/validation; lỗi nạp làm startup thất bại an toàn.
- [x] Catalog rỗng hợp lệ; catalog sai/ID trùng bị từ chối. Không fallback/hardcode model.
- [x] POST hợp lệ gọi đúng một lần với `{ prompt, model }`; trả đúng `{ modelId, text, durationMs }`, không trim hoặc dùng model mặc định.
- [x] Validation BE004 giữ nguyên, input sai không gọi generation. 501 thay bằng 200 với dependency hoặc 503 khi thiếu dependency.
- [x] Timeout gồm headers/body, timer được dọn; lỗi/log không lộ prompt/key/stack/raw response.
- [x] Request 2–4 model thực sự chồng lấn và độc lập; một lỗi không làm hỏng phần còn lại, không auto retry.
- [x] Suite chỉ dùng inject/HTTP loopback/key giả, kể cả startup; không cần Redis/gateway/key BTC.
- [x] Các regression BE004 có generation spy chứng minh input sai không gọi dependency; thiếu dependency vẫn kiểm tra input trước. Response/log tests không chỉ dựa vào `logger: false`.
- [x] Test/typecheck/build/lint và kiểm tra tài liệu đạt; báo rõ chưa nghiệm thu key BTC/chưa tích hợp frontend.

## Tasks

Thực hiện TASK-001 → TASK-005 sau BE004. Paths tính từ root; npm backend chạy ở `backend/`. Viết test thất bại trước đổi hành vi, chạy lại sau sửa. Dùng `node:test`, `node:assert/strict`, Fastify inject, `node:http`. Không tự stage/commit/push. Quyền sửa tài liệu không phải quyền triển khai code.

### TASK-001 - HTTP client và catalog

- [x] **Files:** tạo `backend/src/aiProxy.ts`, `backend/test/aiProxy.test.ts`, `backend/test/helpers/upstream.ts`; tái sử dụng `Model`, `validateModels` trong `backend/src/models.ts`.
- [x] Export `createAiProxyClient(config: Pick<AppConfig, 'llmBaseUrl' | 'llmApiKey' | 'llmTimeoutMs'>)` trước với method `listModels(): Promise<Model[]>`; TASK-002 bổ sung method generation và types. Không cần method generate giả hoặc placeholder trả thành công để hoàn tất task catalog.
- [x] Định nghĩa `AiProxyError` cùng file với code upstream/message cố định theo bảng. Lỗi bất ngờ khác vẫn đi qua 500 generic BE004.
- [x] Helper export `startUpstream(handler: RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }>` (type RequestListener từ `node:http`). Mở `127.0.0.1`, cổng `0`, lấy port sau listen; close dừng server và đóng active connections để test timeout không treo. Test đăng ký teardown ngay sau tạo server, tự dọn timer/barrier của nó; không tạo mock server production hoặc monkeypatch global fetch.
- [x] Test `lists and normalizes catalog`, `rejects invalid catalog`, `preserves base URL prefix`, `rejects redirect without forwarding key`: assert method/path/key giả, provider, empty catalog, ID trùng/item sai và field dư bị bỏ qua.
- [x] Catalog matrix: thiếu models/null/array top-level/models sai kiểu/item null/id hoặc name sai kiểu/rỗng/whitespace/ID trùng → invalid response; default sai kiểu/field dư → bỏ qua. Test đủ mapping provider, unknown prefix, ID không slash và prefix prototype kể trên. GET không body và đúng một lần.
- [x] Implement listModels bằng helper HTTP/deadline đã chốt; parse và chuẩn hóa metadata rồi gọi `validateModels` trên kết quả mới. Convert lỗi catalog thành `AiProxyError('UPSTREAM_INVALID_RESPONSE')`, không để Error từ validateModels làm startup log raw metadata. Chưa implement generation ở task này.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck`; host test chỉ loopback, không token BTC.

### TASK-002 - Generation, thời gian và lỗi upstream

- [x] **Files:** hoàn thiện `backend/src/aiProxy.ts`, `backend/test/aiProxy.test.ts`.
- [x] Export `GenerateInput = { prompt: string; modelId: string }`, `GenerateResult = { text: string; durationMs: number }`, `Generate = (input: GenerateInput) => Promise<GenerateResult>` ngay trong `aiProxy.ts`. Bổ sung `generate: Generate` vào client trả về TASK-001, giữ listModels như cũ; không thêm service container/type file riêng.
- [x] Test request đúng `{ prompt, model }`, header key giả/content type; Markdown/newline/empty string giữ nguyên. Không gửi `modelId`/metadata nội bộ sang proxy.
- [x] Implement `generate` theo TASK-001, dùng `performance.now()`; mỗi invocation có timeout/controller riêng. Deadline bao gồm đọc/parse body, dọn timer trong `finally`, không clear ngay sau headers.
- [x] Test 401/403/429/400/500, lỗi mạng/redirect và 200 sai JSON/text; lỗi theo status kể cả body HTML, hủy body non-200 không dùng. Test timeout cả trước headers và khi body chậm sau headers; assert đúng một request, không auto retry.
- [x] Dùng `flushHeaders()` + body chưa kết thúc để chứng minh deadline đọc body; test stub ngắt socket sau headers phải là upstream error, không invalid response/timeout. Non-200 body không kết thúc vẫn trả lỗi đúng status. Redirect dùng server đích thứ hai và counter bằng 0, không chỉ assert server đầu trả lỗi. Test dùng timeout cỡ hàng trăm ms và test deadline rộng hơn, không yêu cầu chính xác lịch scheduler.
- [x] Assert duration hữu hạn/không âm, gồm thời gian đọc body bằng phản hồi trì hoãn có kiểm soát; không so milliseconds chính xác/đặt ngưỡng trên sát hiệu năng máy.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck`; mọi request/timer/server được cleanup khi pass hoặc fail.

### TASK-003 - Nối generation vào API nội bộ

- [x] **Files:** sửa `backend/src/app.ts`, `backend/src/routes/generate.ts`, `backend/test/generate.test.ts`.
- [x] Thêm optional `generate?: Generate` vào `BuildAppOptions` và helper `registerGenerateRoutes(app, models, generate?)`; import type từ `aiProxy.ts`. `buildApp` không tạo client/gọi mạng.
- [x] Chữ ký helper cuối là `registerGenerateRoutes(app: FastifyInstance, models: readonly Model[], generate?: Generate): void`; trong app gọi `registerGenerateRoutes(app, modelsSnapshot, options.generate)`. Chỉ sửa vị trí thay 501, schema 200 và import; giữ strict Ajv/error handler global/404/snapshot như BE004.
- [x] Sau validation, thiếu dependency trả trực tiếp 503 theo bảng; có dependency thì await generate, trả object 200 đúng ba field công khai. Response schema bắt buộc modelId/text string, durationMs number `minimum: 0`, không field dư.
- [x] Route bắt `AiProxyError`, trả đúng status/code/message; không throw qua error handler 5xx generic BE004. Lỗi bất ngờ vẫn 500 generic.
- [x] Chuyển test đường hợp lệ từ 501 sang dependency fake trả kết quả, thêm test thiếu dependency 503. Giữ ca reject input/Unicode/parser 413/415/snapshot; assert input sai không gọi generation.
- [x] Inject fake `Generate` vào cả các nhóm reject input để spy thật sự đo được số lần gọi bằng 0; không dùng thiếu dependency để chứng minh điều này. Với success: spy nhận nguyên prompt có whitespace/newline và ID; fake trả `{ text: '  Markdown\n', durationMs: 12.5 }`, response deep-equal ba field chính xác. Snapshot test vẫn chấp nhận ID cũ bằng 200, từ chối ID bị mutate bằng 400.
- [x] Test mọi `AiProxyErrorCode` qua fake throw `new AiProxyError(code)` và deep-equal status/envelope theo bảng; throw Error thường có sentinel → 500 generic. 503 thiếu dependency chỉ sau body/model hợp lệ; prompt trắng hoặc ID lạ vẫn 400. Không sửa error handler global để nó phân loại toàn bộ 5xx là lỗi upstream.
- [x] Test ánh xạ lỗi, schema response và lỗi bất ngờ không lộ sentinel secret. Fake answer chỉ ở test.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck`; không nới validation hoặc đổi frontend.

### TASK-004 - Startup catalog và request đồng thời

- [x] **Files:** sửa `backend/src/server.ts`, `backend/test/startup.test.ts`; tạo `backend/test/proxyIntegration.test.ts`; dùng helper TASK-001.
- [x] Sau readConfig: tạo client, await listModels, truyền models/generate vào buildApp, rồi listen. Giữ load env, host/port và cleanup BE002. Không thay `configuredModels` mặc định rỗng bằng fixture; runtime entrypoint luôn truyền catalog proxy.
- [x] Startup catch chỉ log code/message an toàn cho `AiProxyError`, không raw fetch error/cause/config/request. Giữ thông báo lỗi config an toàn BE002.
- [x] Thêm nhánh `err instanceof AiProxyError` trước nhánh raw `app.log.error` đang có; log cố định `Failed to load model catalog: ${err.code}` qua console.error, exitCode 1. Startup catalog xảy ra trước buildApp nên không dùng logger của app chưa tồn tại. Không thay đổi thông báo config hoặc đọc env lần hai trong client.
- [x] Child-process tests dùng env riêng với URL loopback/key giả: catalog đúng → startup/health/models đạt; 401/403/429/timeout/JSON hỏng/catalog sai → exit khác 0 trước listen; empty catalog vẫn startup và POST bị reject. Chọn cổng riêng, cleanup child/server trong finally; không thừa kế URL/key BTC vào test startup.
- [x] Cập nhật test `startup loads .env file and process.env overrides file values, serving health check` hiện có: URL trong file .env trỏ stub A; URL env trỏ stub B; key/port env khác file. Stub B assert key env và nhận catalog GET, stub A counter 0; API models trả catalog B. Không còn dùng `https://file.example.invalid` cho happy path vì BE005 thực sự gọi mạng lúc startup. Giữ test thiếu key thất bại trước mọi HTTP request.
- [x] Child dùng `process.execPath`, tsx loader URL và absoluteServerPath như file hiện có, cwd là tempDir riêng để tránh đọc `.env` thật. Gắn listener exit và capture stdout/stderr ngay sau spawn (trước polling). Test có deadline, phát hiện child thoát sớm; finally kill child nếu còn sống, await exit có giới hạn, đóng stub rồi xóa đúng tempDir. Không kill process theo tên hoặc đóng cổng server người dùng.
- [x] Child happy path gọi một generation qua HTTP cục bộ với prompt sentinel, stub tạo lỗi với raw error sentinel; log với `logger: true` phải không chứa prompt/key/raw error hoặc stack. Kết thúc child rồi mới assert toàn stdout/stderr để tránh đọc log quá sớm. Chưa test log nếu chỉ inject app logger false.
- [x] Integration dùng client thật trỏ stub và buildApp: GET catalog rồi POST 2/3/4 model đồng thời. Dùng barrier đợi đủ request đến trước trả kết quả để chứng minh overlap, không chỉ đo tổng thời gian; barrier có deadline/cleanup tránh test treo khi regression tuần tự.
- [x] Khởi tạo các inject promises cùng lúc rồi await `Promise.all`; không await từng vòng lặp. Tạo app/stub riêng cho mỗi scenario để counter rõ ràng. Scenario lỗi HTTP và scenario timeout riêng, kết quả còn lại đều 200. Test retry thất bại lần đầu, thành công lần hai ở cùng model với counter riêng; không dùng random để tạo lỗi/thời gian.
- [x] Assert prompt/model/kết quả đúng từng request; một lỗi hoặc timeout không abort request khác; catalog chỉ GET một lần. Retry thủ công chỉ thêm một POST cho model lỗi, không gọi lại model thành công.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck`, `npm run build`; thêm test startup khi port đã bị chiếm: vẫn lấy catalog stub, listen thất bại và process exit 1, không treo. Không giả định test port-busy đã có trong source hiện tại; không gọi BTC.

### TASK-005 - Bàn giao local và chuẩn bị BE006

- [x] **Files khi thực thi:** `backend/.env.example`, `README.md`, `specs/BE000.md` và lịch sử cuối spec này, theo quyền người dùng cấp. Đây là task tương lai, không phải các file sẽ sửa khi soạn spec. Không sửa `.env` thật/thêm secret.
- [x] `.env.example` dùng URL HTTPS BTC/key placeholder, giữ timeout/port BE002. README giải thích startup cần catalog proxy thành công; test dùng stub không cần key thật. Không thêm cờ mock production hoặc bỏ yêu cầu key.
- [x] README phải tiếp tục nói frontend đang mock/chưa kết nối backend. Không ghi “ứng dụng đã so sánh LLM thật” khi chỉ hoàn tất backend local. Không tick checklist BE004/BE006 như bằng chứng nghiệm thu live, không xóa lịch sử cũ hoặc đổi dependencies chỉ để kiểm thử xanh.
- [x] Backend: `npm test`, `npm run typecheck`, `npm run build`. Root: `npm run lint`, `npx --no-install prettier --check` với file thay đổi, `git diff --check`. Ghi số test/kết quả thực tế sau chạy.
- [x] Kiểm tra response/log bằng sentinel prompt/key/raw error trong failure tests: không có sentinel hoặc stack. Rà không có test/CI/startup tự gửi prompt thử đến BTC.
- [x] Ghi rõ “đạt kiểm thử local theo OpenAPI; chưa nghiệm thu key/model BTC”. BE006 xác minh `/docs/json`, GET `/models` với key được cấp trước, rồi gửi ít request generation cho model được xác nhận phù hợp chi phí; không gây 429 thật/chạy vòng lặp để chứng minh quota.
- [x] Bàn giao BE007 contract models/generation/lỗi và đơn vị durationMs; frontend phải thay fixture IDs bằng catalog thật, xử lý các POST độc lập. Không đánh dấu streaming/giá/mobile hoàn thành bởi BE005.

### 2026-11-12 - Cụ thể hóa spec cho Gemini 3.8 Flash

- Đối chiếu source BE004 đã review: BuildAppOptions chưa có generate; route hợp lệ trả 501, startup chưa gọi proxy và happy-path startup test dùng URL giả. Baseline review trước BE005 ghi nhận 67 tests đạt, không dùng số này thay kết quả chạy sau triển khai.
- Làm rõ interface theo từng task, file scope, provider mapping, body parsing/timeout/error precedence, dependency ordering và giữ input nguyên trạng.
- Bổ sung cách cập nhật startup env test, capture log, teardown child/stub và chứng minh request song song bằng barrier. Chỉ cập nhật spec; mọi task implementation vẫn chưa tick.

### 2026-11-12 - Kết quả triển khai local BE005

- **Trạng thái nghiệm thu:** **đạt kiểm thử local theo OpenAPI; chưa nghiệm thu key/model BTC** và **chưa tích hợp frontend**. Không có test/CI/startup nào tự gọi `https://llm.codex.so` hoặc lưu key thật.
- **Files đã tạo/sửa:**
  - Code: `backend/src/aiProxy.ts`, `backend/src/app.ts`, `backend/src/routes/generate.ts`, `backend/src/server.ts`.
  - Tests: `backend/test/helpers/upstream.ts`, `backend/test/aiProxy.test.ts`, `backend/test/proxyIntegration.test.ts`, `backend/test/generate.test.ts`, `backend/test/startup.test.ts`.
  - Tài liệu & cấu hình mẫu: `backend/.env.example`, `README.md`, `specs/BE000.md`, `specs/BE005-ai-proxy-integration.md`. Không sửa `config.ts`, `models.ts`, `routes/models.ts`, `frontend/`, `package.json`, lockfile hoặc tạo `.env`.
- **Kiểm tra sau sửa đổi cuối:**
  - `backend/`: `npm test` (**130/130** tests/subtests pass bằng inject và HTTP stub cục bộ), `npm run typecheck` (exit 0), `npm run build` (exit 0; `dist/` chỉ xuất source, không chứa test/stub).
  - Root: `npm run lint` (exit 0), `npx --no-install prettier --check` trên tất cả các file thay đổi (exit 0), `git diff --check` (exit 0).
- **Chuẩn bị BE006 & bàn giao BE007:**
  - BE006 cần xác minh `/docs/json` và `GET /models` với key BTC được cấp trước, sau đó chọn model phù hợp chi phí để gửi ít request generation kiểm tra live; không chạy vòng lặp/gây 429 thật.
  - BE007 sử dụng contract `GET /api/models` (`{ models: [{ id, name, provider }] }`), `POST /api/generate` (`{ prompt, modelId }` → `200 { modelId, text, durationMs }` với `durationMs` tính bằng milliseconds dạng float chưa làm tròn), và envelope lỗi chuẩn hóa `{ error: { code, message } }`; frontend cần thay fixture ID bằng catalog thật và gửi từng `POST /api/generate` độc lập cho mỗi model.

### 2026-11-12 - Review và kiểm tra lại BE005 (Codex)

- Review source, tests và reviewer độc lập không phát hiện blocker về catalog, generation, timeout headers/body, phân loại lỗi, redirect/key, startup hoặc tính độc lập của các request. Không sửa logic production khi chưa có lỗi được tái hiện.
- Lượt kiểm tra đầu có 130/130 tests, typecheck/build/lint đạt nhưng Prettier báo lỗi ở `backend/test/helpers/upstream.ts`; đã sửa format, thay thế kết luận format đạt trong bàn giao cũ bằng kết quả chạy lại.
- Bổ sung test-level timeout cho ca deadline generation (5 giây), ca non-200 có body không kết thúc (10 giây) và integration timeout (5 giây), để regression abort không treo suite. Giữ timeout production và hành vi API hiện có.
- Đính chính các trạng thái hiện tại trong BE000, đầu BE004 và Goal BE005: 501 là mốc lịch sử BE004, đã được BE005 thay thế. Không sửa lịch sử nghiệm thu cũ hoặc đánh dấu tích hợp frontend/live hoàn thành.
- Sau thay đổi review: backend `npm test` **130/130 tests pass**, `npm run typecheck`, `npm run build`; root `npm run lint`, targeted Prettier toàn bộ file liên quan và `git diff --check` đều exit 0. Reviewer không thay thế các kiểm tra chạy lại này.
- Giới hạn: chỉ inject/HTTP loopback; không gọi proxy/model BTC thật hoặc dùng key thật. Không có log từng task để xác minh trình tự TDD Gemini. Không stage/commit/push.
