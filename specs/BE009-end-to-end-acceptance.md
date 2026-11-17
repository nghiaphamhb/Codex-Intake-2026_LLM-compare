# BE009 - Nghiệm thu toàn luồng backend và tích hợp giao diện

## Goal

Chứng minh luồng browser → Vite proxy → backend Fastify → client BTC hoạt động cùng nhau, thay vì suy ra từ các bộ test riêng lẻ. Bổ sung kiểm tra tích hợp lặp lại được bằng HTTP upstream giả lập, sau đó ghi bằng chứng nghiệm thu provider thật khi có quyền gọi. Giữ nguyên kiến trúc và contract BE007/BE008/FE008/FE009.

**Trạng thái:** soạn ngày 2026-11-17 theo [F000-pattern](F000-pattern.md), ban đầu dành cho Gemini; người dùng sau đó giao Codex triển khai. Đã triển khai và kiểm tra local ngày 2026-11-17; chưa chạy live BE009 vì chưa có model/budget được xác nhận. Kết quả thực tế và giới hạn xem nhật ký cuối file.

**Bằng chứng đầu vào:** người dùng đã xác nhận các kiểm tra BE008/FE008 đạt, ngoại trừ reasoning thật chưa kiểm tra được; nay xác nhận FE009 thử thủ công thành công, mọi thứ đạt. Giữ nguyên xác nhận đó. Không tự suy ra thiết bị, browser, model ID, số request, chi phí hoặc ngày chạy mà người dùng chưa cung cấp. Không yêu cầu người dùng nghiệm thu lại toàn bộ FE009 để bắt đầu BE009.

**Quyền thực thi:** người dùng đã giao Codex triển khai BE009 sau khi soạn spec, theo [AGENTS.md](../AGENTS.md). Quyền triển khai/test local không bao gồm gọi model trả phí. Live chỉ chạy sau khi người dùng xác nhận model ID và giới hạn lượt gọi theo mục D. Không stage/commit/push, deploy, đổi key hoặc sửa `.env`.

## User Story

Là người bàn giao ứng dụng, tôi muốn có kiểm tra tích hợp backend/giao diện và biên bản nghiệm thu thật có giới hạn, để biết luồng so sánh độc lập, streaming, lỗi và Stop hoạt động đúng và phân biệt phần đã chứng minh với phần chưa kiểm tra được.

## Scope

### In

- Một lệnh test riêng chạy browser thật qua Vite và backend thật, upstream HTTP loopback/key giả. Không yêu cầu dev server hoặc `.env` thật, không gọi Internet.
- Kiểm tra song song 2/3/4 model, text xuất hiện trước finish, reasoning giả lập đúng contract, lỗi/timeout độc lập, Retry, Stop ô/Stop all, New/remove và tab ẩn.
- Kiểm tra contract metadata và không lộ key/usage/pricing/raw upstream error qua API/browser.
- Checklist live chạy thủ công trên app hiện có; lưu kết quả đã làm/chưa làm/blocked đúng bằng chứng, không xây framework live mới.
- Cập nhật README, BE000 và nhật ký cuối spec khi triển khai, dựa trên kết quả thật. FE010 tiếp tục phụ trách rà soát/bàn giao frontend và việc xuất bản.

### Out

- Không thêm endpoint, SDK, dependency, database, persistence, Share, auth, multi-turn context, TTFT/token, bảng xếp hạng nhanh/rẻ, billing hoặc health check gọi generation.
- Không sửa parser/normalization/cost/timeout/prompt, thêm ép Markdown, giả thinking, tự retry hoặc fallback sang `/api/generate`.
- Không rewrite bộ test FE009, làm lại layout, bổ sung streaming animation, code splitting hay nâng version package.
- Không tự mở rộng BE006 smoke CLI: CLI đó vẫn kiểm tra `/api/generate`, không phải bằng chứng stream/browser. Không thêm CLI live cho BE009.
- Không gọi lỗi/rate-limit có chủ đích trên provider thật; các tình huống phá kết nối, malformed và timeout dùng stub.

### A. Đọc source và chốt file scope trước khi sửa

Đọc theo thứ tự: `AGENTS.md`, spec này, `BE000.md`, `BE006-proxy-acceptance.md`, contract và lịch sử review của `BE007-response-cost.md`, `BE008-streaming.md`, `FE008-streaming.md`, `FE009-mobile-tabs.md`; sau đó đọc các file dưới đây. Nếu tên/signature khác checkout, ghi rõ khác biệt; không tạo API theo trí nhớ.

| File                                                                                                                           | Cách sử dụng/phạm vi khi triển khai                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `backend/src/app.ts`                                                                                                           | Chỉ đọc: `buildApp({ logger?, models?, generate?, streamGenerate? })`                      |
| `backend/src/aiProxy.ts`                                                                                                       | Chỉ đọc: `createAiProxyClient(config)`, `listModels`, `generate`, `streamGenerate`         |
| `backend/src/server.ts`, `config.ts`, `routes/stream.ts`, `cost.ts`, `ndjson.ts`                                               | Chỉ đọc: wiring startup, cấu hình, API, công thức và parser thật                           |
| `backend/test/startup.test.ts`, `stream.test.ts`, `aiProxyStream.test.ts`, `helpers/upstream.ts`                               | Học pattern socket/barrier/cleanup; giữ regression hiện có                                 |
| `frontend/scripts/helpers.mjs`, `apiStub.mjs`, `mobile.mjs`, `interactions.mjs`, `layout.mjs`                                  | Chỉ đọc: pattern browser, selectors và phân biệt API stub với upstream stub                |
| `frontend/src/features/compare/ComparePage.tsx`, `components/AnswerCell.tsx`, `components/CompareGrid.tsx`, `comparisonApi.ts` | Đọc wiring/request, parser NDJSON phía frontend và DOM thực                                |
| `frontend/scripts/backend-integration.mjs` — mới                                                                               | Harness Vite/browser/backend thật; tổ chức các case nghiệm thu local                       |
| `frontend/scripts/backendUpstreamStub.mjs` — mới                                                                               | HTTP upstream BTC giả lập, gate và request/disconnect counters                             |
| `backend/package.json`                                                                                                         | Chỉ thêm script `test:integration` như mục B; giữ script khác, không đổi dependencies/lock |
| `README.md`, `specs/BE000.md`, spec này                                                                                        | Ghi lệnh mới, phân lớp bằng chứng, trạng thái và giới hạn thật                             |

Các file production và frontend package/config không nằm trong phạm vi sửa mặc định. Nếu test phát hiện bug: ghi expected/actual, tạo regression fail, chỉ ra file/hướng sửa và xin mở phạm vi nếu quyền triển khai người dùng chưa bao gồm sửa lỗi đó. Không làm test dễ hơn để qua. Không sửa lịch sử spec BE005–BE008 hoặc tick lại test cũ. Không ghi đè các thay đổi FE009 chưa commit trong checkout.

### B. Thiết kế harness local — quyết định đã chốt

**Đường dữ liệu:** browser → Vite `/api` → Fastify nghe socket thật → `createAiProxyClient` với URL loopback → upstream stub. Không dùng `page.route().fulfill`, không inject fake `streamGenerate` vào app, không dùng `apiStub.mjs` làm API cho harness này, không dùng `app.inject` thay socket trong case browser/abort.

Thêm vào `backend/package.json`:

```json
"test:integration": "node --import tsx ../frontend/scripts/backend-integration.mjs"
```

Chạy từ gốc: `npm run test:integration --prefix backend`. `tsx` đã có trong môi trường backend; Vite và playwright-core đã có trong frontend. `.mjs` mới nằm ở frontend/scripts để resolve các dependency browser hiện có. Import source backend bằng đường dẫn tương đối thật từ script (`../../backend/src/app.ts`, `../../backend/src/aiProxy.ts`), được loader tsx xử lý; import nội bộ backend `.js` giữ nguyên. Không cài package để giải quyết import. Thử lệnh trong TASK-001 trước khi xây matrix; nếu loader không resolve, báo lỗi chính xác và sửa đường dẫn, không thêm dependency hoặc copy production source.

Lifecycle mỗi phiên:

1. Tạo upstream bằng `node:http`, listen `127.0.0.1:0`.
2. Tạo client với object config truyền trực tiếp: `llmBaseUrl` = URL upstream, `llmApiKey` = `be009-fake-key`, `llmTimeoutMs` = 10000 ở case thường. Không gọi `readConfig(process.env)` hoặc `loadEnvFile`, không đọc key thật. Case timeout dùng client riêng 500ms, không đổi `.env`/production defaults.
3. `await client.listModels()` để nạp catalog qua HTTP thật; truyền snapshot và hai method thật vào `buildApp({ logger:false, models, generate:client.generate, streamGenerate:client.streamGenerate })`; `app.listen({ host:'127.0.0.1', port:0 })`.
4. `createServer` từ Vite với root frontend (resolve từ import.meta.url), `server.host='127.0.0.1'`, `port:0`, proxy `/api` target URL Fastify. Override proxy trong harness, không sửa `vite.config.ts` vốn trỏ3000.
5. Mở Chromium bằng playwright-core. Dùng executable theo `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, fallback Edge như helpers hiện có. Thiếu executable phải fail với hướng dẫn, không im lặng skip/pass. Khởi tạo viewport1440×900; có case390×844 cho background tab.
6. Browser chạy các case. Đợi theo điều kiện DOM/counter/gate hữu hạn, không `networkidle` khi stream đang giữ và không sleep đoán thời gian provider. Case thường có deadline tổng30s; timeout500ms có deadline assertion5s. Không tăng timeout vô hạn để che deadlock.
7. `finally` đóng browser/context, server Vite, Fastify và upstream; hủy các response stub còn giữ, dọn timers/gates/listeners. Cleanup vẫn chạy nếu launch/assert fail. Không giết dev server cổng3000/5173 của người dùng; tất cả server test dùng port0.

Harness dùng in-process `buildApp` và client thật để dễ kiểm soát lifecycle; **không tuyên bố nó tự kiểm chứng entrypoint `server.ts`, nạp `.env` hoặc deployment**. Wiring startup có regression `backend/test/startup.test.ts`; live app kiểm tra entrypoint ở mục D. Không sửa server production chỉ để test import thuận tiện.

Case timeout dùng app riêng với cùng client timeout500ms cho mọi model: upstream A phải trả partial + finish ngay khi nhận request, chỉ B giữ không finish. Chờ A success và B timeout; không giữ gate A đến sau timeout rồi kết luận B đã làm hỏng A. Các case thường phải release trong timeout10000ms; deadline assertion30s chỉ là trần của test, không kéo dài lifetime request.

Không tái sử dụng `withBrowser` hiện tại vì nó tự tạo API stub; không refactor helper đó cho mục đích này. Có thể đọc/reuse cách chụp ảnh, selector và browser executable. Hai file mới đủ cho phạm vi này; không tạo test framework, lớp client hoặc generic fixture engine.

### C. Upstream fixture và phép đo bắt buộc

Stub cung cấp `GET /models`, `POST /stream`; mọi path lạ trả404 và làm test fail nếu được gọi ngoài case dự kiến. Không có fallback `/generate` trong case streaming. Assert server-side header `x-api-key` đúng fake key, stream Accept theo client hiện có và body đúng `{ prompt, model }`, giữ nguyên Unicode/khoảng trắng. Browser chỉ gửi `{ prompt, modelId }` tới `/api/stream`.

Catalog tối thiểu4 model cố định `openai/be009-a`, `anthropic/be009-b`, `google/be009-c`, `deepseek/be009-d`, name `BE009 A`…`BE009 D`. Fixture JSON là `{ models:[{id,name,pricing?}, ...] }`; provider do client derive từ ID, không inject catalog đã chuẩn hóa để bỏ qua parser. Đọc logic chọn mặc định của ComparePage: thao tác Add/Remove để đạt tập2/3/4 bằng ID từ catalog, không dựa fixture FE009 hay tên model thật.

Stub gửi NDJSON **upstream** (khác wire public):

```jsonl
{"type":"text-delta","delta":"Xin chào — "}
{"type":"text-delta","delta":"BE009 A\n"}
{"type":"finish","usage":{"inputTokens":10,"outputTokens":20}}
```

`reasoning-delta` dùng cùng field `delta`. Không gửi upstream `done`, không đặt usage vào delta. Đọc `aiProxyStream.test.ts` làm chuẩn; không đoán SSE hay `[DONE]`. Tạo gate cho từng attempt; gửi partial trước, chỉ gửi finish khi test release. Lưu `received`, `active`, `completed`, `disconnectedBeforeFinish` theo prompt/model/attempt. Đánh dấu finish chủ đích trước `res.end`; callback `close` của response đã hoàn thành không được tính là Stop. Không dùng `req.close` sau khi đọc hết body làm bằng chứng upstream bị abort.

Fixture giá A `{input:1,output:2}` USD/triệu token, usage10/20 cho cost0.00005; B thiếu pricing cho null; C zero pricing cho0. So sánh wire số với tolerance1e-12; UI đối chiếu `formatCostUsd` hiện có, không ép locale/decimal mới. Assert API `/api/models` chỉ công khai id/name/provider; done chỉ durationMs/costUsd; không token/usage/pricing/key.

**Để chứng minh song song:** giữ tất cả request chưa finish; đợi upstream đã nhận đúngN request và `active===N` trước khi release bất kỳ response nào. Không đo bằng tổng thời gian hoặc thứ tự log. **Để chứng minh incremental:** partial của A visible trong đúng cell khi upstream A chưa finish và cell vẫn busy, sau đó release mới thấy success. Đừng chỉ kiểm tra delta trong response cuối.

Selectors ưu tiên accessible role/label và cell data-testid/section thật. Requery tab sau Send/New; không click locator DOM cũ đã detached. Dùng visible assertion ở active panel, hidden panel kiểm tra DOM/state có phạm vi; không dùng `toBeInTheDocument` để chứng minh người dùng đang nhìn thấy nội dung. Multi-turn luôn giới hạn theo section/prompt, không chọn tab hoặc Retry đầu tiên toàn trang.

### D. Nghiệm thu provider thật — thủ công, có giới hạn

Đây là checklist, không phải lệnh tự chạy trong test/CI. Test local không được đọc `.env` thật hay gọi domain BTC. Chỉ khi người dùng giao live rõ ràng mới thực hiện:

1. Xác nhận model ID có trong `GET /api/models` hiện tại, chọn2 model rẻ đã được người dùng cho phép, prompt và giới hạn. Đề xuất **tối đa4 generation attempts** cho cả phiên: một lượt Send2 model hoàn tất, một lượt Send2 model thử Stop. Retry cũng tính1; attempt lỗi/đã Stop vẫn tính. Không tự chọn GPT đắt, quét toàn catalog hay thử reasoning lặp lại. Giới hạn lượt không phải cam kết giới hạn USD.
2. Dùng app dev thật cổng5173 và backend3000 hiện có. Kiểm tra health và catalog qua frontend proxy, không kết luận từ trang HTML200. Nếu cổng bận, xác định server trước, không kill/restart app người dùng tùy tiện. Cấu hình startup đọc `.env` gốc theo source; không in file hoặc key ra terminal/chat.
3. Lượt1: Send2 model bằng prompt ngắn, ví dụ `Trả lời tiếng Việt: một tiêu đề, ba gạch đầu dòng và một bảng 2 cột về HTTP. Tối đa 150 từ.` Xác nhận hai POST bắt đầu trước khi lượt trả lời hoàn tất; từng ô nhận kết quả, Markdown render, thời gian hợp lệ, cost có số hoặc vắng nếu null. Nếu stream gộp quá nhanh, ghi chưa quan sát incremental live; không kéo dài prompt để đốt quota ngoài thỏa thuận.
4. Lượt2 nếu còn quyền/budget: Send2 model với prompt dài vừa đủ đã thống nhất; sau khi nhận partial, Stop một ô khi ô kia còn chạy. Ghi client abort và hành vi ô còn lại. Nếu cả hai đã xong trước thao tác, ghi không tái hiện kịp; không tự Send lại. Stop all/background đã có bằng chứng deterministic ở local, không bắt buộc tiêu thêm lượt live.
5. Không cần cố tạo lỗi/timeout ở provider. Một lỗi thật ghi mã sanitized và ảnh, không tự retry. AUTH/quota/rate limit: dừng các lượt tiếp theo, ghi blocked live; tiếp tục công việc local/tài liệu không phụ thuộc.
6. Reasoning live là quan sát tùy provider. Không có `reasoning-delta` không đồng nghĩa backend lỗi; chờ lâu không chứng minh thinking. Không yêu cầu chain-of-thought trong prompt, không tạo reasoning giả, không sửa request để ép provider bật khi chưa có contract xác thực. Ghi `chưa kiểm chứng live` nếu không có event; không chặn nghiệm thu tối thiểu chỉ vì mục mở rộng này.
7. Không xuất HAR thô, Authorization/x-api-key, toàn upstream response hoặc ảnh có key. Biên bản chỉ giữ model ID, thời điểm, số attempts, status/code, duration/cost nếu đã công khai và mô tả hành vi. Abort socket không chứng minh provider dừng tính toán/thu phí hoặc hoàn quota.

Không có quyền live hoặc không có model/budget: để các mục live chưa tick và báo chờ xác nhận, **không chặn hoàn tất harness local**, không tự tuyên bố BE009 nghiệm thu toàn bộ. Người dùng xác nhận test cũ vẫn có giá trị, nhưng không suy ra log/request chưa thu thập.

## Flow

1. Gemini đọc source và ghi baseline; nêu file sẽ thay đổi, phạm vi quyền và checklist đã có bằng chứng.
2. Triển khai harness local độc lập, thử catalog → một stream trước; sau đó hoàn thiện matrix dưới đây.
3. Chạy regression hiện có và harness mới; sửa lỗi trong test/harness, báo bug production cùng bằng chứng nếu vượt quyền.
4. Nếu được phép live, thực hiện mục D đúng budget; nếu không, ghi pending và tiếp tục bàn giao local.
5. Cập nhật nhật ký cuối spec/README/BE000: file thực đổi, kết quả lệnh, ảnh đã xem, giới hạn và phần chờ người dùng. Không triển khai FE010 hoặc publish trong BE009.

## Edge Cases

| Tình huống local                                    | Kết quả bắt buộc                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2/3/4 request đang giữ gate                         | Upstream nhận đủN và activeN trước finish đầu tiên; mỗi model đúng1 POST, không gửi `/generate`                                                                                                   |
| Reasoning rồi text ở A                              | Nội dung fixture hiển thị đúng, mở/đóng được; model không có reasoning không có thinking giả; không tick reasoning live                                                                           |
| HTTP429 trước stream B; A giữ rồi success           | B có lỗi và Retry, A vẫn hoàn tất; raw error chứa sentinel không rò ra UI/API; Retry B tạo thêm đúng1 request B, không gọi lại A                                                                  |
| B gửi partial rồi EOF không finish                  | B lỗi, giữ partial theo FE008, không success/cost giả; A vẫn hoạt động                                                                                                                            |
| B mở stream nhưng không finish; client timeout500ms | Lỗi `UPSTREAM_TIMEOUT` trong terminal/public mapping hiện có; upstream B đóng; không retry tự động. Dùng app timeout riêng, không ảnh hưởng fixture bình thường                                   |
| Stop ô A có partial, B đang chạy                    | Chỉ active A disconnect trước finish; A giữ partial/stopped và Retry; B tiếp tục rồi success. Retry A đúng1 request mới                                                                           |
| Mobile390: active tab A success, B/C/D đang giữ     | Switch/resize không tăng request hoặc abort; Stop all đóng đúng3 upstream pending; active0, không xóa kết quả A                                                                                   |
| New khi A/B đang giữ                                | Cả hai bị hủy, UI rỗng; release fixture cũ không đưa đáp án vào hội thoại mới. Ghi rõ callback cũ có thể không đến sau socket abort; regression late callbacks ở unit FE008 là bằng chứng bổ sung |
| Remove A đang chạy, còn >=2 model                   | Chỉ A bị hủy, model còn lại tiếp tục; re-add không tự generation. Không cho giảm xuống1                                                                                                           |
| Success với cost null/0/số                          | Wire và UI phân biệt thiếu với0, duration hữu hạn>=0; stopped/error không tạo cost hoặc duration success giả                                                                                      |
| Browser warning/error, tài nguyên lỗi               | Thu thập pageerror/console.error/requestfailed/HTTP>=400. Chỉ allow lỗi cố ý của đúng case/request/attempt hoặc abort terminal có chứng cứ. Không ignore toàn bộ `/api` hay `ERR_ABORTED`         |

Finish thành công cũng có thể khiến reader backend cancel upstream theo BE008: phân biệt terminal-complete với disconnect-before-finish, không assert mọi socket close đều là lỗi. Browser có StrictMode catalog abort ban đầu: nếu allow thì phải chứng minh có request thay thế thành công như helpers hiện có, không bỏ qua mọi catalog failure.

## Acceptance Criteria

- [x] Lệnh `npm run test:integration --prefix backend` chạy độc lập với `.env`, dev server và Internet; exit0 khi đạt, khác0 khi assert/startup/cleanup thất bại. Không có generation live.
- [x] Browser thật đi qua Vite/backend/client thật tới upstream socket stub; không mock API frontend hoặc inject fake generation. Startup production được kiểm tra riêng bằng regression hiện có, không gán nhầm coverage.
- [x] Song song2/3/4 và incremental được chứng minh bằng gate/counters/DOM trước finish, không dựa timing tổng.
- [x] Lỗi trước stream, EOF thiếu finish, timeout, Retry, Stop ô, Stop all tab ẩn, New và Remove đạt từng assertion trong Edge Cases.
- [x] Reasoning fixture, Unicode/Markdown, metadata null/0/số và secret sanitization đạt; không claim reasoning live.
- [x] Browser case1440 và390 đạt, switch/resize không tạo lại request. Screenshot local success/mobile-stop được xem trực tiếp và ghi nhận, không suy ra pixel-perfect toàn FE009.
- [x] Backend/frontend unit, typecheck, build, lint, browser regression cũ, harness mới, Prettier file sửa và diff check đều có kết quả/exit code thật; không hardcode số tests291/292 như số nghiệm thu mới.
- [x] README/BE000/nhật ký phân biệt local stub, người dùng xác nhận và live quan sát mới; không đánh dấu hoàn thành toàn bộ khi phần live còn chờ.
- [ ] Live khi đã được cho phép: model/prompt/budget xác định, thực hiện trong giới hạn và ghi kết quả/số attempts; không làm lại các kiểm tra phá lỗi bằng dịch vụ thật.
- [x] Bàn giao rõ phần live/reasoning chưa kiểm chứng hoặc bị chặn, bug production còn mở và việc còn lại cho FE010. Không có thay đổi ngoài phạm vi hoặc stage/commit/push.

## Tasks

### TASK-001 — Baseline và skeleton tích hợp thật

- [x] Đọc các nguồn mục A; chạy `git status --short` và `git diff --stat`, ghi nhận file người dùng/Gemini đã sửa, không reset/stash/format cả repo.
- [x] Chạy baseline `npm test --prefix backend`, `npm test --prefix frontend`; lưu số cases và exit code thật. Nếu fail có sẵn, ghi riêng trước khi sửa.
- [x] Tạo2 file `.mjs` và thêm đúng1 npm script trong bảng scope; không cài deps. Harness ban đầu chạy catalog, tạo Vite/Fastify/upstream/browser và teardown kể cả khi assertion fail.
- [x] Thêm case một stream với gate; verify harness bắt được fail nếu cố ý đảo expected text ngay trong assertion rồi hoàn tác thay đổi thử đó. Không sửa production để tạo lỗi giả. Chạy lệnh mới tới khi case đạt; ghi wiring và không tuyên bố startup/env đã được bao phủ.

### TASK-002 — Song song, text/reasoning và metadata

- [x] Hoàn thiện stub theo C:4 ID, pricing/usage, per-attempt gates/counters; timeout hữu hạn, không polling vô hạn hay nén toàn câu trả lời rồi phát delta giả.
- [x] Tạo case riêng N=2,3,4: chọn models qua UI; kiểm tra upstream body/header và activeN trước release; partial visible trước finish; release background model theo thứ tự khác thứ tự gửi và xác nhận kết quả đúng cell.
- [x] Case reasoningA + no-reasoningB; nội dung Vietnamese/emoji/newline/Markdown không mất hoặc lặp. Toggle reasoning giữ trạng thái khi chuyển tab390; không dùng fixture làm bằng chứng live.
- [x] Kiểm tra cost0.00005/null/0 qua public NDJSON và UI; duration>=0; catalog/public event không lộ fake-key hoặc usage/pricing. Có thể thu public stream bằng listener response browser, không gửi thêm generation chỉ để đọc metadata.

### TASK-003 — Failure, cancellation và isolation

- [x] Thêm từng case Edge Cases: HTTP429, partial EOF, timeout riêng; verify B fail không hủy A. Stub body lỗi chứa `BE009_RAW_SECRET_SENTINEL`; assert sentinel không xuất hiện public/UI.
- [x] Retry đúng1 attempt của ô lỗi/stopped; kiểm tra request counters theo model và prompt. Chờ request mới được ghi nhận trước khi release gate mới.
- [x] Stop ô, Stop all từ tab success, New/remove giữa stream; assert disconnect-before-finish đúng tập request, active0 khi thích hợp, giữ partial và chặn dữ liệu cũ.
- [x] Chuyển390→1440→390 giữa streams không tăng requests/disconnects; giữ tabs/hidden panel state. Chụp `be009-integration-success.png`, `be009-integration-mobile-stop.png` dưới `frontend/artifacts/verification/`, xem trực tiếp cả2; artifacts đã Git ignore.
- [x] Thu thập lỗi browser và xét expected errors từng case/attempt; mọi lỗi không được giải thích phải fail. Kiểm tra teardown khi case fail vẫn đóng hết server/socket của harness.

### TASK-004 — Regression và live có điều kiện

- [x] Từ root chạy lần lượt `npm test --prefix backend`, `npm run typecheck --prefix backend`, `npm run build --prefix backend`, `npm test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, `npm run lint`, `npm run test:browser --prefix frontend`, `npm run test:integration --prefix backend`.
- [x] Chạy Prettier **chỉ các file sửa/tạo** và `git diff --check`; ghi đúng command/exit code/cases, không đổi assertion/timeout cũ chỉ để pass. Cảnh báo bundle hiện có ghi riêng, không tự sửa bundling.
- [x] Đối chiếu quyền live. Nếu chưa có, ghi `chưa chạy — chờ quyền/model/budget`, giữ ô live chưa tick; vẫn bàn giao local. Nếu đã có, chạy checklist D, đếm mọi attempt, dừng khi hết budget hoặc auth/quota lỗi.

### TASK-005 — Biên bản và bàn giao

- [x] README thêm lệnh test:integration, mô tả rõ backend thật + upstream giả; không gọi nó là BTC live. BE000 link BE009 và trạng thái local/live thực tế. Không báo FE010 đã làm.
- [x] Cuối spec append nhật ký (không xóa nội dung yêu cầu): ngày, người thực thi, git revision nếu có + checkout dirty, file thực đổi, baseline/final test counts và exit codes, ảnh đã xem, bug/sai khác còn lại.
- [x] Mỗi case ghi nguồn `automated-local`, `user-confirmed` hoặc `observed-live`; expected/actual, pass/fail/not-run và lý do. User-confirmed FE009 không tự đổi thành automated/live quan sát bởi Gemini.
- [x] Live ghi2 model ID, prompt, budget đã cho phép, attempts thực dùng, kết quả từng attempt, status/error code sanitized, duration/cost công khai nếu có; reasoning live để chưa kiểm chứng nếu thiếu event. Không dán key, env hoặc HAR thô.
- [x] Trả báo cáo cuối ngắn: đã làm, lệnh đạt, phần bị chặn/chưa làm và bước FE010 tiếp theo. Chỉ tick checkbox đã đủ mọi yêu cầu con, không tick cả task vì build xanh. Không chạy implementation FE010, publish, commit hoặc push.

## Nhật ký triển khai và nghiệm thu

### 2026-11-17 — Codex triển khai local

- Quyền: người dùng giao thực hiện BE009. HEAD `cf3595b`, checkout dirty với thay đổi FE009 có sẵn; giữ nguyên các file đó. Chỉ tạo2 scripts, thêm script backend/package.json và cập nhật README/BE000/spec này. Không sửa production/dependency/lock/env, không commit/push.
- `user-confirmed`: người dùng xác nhận FE009 mọi thứ đạt trong chat trước khi yêu cầu BE009. Không có thông tin thiết bị/model/lượt gọi bổ sung; không chuyển xác nhận thành automated hoặc observed-live.
- `automated-local`: baseline backend250/250, frontend292/292 đạt exit0. Harness mới đạt 2 phiên: timeout10000ms có26 attempts loopback và18 public wires hoàn tất; timeout500ms có2 attempts và2 public wires. Attempts này không gọi provider thật, không tiêu quota. Các request bị Stop/New/remove không cần terminal; mọi upstream finish thành công phải có public done trước khi pass.
- Đã chứng minh song song2/3/4 bằng gate activeN; partial trước finish, reasoning fixture/toggle, Unicode/Markdown, cost0.00005/null/0, lỗi HTTP429/EOF/timeout độc lập, Retry riêng, Stop ô, Stop all3 model ẩn trong khi active model đã success, New/remove/re-add và resize. Ảnh desktop success/mobile stop đã xem trực tiếp; không coi đây là kiểm tra toàn bộ mobile hay reasoning live.
- Harness lần đầu fail vì dùng nhãn nút Remove để suy membership khi minimum2 đổi nhãn. Sửa selector sang desktop data-model-id và đợi layout thật. Sau đó chủ động đổi expected catalog count1→999: exit1 đúng assertion, tiến trình tự kết thúc; hoàn tác về1 rồi chạy lại đạt. Đây là kiểm tra đường fail/cleanup, không thay production để ép fail.
- Review độc lập phát hiện nguy cơ bỏ qua response.text bị hủy, đọc env gián tiếp và cleanup nối tiếp có thể bỏ sót server khi lỗi. Đã sửa: thu public wire thụ động tại Vite proxy với expected done count; bắt success/body từng model và UI cost; envDir:false; cleanup allSettled và AggregateError. Không suppress lỗi API/network toàn cục. Abort đối chiếu model/prompt/ordinal; terminal cancellation được phân biệt với disconnect-before-finish.
- Giới hạn: in-process buildApp không tự test server.ts/env startup; regression startup có sẵn kiểm tra riêng. Case timeout500ms cho A finish ngay, chỉ B giữ. Late callbacks sau socket đã đóng không phát được bằng HTTP; giữ bằng chứng unit FE008 hiện có. Browser có thể chỉ thấy một phần tab4 do thanh tabs có scroll riêng; không coi là document overflow.
- `observed-live`: chưa chạy,0 attempts BE009 tới provider. Chờ quyền/model ID/budget; không cần chặn bàn giao harness local. Reasoning live chưa kiểm chứng; Stop không chứng minh provider ngừng tính phí. FE010/deploy/Share chưa thực hiện.
- Verification cuối: `npm test --prefix backend`250/250; `npm test --prefix frontend`292/292 (27 files), cả baseline và lượt regression sau review đều exit0. `npm run typecheck --prefix backend`, `npm run build --prefix backend`, `npm run typecheck --prefix frontend`, `npm run build --prefix frontend` exit0. `npm run test:browser --prefix frontend` đạt layout/interactions/mobile exit0. `npm run lint` và `npm run test:integration --prefix backend` bản cuối exit0; Prettier đúng6 file BE009 và `git diff --check` exit0. Không đổi production sau các kiểm tra này. Build còn cảnh báo chunk>500kB (JS807.05kB/gzip246.15kB), không mở rộng sửa bundling.
- Ghi nhận điều chỉnh so với task: test đường fail dùng expected catalog count sai thay cho expected text sai; vẫn chứng minh assertion failure/exit1 và teardown. Public wire được thu tại proxy response thay vì browser response.text vì FE có quyền cancel reader sau terminal; không mock, sửa hoặc trì hoãn dữ liệu truyền. Cleanup thử mọi tài nguyên với allSettled, gom lỗi gốc và cleanup sau finally; PASS chỉ in sau cleanup thành công. Review nhỏ về partial EOF đã xử lý bằng assertion giữ text. Không còn finding quan trọng mở trong review local; live/reasoning vẫn chưa đủ bằng chứng.
