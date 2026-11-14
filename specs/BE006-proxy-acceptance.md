# BE006 - Nghiệm thu proxy BTC và smoke test thủ công

## Goal

Có cách kiểm tra lặp lại cấu hình thật, catalog và một generation qua backend, không sửa logic production đã đạt BE005 và không tự tiêu hao quota trong test/CI. Tách rõ bằng chứng đã có với kết quả cần chạy khi thực thi spec.

**Trạng thái:** đã triển khai CLI và hoàn tất kiểm thử tự động (kết quả sau review xem lịch sử cuối spec) ngày 2026-11-13; chưa chạy lại live vì lượt triển khai này chưa có model được người dùng chỉ định/xác nhận và cho phép gọi mạng thật. Theo [F000-pattern](F000-pattern.md). Phụ thuộc BE001–BE005 và thay đổi env gốc đã có trong checkout.

**Người thực thi:** Gemini 3.8 Flash. Đọc `AGENTS.md`, [BE000](BE000.md), spec này, `backend/src/{config,aiProxy,app,server}.ts`, `backend/test/startup.test.ts` và `backend/test/helpers/upstream.ts` trước khi code. Áp dụng `karpathy-guidelines`, `ponytail`, TDD và verification. Spec đã có task; không tạo thêm plan, abstraction, dependency hoặc file kiến trúc. Người dùng hiện chỉ yêu cầu soạn spec; phải có xác nhận triển khai code theo AGENTS.md. Quyền triển khai local không tự bao gồm quyền gọi model thật.

## User Story

Là người cấu hình ứng dụng, tôi muốn chủ động kiểm tra key và một model được chỉ định, nhận kết quả rõ ràng không lộ secret, để biết backend sẵn sàng cho bước tích hợp frontend.

## Scope

### In

- Thêm CLI TypeScript chạy thủ công bằng `tsx`, dùng Node.js 24 và các module backend sẵn có. Không thêm HTTP server hoặc production endpoint.
- Mặc định chỉ GET catalog một lần. Generation cần đồng thời `--generate` và `--model <id>`; tối đa một POST, prompt cố định, không tự retry hoặc đổi model.
- Tạo app bằng `buildApp` với client/catalog thật, kiểm tra health/models/generate qua Fastify inject. Đây là smoke test wiring nội bộ + HTTP upstream thật; không phải test listen/TCP của server đang chạy.
- Kết quả một dòng JSON an toàn, exit code rõ ràng; luôn cleanup app. Test tự động dùng HTTP loopback/key giả/env tạm.
- Cập nhật hướng dẫn chạy và ghi bằng chứng thực tế, gồm giới hạn quota/thời hạn/quyền model chưa xác minh.

### Out

- Không thay đổi `backend/src/**`: env loader, readConfig, client proxy, validation, snapshot, route response và mapping lỗi giữ nguyên.
- Không thêm pricing/usage vào API, công thức giá, streaming/Stop/reasoning, UI, mobile, persistence, multi-turn context hoặc auto refresh catalog. Metadata thuộc BE007; streaming thuộc BE008.
- Không dò tất cả model, thử quota/429 thật, thử key sai thật, sửa `.env`, đọc/in key vào chat hoặc nhận key trên CLI.
- Không tự host proxy/Redis, gọi provider trực tiếp, thêm SDK/dependency, CI job hoặc hook tự chạy smoke live.

### Contract và quyết định đã chốt

Nguồn đối chiếu ngày 2026-11-13: [README BTC tại 6bfb63d](https://github.com/codex-team/ai-proxy/blob/6bfb63d3bbd03bc9477244ab2c2d372690e064df/README.md), [source cùng revision](https://github.com/codex-team/ai-proxy/tree/6bfb63d3bbd03bc9477244ab2c2d372690e064df/src) và [OpenAPI live](https://llm.codex.so/docs/json). Trước smoke live, đọc lại OpenAPI công khai; nếu contract cần dùng đã đổi, báo khác biệt, không tự sửa production để thích ứng.

- Proxy `/models` và `/generate` dùng `x-api-key`; generation nhận `{ prompt, model }`. Không dùng Bearer, `/v1/chat/completions` hay HTTP thay cho HTTPS BTC đã cấu hình.
- Proxy mới có `pricing`/`usage`; client hiện chỉ tiêu thụ id/name/text, bỏ qua field bổ sung. Đây là chủ ý phạm vi BE005/BE006, không phải lỗi cần sửa trong task này.
- API nội bộ models: `{ models: [{ id, name, provider }] }`; generate: `{ prompt, modelId }` → HTTP 200 `{ modelId, text, durationMs }`. Dùng đúng model ID từ catalog, không hardcode catalog hoặc giả định model theo tên là rẻ nhất.
- Dùng lại `AiProxyError.code` và thông báo cố định của route; không log raw upstream body/error/cause/stack. 401/403 upstream hiện được chuẩn hóa thành HTTP 502 `UPSTREAM_AUTH_ERROR`; không diễn giải thành người dùng cần đăng nhập.
- CLI chỉ cấu hình URL/key/timeout qua `readConfig(process.env)` sau load `.env` gốc. Biến hệ thống được ưu tiên như server hiện tại; không thêm biến env mới.

### File scope khi triển khai

| File                                    | Thay đổi duy nhất được phép trong BE006                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `backend/scripts/smoke-proxy.ts` — mới  | CLI tự chứa, dùng module sẵn có; không export framework/helper chung |
| `backend/test/smokeProxy.test.ts` — mới | Child-process tests + upstream stub; không gọi BTC                   |
| `backend/package.json`                  | Chỉ thêm script `"smoke:proxy": "tsx scripts/smoke-proxy.ts"`        |
| `backend/tsconfig.json`                 | Chỉ thêm `scripts/**/*.ts` vào include để CLI được typecheck         |
| `README.md`                             | Hướng dẫn lệnh, giới hạn và cách đọc kết quả                         |
| `specs/BE000.md`, spec này              | Cập nhật trạng thái/kết quả sau kiểm tra, giữ lịch sử                |

Không sửa lockfile, `.env`, `.env.example`, frontend, FE000, production source, test cũ hoặc tsconfig build. Nếu phát hiện lỗi production, báo file/tình huống tái hiện và dừng phần phụ thuộc; không mở rộng BE006 thành bugfix chưa được duyệt. Không stage/commit/push hoặc ghi đè thay đổi hiện có của người dùng.

### CLI cố định

Chạy từ gốc repo:

```sh
npm run smoke:proxy --prefix backend
npm run smoke:proxy --prefix backend -- --generate --model openai/gpt-5-mini
```

Hoặc từ `backend/`: `npm run smoke:proxy` và `npm run smoke:proxy -- --generate --model <id>`.

- Chấp nhận đúng hai dạng args: `[]` hoặc `['--generate', '--model', '<id>']`. ID phải không rỗng/không có whitespace hai đầu. Từ chối flag lạ, thiếu/thừa/đảo thứ tự/lặp flag. Không thêm parser library, help framework, tùy chọn prompt, URL, key, output file hoặc batch.
- Validate args trước load env/gọi mạng. Không dùng default model của proxy khi thiếu `--model`. Không trim/lowercase ID đã nhập.
- Prompt duy nhất: `Reply with only: OK`. Chỉ cần response text là string không trắng để nghiệm thu generation; không assert bằng `OK` tuyệt đối vì output LLM không đảm bảo tuân thủ chính xác. Empty string vẫn hợp lệ ở production nhưng smoke phải báo không đủ bằng chứng nội dung, không sửa client để reject toàn cục.
- Dùng `new URL('../../.env', import.meta.url)`, `existsSync` và `loadEnvFile` như server; không phụ thuộc cwd, không tìm `.env` tại cwd hoặc frontend/backend. Lỗi đọc env dùng mã cố định, không in raw error.

### Output cố định

CLI ghi đúng một dòng JSON trên stdout khi thành công. `npm run` có thể thêm banner riêng của npm; test gọi trực tiếp Node/tsx nên chỉ đánh giá output của script.

```json
{ "ok": true, "mode": "catalog", "modelCount": 10, "health": "ok" }
```

```json
{
  "ok": true,
  "mode": "generate",
  "modelCount": 10,
  "health": "ok",
  "modelId": "openai/gpt-5-mini",
  "durationMs": 2278.86,
  "textNonEmpty": true
}
```

Số count/duration trong ví dụ không phải kỳ vọng hardcode. Không làm tròn duration trong CLI. Không in key, URL, env/config, prompt, generated text, raw body hoặc danh sách model; truyền `logger: false` cho app.

Thất bại: stdout rỗng, stderr đúng một dòng `{"ok":false,"code":"..."}`, exit code 1. Không thêm raw message hoặc giá trị argument vào error. Mã được phép:

| Tình huống                                                                                  | code                        |
| ------------------------------------------------------------------------------------------- | --------------------------- |
| Args sai                                                                                    | `SMOKE_INVALID_ARGS`        |
| Không đọc được env                                                                          | `SMOKE_ENV_LOAD_FAILED`     |
| readConfig thất bại, gồm thiếu key                                                          | `SMOKE_CONFIG_INVALID`      |
| Catalog rỗng                                                                                | `SMOKE_EMPTY_CATALOG`       |
| Model không có trong catalog                                                                | `SMOKE_MODEL_NOT_FOUND`     |
| Health/models inject sai status hoặc body khác contract/snapshot                            | `SMOKE_API_CONTRACT_FAILED` |
| Generate HTTP 200 sai ba field/types/modelId hoặc duration không hữu hạn/âm                 | `SMOKE_API_CONTRACT_FAILED` |
| Generate HTTP 200 nhưng text trắng/rỗng                                                     | `SMOKE_EMPTY_TEXT`          |
| Client ném `AiProxyError` hoặc route trả envelope với một trong năm mã AiProxyError hiện có | Giữ đúng mã `UPSTREAM_*` đó |
| Exception/lỗi inject khác hoặc cleanup app thất bại                                         | `SMOKE_FAILED`              |

Không tin code tùy ý từ upstream: chỉ cho phép năm mã có trong `AiProxyErrorCode`. Không tạo lớp lỗi mới; dùng các nhánh/hàm private ngắn trong cùng script. Lưu kết quả rồi cleanup trước khi in JSON để không in success trước cleanup; dùng `process.exitCode`, không `process.exit()`.

## Flow

1. Validate args; lỗi thoát trước load env/network. Load env gốc nếu có, rồi gọi `readConfig` với lỗi an toàn.
2. Tạo `createAiProxyClient(config)`; gọi `listModels()` đúng một lần. Rỗng → lỗi; không POST.
3. Nếu generate mode, kiểm tra ID khớp catalog trước tạo request. Không fallback model.
4. Tạo `buildApp({ logger: false, models, generate: client.generate })`. Không import `server.ts`, không listen/đóng cổng người dùng.
5. Inject `GET /api/health` và `GET /api/models`; assert 200, health đúng `{ status: 'ok' }`, models đúng snapshot từ client (id/name/provider, không pricing/default).
6. Catalog mode hoàn tất, không POST. Generate mode inject đúng một `POST /api/generate` với prompt cố định và ID đã kiểm tra; validate response theo bảng output.
7. Đóng app trong finally dù lỗi/thành công. In đúng JSON an toàn sau cleanup và đặt exit code. Không retry/loop generation.

## Edge Cases

- `.env` gốc vắng nhưng env hệ thống đủ vẫn chạy; cả hai thiếu key phải fail trước HTTP. Env hệ thống ghi đè file; `.env` ở cwd không được đọc.
- Args sai, catalog rỗng, ID không tồn tại: số POST bằng 0. Model lỗi không kích hoạt thử model khác.
- Catalog có field pricing/default hoặc generation có usage bổ sung không làm CLI báo lỗi khi field đang dùng vẫn hợp lệ.
- 401/403/429/timeout/JSON hỏng: giữ phân loại client hiện có, không echo sentinel trong response/error.
- Catalog đã GET thành công không có nghĩa mọi model được phép generate, hay quota còn bao nhiêu. Không in `all models verified`.
- Script dùng inject không kiểm chứng server listen hoặc browser/CORS. Startup/TCP có bằng chứng lịch sử và suite startup riêng; frontend thuộc FE006.
- Test child process phải dùng env riêng, bỏ toàn bộ `LLM_*` và `PORT` kế thừa trước thêm key/URL loopback. Không copy `.env` thật vào fixture.

## Acceptance Criteria

- [x] CLI/package script/typecheck include đúng file scope; không đổi production contract/dependency/build output.
- [x] Chế độ mặc định GET catalog một lần, health/models inject đạt, POST bằng 0, output đúng schema.
- [x] Generate chỉ chạy với hai flag đúng; model có trong catalog, một POST đúng payload/prompt, không retry; output không chứa text/key/prompt.
- [x] Args/config sai fail trước network; model lạ/catalog rỗng fail trước POST; exit code và mã lỗi đúng bảng.
- [x] Env gốc độc lập cwd, env hệ thống ưu tiên; tests dùng temp root và key giả.
- [x] Các test lỗi chứng minh phân loại an toàn, không lộ sentinel; child/app/stub/timer được dọn, không treo suite.
- [x] Test/typecheck/build/lint/format/diff đạt với kết quả thực tế; build không chứa script/test.
- [x] Hướng dẫn phân biệt smoke inject+HTTP upstream với server TCP và ứng dụng frontend; pricing/usage/streaming vẫn chưa nghiệm thu.
- [x] Lịch sử bàn giao tách kiểm thử local, bằng chứng live cũ và live mới (chưa chạy lại live). Không tick live dựa trên stub hoặc yêu cầu phải kiểm tra mọi model.

## Tasks

Thực hiện TASK-001 → TASK-004 khi được giao triển khai. Paths từ gốc repo; npm backend chạy tại `backend/` nếu không ghi `--prefix backend`. Viết test trước hành vi code, chạy thấy fail đúng nguyên nhân rồi mới implement. Không cần tách plan/file khác.

### TASK-001 — Test CLI catalog, args và env

- [x] Tạo `backend/test/smokeProxy.test.ts`, dùng `node:test`, `node:assert/strict`, `startUpstream` hiện có và child Node với tsx loader resolve từ package như startup tests.
- [x] Fixture: temp root có `backend/src` copy từ source, `backend/scripts` copy khi đã có; package `{ "type": "module" }`, junction node_modules như startup fixture. Chạy absolute CLI path với cwd temp root hoặc temp/backend. Viết `.env` giả chỉ trong fixture. Cleanup chỉ temp root đã tạo; không xóa đích junction node_modules.
- [x] Thu stdout/stderr ngay sau spawn, deadline mỗi child 10 giây với stub timeout ngắn 200 ms; kill/await exit/đóng stub/xóa temp trong finally, theo startup tests. Không sleep cố định hoặc kill theo tên process.
- [x] Ca default catalog: stub trả một model và pricing field dư, assert một GET `/models`, header key giả, GET không body, POST 0; output deep-equal catalog schema.
- [x] Table args sai: chỉ model, chỉ generate, thiếu ID, whitespace ID, flag lạ/lặp/đảo/thừa; assert exit1/INVALID_ARGS và tổng HTTP0. Thiếu key: CONFIG_INVALID và HTTP0.
- [x] Ca root env ở hai cwd; env hệ thống override URL/key trong file (hai stub, stub file nhận 0 khi overridden), `.env` backend chứa giá trị invalid nhưng không được đọc.
- [ ] Chạy test mới, ghi nhận fail vì thiếu CLI trước khi viết script. Không sửa test cũ. Chưa có log để xác minh trình tự TDD của lượt Gemini; không suy ra từ suite đang pass.

### TASK-002 — CLI tối thiểu và lệnh chạy

- [x] Tạo `backend/scripts/smoke-proxy.ts` theo CLI/output/Flow ở trên; imports nội bộ dùng đuôi `.js` từ `../src/`. Không import server.ts hoặc đưa smoke logic vào src.
- [x] Chỉ thêm `smoke:proxy` vào package scripts và `scripts/**/*.ts` vào tsconfig include. Build config đã include riêng src, giữ nguyên.
- [x] Implement catalog/args/env/cleanup/output để TASK-001 pass; chạy test mới và typecheck. Dùng `buildApp`/client/readConfig, không tự viết lại request/header/deadline/catalog parser.

### TASK-003 — Generation và failure matrix

- [x] Viết test fail trước: generate valid → một GET + một POST `/generate`, key giả, body đúng `{ prompt: 'Reply with only: OK', model: id }`; response stub chứa text sentinel + usage. Output chỉ có các field generate đã chốt, duration hữu hạn/không âm, không text sentinel.
- [x] Thêm ca empty catalog/unknown model (POST0), text rỗng/whitespace, text thiếu/sai kiểu; phân biệt EMPTY_TEXT với UPSTREAM_INVALID_RESPONSE của client.
- [x] Table lỗi client qua stub: 401/403 → AUTH_ERROR, 429 → LIMIT_EXCEEDED, 500 → ERROR, 200 JSON hỏng → INVALID_RESPONSE, timeout → TIMEOUT. Thử cả GET catalog và POST generation; mỗi ca không retry, không fallback. Response body lỗi có sentinel secret/stack; assert toàn stdout/stderr không chứa key/prompt/text/raw error sentinel.
- [x] Implement phần generation và các nhánh lỗi theo đúng bảng; không nới schema production, không thêm metrics. Chạy lại test mới, backend suite và typecheck.

### TASK-004 — Verification và bàn giao giới hạn

- [x] Backend: `npm test`, `npm run typecheck`, `npm run build`. Root: `npm run lint`, `npx --no-install prettier --check backend/scripts/smoke-proxy.ts backend/test/smokeProxy.test.ts backend/package.json backend/tsconfig.json README.md specs/BE000.md specs/BE006-proxy-acceptance.md`, `git diff --check`. Kiểm tra dist không chứa scripts/test. Ghi số test và exit code thực tế, không dùng lại số cũ.
- [x] README thêm hai lệnh CLI đã chốt, cảnh báo generation là request thật tiêu quota, default chỉ catalog; kết quả không chứng minh frontend/TCP hoặc mọi model. Không thêm giá/token chưa triển khai.
- [x] Ghi trong BE006: revision/OpenAPI đối chiếu, kết quả local, giới hạn. BE000 chỉ cập nhật trạng thái gọn. Không sửa FE000/BE005 hoặc tạo file report khác.
- [ ] Live mới chỉ khi người dùng cho phép ở lượt triển khai (chưa chạy, không phải blocker local): kiểm tra OpenAPI công khai, rồi chạy một lần lệnh generate với model được người dùng chỉ định/xác nhận còn trong catalog; không chạy catalog riêng trước để lặp GET không cần thiết. Không suy ra quyền gọi từ việc key tồn tại. Nếu lỗi, báo lỗi, không tự chạy lại.
- [x] Nếu chưa được phép hoặc chưa có key/quyền model: hoàn tất phần code/local, ghi `chưa chạy lại live` và nguyên nhân; không tick nghiệm thu live mới. Bằng chứng cũ bên dưới vẫn giữ đúng nhãn lịch sử.

### Kết quả kiểm thử tự động local — 2026-11-13

- Toàn bộ backend test suite: 170 tests pass (132 test cũ + 38 test mới trong `smokeProxy.test.ts`), 0 failures, exit code 0.
- Typecheck (`tsc --noEmit -p tsconfig.json`): exit code 0, không có lỗi type.
- Build backend (`tsc -p tsconfig.build.json`): exit code 0; `backend/dist` hoàn toàn sạch, chỉ chứa code production từ `src/`, không chứa scripts hay test.
- Trạng thái live mới: **chưa chạy lại live** vì lượt yêu cầu hiện tại người dùng chưa chỉ định model cụ thể và chưa cấp quyền gọi mạng tiêu quota thật; giữ nguyên bằng chứng lịch sử trước BE006 bên dưới.

### Bằng chứng có trước BE006 — 2026-11-13

Đã quan sát backend nghe cổng 3000, health OK, catalog 10 model và một generation `openai/gpt-5-mini` trả HTTP200/text OK, khoảng 2278,86 ms. Đây là lần chạy thủ công trước khi có CLI BE006; không phải bằng chứng CLI đã triển khai hoặc đã pass. Chưa xác minh quota/thời hạn key, generation của chín model còn lại, metadata API nội bộ, streaming/reasoning và frontend thật. Không có yêu cầu gọi lại để tái tạo chính xác duration hoặc nội dung này.

### 2026-11-13 — Review và sửa sau Gemini (Codex)

- Baseline chạy độc lập: backend 170/170 tests, typecheck/build đạt. Không dùng kết quả cũ thay cho verification sau sửa.
- Sửa smoke CLI từng chấp nhận field dư trong health/catalog/item/generation nội bộ: thêm kiểm tra chính xác keys theo contract. Upstream pricing/usage vẫn được client bỏ qua như BE005; không thay production source.
- Sửa unknown/non-JSON lỗi generation inject về SMOKE_FAILED theo bảng lỗi; vẫn giữ whitelist năm mã UPSTREAM_*.
- Regression fault injection chỉ trong bản app sao chép ở temp: bốn ca field dư và một ca lỗi inject không biết đã fail trước sửa, pass sau sửa. Không thêm fault hook vào source production.
- Thêm hai ca chỉ lấy cấu hình từ root .env (cwd gốc/backend, không system override) và ca .env không đọc được. Test trước đó chỉ chứng minh precedence, chưa đủ chứng minh key/URL được đọc từ file gốc.
- Test harness đợi child close để stdio đã drain trước khi đọc kết quả, thay vì chỉ exit. Không thay test startup hiện có hoặc cơ chế chạy server.
- Đính chính checklist: chưa có log chứng minh trình tự TDD của Gemini; chưa chạy lại live. Giữ nguyên lịch sử bàn giao 170 tests và bằng chứng live có trước CLI.
- Verification cuối: backend npm test **179/179 tests/subtests pass**, npm run typecheck và npm run build exit0; root npm run lint, targeted Prettier và git diff --check đạt. Dist chỉ chứa production src, không scripts/test.
- Phạm vi sửa review: backend/scripts/smoke-proxy.ts, backend/test/smokeProxy.test.ts, README.md và spec này. Không đọc/sửa .env thật, gọi proxy/model thật, đổi production API, dependency, frontend hoặc stage/commit/push.
