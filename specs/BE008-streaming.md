# BE008 - Streaming NDJSON, reasoning và hủy request

## Goal

Backend chuyển từng đoạn trả lời thật từ BTC tới FE008 ngay khi nhận được, hỗ trợ reasoning khi upstream cung cấp và ngừng đọc upstream khi người dùng Stop/đóng kết nối. Mỗi model là một request độc lập; giữ API generation hiện tại để FE006/FE007 tiếp tục hoạt động.

**Trạng thái:** ngày 2026-11-17, người dùng xác nhận đã hoàn tất các kiểm tra nghiệm thu BE008/FE008, ngoại trừ reasoning/thinking thật chưa kiểm tra được. Acceptance Criteria ghi nhận xác nhận này; lịch sử kiểm thử và các task kiểm chứng tự động chi tiết giữ nguyên bằng chứng đã ghi, không suy ra có thêm test script hoặc lệnh mới được chạy.

**Quyền thực thi:** yêu cầu soạn spec chỉ cho phép tạo tài liệu này. Trước khi sửa source/test/tài liệu khác phải có yêu cầu hoặc xác nhận triển khai rõ ràng theo [AGENTS.md](../AGENTS.md). Không tự stage/commit/push, không tạo plan/file kiến trúc khác. Khi được giao triển khai, đọc source thật trước khi sửa; nếu khác mô tả, nêu chỗ khác, không ghi đè thay đổi của người dùng.

## User Story

Là người so sánh nhiều model, tôi muốn đọc kết quả trong lúc model đang trả lời, xem reasoning nếu có và dừng một câu trả lời đang chạy mà các model khác vẫn tiếp tục.

## Scope

### In

- Thêm `POST /api/stream`, body `{ prompt, modelId }`, trả NDJSON đã chuẩn hóa; upstream là `POST /stream`.
- Native fetch, parser NDJSON tăng dần, UTF-8 đúng qua ranh giới chunk, deadline toàn request, backpressure và cleanup khi thành công/lỗi/hủy.
- Chuyển text/reasoning delta thật; chỉ trả duration/cost khi kết thúc thành công. Pricing snapshot và công thức BE007 dùng lại.
- Mỗi request có controller/timer/state riêng. Frontend Stop bằng abort fetch; backend quan sát kết nối response đóng sớm rồi abort upstream tương ứng.
- Test local bằng `node:test`, `node:assert/strict`, HTTP loopback/key giả; test streaming/hủy thực sự qua socket.

### Out

- Không sửa frontend: nút Stop, render từng đoạn, trạng thái partial/stopped, Retry/New/remove-model và chống response cũ thuộc FE008.
- Không đổi `POST /api/generate` hoặc `GET /api/models`, schema success/error cũ, công thức cost, startup snapshot và cách nạp `.env`.
- Không SSE/EventSource/WebSocket, SDK AI mới, database, request registry, endpoint `/stop`, session ID, reconnect/resume, tự retry/fallback sang `/generate`, typing/thought giả hoặc tách chuỗi trả lời hoàn chỉnh thành delta giả.
- Không sửa proxy BTC, gọi provider trực tiếp, thêm dependency/env/config, thay key, tự gọi BTC thật hay thay smoke CLI BE006 thành stream test.
- Không cam kết Stop dừng provider/tính phí, hoàn quota hoặc tính được chi phí phần câu trả lời bị hủy.

### Nguồn và mức độ xác minh

Đã đọc source BTC qua GitHub ngày 2026-11-16 tại revision **`6bfb63d3bbd03bc9477244ab2c2d372690e064df`** (revision đang tham chiếu trong BE007):

- [stream.js](https://github.com/codex-team/ai-proxy/blob/6bfb63d3bbd03bc9477244ab2c2d372690e064df/src/routes/stream.js): path `/stream`, header Accept bắt buộc, body `{ prompt, model }`, event `delta`, finish dùng `part.totalUsage`.
- [generate.js](https://github.com/codex-team/ai-proxy/blob/6bfb63d3bbd03bc9477244ab2c2d372690e064df/src/routes/generate.js): endpoint JSON cũ khác với stream.
- [OpenAPI live](https://llm.codex.so/docs/json): công cụ web không truy cập được trong turn soạn spec. Không khẳng định deployment hiện tại trùng revision này; chưa có live request.

Source tham chiếu **không truyền abortSignal vào `streamText` và không gắn disconnect với hủy provider**. BE008 chỉ chủ động đóng fetch/reader của backend. Không suy ra upstream hỗ trợ hủy tính toán chỉ vì frontend đã abort. Trước triển khai, đọc lại đúng revision; nếu deployment/contract được cung cấp khác, báo khác biệt và cập nhật spec khi được phép, không đoán schema theo AI SDK phiên bản mới nhất.

### A. Điểm tích hợp và file scope

Hiện `aiProxy.ts` có `GenerateInput`, `GenerateUsage`, `GenerateResult`, `Generate`, `AiProxyError`, client `listModels/generate`; `app.ts` inject dependency đồng bộ; `server.ts` tạo client rồi nạp catalog trước listen. `routes/generate.ts` đang giữ body schema private và success JSON bốn field. BE008 bổ sung cạnh các phần này, không thay đường gọi JSON hiện tại.

| File được dự kiến khi có quyền triển khai  | Trách nhiệm                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `backend/src/ndjson.ts` — mới              | Parser NDJSON độc lập HTTP, giới hạn mỗi dòng                                        |
| `backend/test/ndjson.test.ts` — mới        | Byte/chunk/UTF-8/framing/giới hạn/parser errors                                      |
| `backend/src/aiProxy.ts`                   | Types stream, method `streamGenerate`, fetch `/stream`, deadline/cancel/normalize    |
| `backend/test/aiProxyStream.test.ts` — mới | Client thật qua upstream HTTP stub                                                   |
| `backend/src/routes/stream.ts` — mới       | Validation, lifecycle response, NDJSON writer, disconnect/backpressure               |
| `backend/src/app.ts`                       | Option `streamGenerate?`, đăng ký route mới trên cùng snapshot                       |
| `backend/src/server.ts`                    | Truyền `streamGenerate: proxyClient.streamGenerate` vào buildApp                     |
| `backend/test/stream.test.ts` — mới        | Validation và HTTP stream thực, hủy, deadline, request độc lập                       |
| `backend/test/helpers/upstream.ts`         | Chỉ mở rộng helper nếu cần teardown/barrier cho streaming; giữ helper cũ tương thích |
| `backend/test/startup.test.ts`             | Regression startup có nối stream dependency thật qua stub                            |
| `README.md`, `specs/BE000.md`, spec này    | Khi được phép: contract mới, kết quả/giới hạn thực tế, trạng thái bàn giao           |

Không sửa frontend, config/env/package/lockfile, cost/models hoặc lịch sử BE005–BE007. Có thể đọc test cũ để học pattern; không nới assertion cũ chỉ để test pass. Import nội bộ đuôi `.js` theo NodeNext. Test top-level nằm `backend/test/*.test.ts`; `dist` chỉ chứa production src.

### B. API công khai cho FE008

**Request:** `POST /api/stream`, `Content-Type: application/json`, body đúng hai field `{ prompt: string, modelId: string }`. FE nên gửi `Accept: application/x-ndjson`; backend local không bắt buộc Accept và không dùng Accept của FE để chuyển tiếp tùy ý. Upstream luôn nhận header Accept cố định.

Validation phải giống `/api/generate`: object khác null/array, required đúng hai field, additionalProperties false, không coerce/default/remove field; prompt length 1–10000 theo AJV hiện tại, prompt toàn whitespace bị reject riêng; modelId nonempty và thuộc snapshot theo ID chính xác. `.trim()` chỉ kiểm tra blank, **không sửa prompt gửi đi**. Giữ thứ tự schema → blank prompt → unknown model → dependency → upstream. Empty catalog trả unknown model 400, không 503.

- Body/parser errors: dùng handler hiện tại trong `app.ts` với 400/413/415 và envelope cũ.
- Blank: 400 `INVALID_REQUEST` / `Prompt must not be blank`.
- Model lạ: 400 `INVALID_REQUEST` / `Unknown modelId`.
- Thiếu `streamGenerate`: 503 `GENERATION_UNAVAILABLE` / `Text generation is not configured`; không lấy `generate` làm fallback.
- Chưa mở stream: lỗi upstream trả HTTP/error JSON như bảng D. Không trả JSON error với HTTP200.

**Response thành công khi mở stream:** HTTP200, `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. Không Content-Length; không tự set Transfer-Encoding/Connection. Mỗi event là `JSON.stringify(event) + '\n'`, UTF-8. Không pretty-print, không prefix `data:`, không `[DONE]`, không raw upstream passthrough.

Public event union (đúng field đã liệt kê; mọi field đều bắt buộc trong variant đó):

```ts
type PublicStreamEvent =
  | { type: 'start'; modelId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'done'; durationMs: number; costUsd: number | null }
  | { type: 'error'; error: { code: AiProxyErrorCode | 'INTERNAL_ERROR'; message: string } };
```

- `start` đúng một lần, đầu tiên; do backend tạo sau khi upstream HTTP200/Content-Type/body hợp lệ. Không chờ nhận toàn bộ câu trả lời hoặc delta đầu tiên để flush headers/start.
- Delta là phần nối thêm, không phải toàn bộ text mới nhất; giữ nguyên Unicode/whitespace/Markdown/newline và thứ tự đến. Chỉ bỏ delta `''`. Backend không tích lũy toàn bộ text/reasoning và không gửi lại text ở done.
- `done` hoặc `error` là terminal, tối đa một terminal rồi end response. Nếu downstream đã đóng thì không cố gửi terminal. EOF mà FE chưa nhận terminal không được coi thành công.
- Duration hữu hạn >=0, đo từ ngay trước fetch upstream đến finish hợp lệ được parse, gồm thời gian đọc/đợi backpressure trước đó; không làm tròn. Chỉ `done` có duration/cost. Không phát usage/token/pricing/raw error ra API.
- `costUsd` dùng `estimateCostUsd(selectedModel.pricing, usage)` đúng BE007; thiếu/sai usage → null, zero giữ 0. Không tính từ độ dài text hoặc cộng lại reasoning/cache/total. Hủy/lỗi không có cost 0 hoặc cost suy đoán.
- Không phát reasoning nếu upstream không có. Không tạo status “đang suy nghĩ” từ timer hoặc text thông thường; không tìm `<think>` trong text để suy reasoning.

Ví dụ wire (mỗi JSON một dòng; newline trong delta được escape bởi JSON.stringify):

```jsonl
{"type":"start","modelId":"test/model-a"}
{"type":"reasoning-delta","delta":"Phần reasoning do dịch vụ cung cấp"}
{"type":"text-delta","delta":"Xin "}
{"type":"text-delta","delta":"chào\n"}
{"type":"done","durationMs":1234.5,"costUsd":null}
```

### C. Contract client và upstream normalization

Thêm types trong `aiProxy.ts`, giữ types/API generate cũ nguyên trạng:

```ts
export type StreamDelta =
  { type: 'text-delta'; delta: string } | { type: 'reasoning-delta'; delta: string };
export interface StreamResult {
  durationMs: number;
  usage?: GenerateUsage;
}
export interface StreamOptions {
  signal: AbortSignal;
  onReady: (signal: AbortSignal) => Promise<void>;
  onDelta: (event: StreamDelta, signal: AbortSignal) => Promise<void>;
}
export type StreamGenerate = (
  input: GenerateInput,
  options: StreamOptions,
) => Promise<StreamResult>;
```

`createAiProxyClient` thêm `streamGenerate: StreamGenerate`. `BuildAppOptions` thêm `streamGenerate?: StreamGenerate`. `registerStreamRoutes(app, modelsSnapshot, options.streamGenerate)` dùng cùng snapshot đã clone; buildApp vẫn sync/không fetch/đọc env. Methods client vẫn closure không dựa `this`. `StreamGenerate` resolve chỉ sau upstream finish hợp lệ, không trả thành công khi đơn thuần EOF.

1. Fetch đúng `${baseUrl}/stream` (giữ path prefix), method POST, `redirect: 'error'`, header `x-api-key` từ config, `content-type: application/json`, `accept: application/x-ndjson`. Body stringify đúng `{ prompt: input.prompt, model: input.modelId }`; không thêm stream:true/modelId/key/options/signal vào body.
2. HTTP khác 200 phân loại ngay theo D; best-effort cancel body, không đợi body lỗi vô hạn. Redirect bị từ chối, không gửi key sang đích redirect. Không retry, không gọi `/generate`.
3. Với HTTP200: body phải tồn tại; media type trước dấu `;`, trim/case-insensitive phải là `application/x-ndjson` (cho phép charset). Thiếu/sai → invalid response. Đây là quy tắc mới **chỉ cho stream**, không áp ngược lên endpoint JSON cũ.
4. Gọi và await `onReady(effectiveSignal)` đúng một lần, rồi đọc tăng dần và await `onDelta(event, effectiveSignal)` lần lượt. `effectiveSignal` do client tạo, kết hợp deadline nội bộ và external signal của route; callback writer phải dùng signal được truyền vào này để đánh thức chờ drain. Không dùng riêng signal route vì nó không biết deadline client. Không `void callback`, không Promise.all các delta; downstream chậm phải làm client ngừng lấy dữ liệu tiếp.
5. Parser trả từng JSON value kiểu unknown; chỉ nhận own fields của object khác null/array. `type` phải string. Các event BTC dưới đây normalize theo bảng; field dư bỏ qua, không spread ra public event.

| Event BTC                                                             | Xử lý                                                                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`, `text-start`, `text-end`, `reasoning-start`, `reasoning-end` | Nhận nhưng không gửi lại; không yêu cầu lifecycle marker đầy đủ để chấp nhận delta                                                                  |
| `text-delta`, `reasoning-delta`                                       | `delta` bắt buộc string; thiếu/null/số → invalid response. Empty string bỏ qua; còn lại emit đúng variant/hai field                                 |
| `finish`                                                              | Parse `usage` như BE007: inputTokens/outputTokens đều safe integer >=0 mới giữ; sai/thiếu thì usage undefined, vẫn success. Ghi duration và resolve |
| `error`                                                               | Throw `AiProxyError('UPSTREAM_ERROR')`; bỏ toàn bộ message/raw fields BTC, kể cả có secret                                                          |
| `type` string chưa biết                                               | Bỏ qua để tương thích bổ sung event; không coi là finish/delta và không reset deadline                                                              |
| JSON/object/type không hợp lệ                                         | Throw `AiProxyError('UPSTREAM_INVALID_RESPONSE')`                                                                                                   |

**Finish là điểm kết thúc:** khi thấy finish hợp lệ, ngừng parser tại event đó, cancel reader best effort và không đọc/validate dữ liệu sau finish (kể cả đã nằm cùng chunk). Không đợi upstream đóng socket mới resolve. Vì thế finish lặp hoặc garbage phía sau bị bỏ qua, không phát terminal lần hai. Empty text, chỉ reasoning, hoặc không có delta trước finish đều success. Chỉ EOF/unknown events không có finish luôn là invalid response, không tạo done giả. Event error đầu tiên cũng terminal và bỏ dữ liệu phía sau.

**Parser `ndjson.ts`:** export `parseNdjson(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<unknown>` và `class NdjsonParseError extends Error` (constructor không tham số, message cố định `Invalid NDJSON stream`). Parser chỉ framing/UTF-8/JSON, không biết BTC/HTTP hoặc cost. Chỉ lỗi decode/JSON/line limit mới wrap bằng NdjsonParseError; lỗi từ input iterator phải giữ nguyên. Client dùng instanceof để chuyển lỗi parser thành invalid response, không bắt mọi Error hoặc so chuỗi message rồi chuyển lỗi socket thành invalid response. Không kèm nội dung dòng vào lỗi/cause.

- Network chunk không bằng JSON line. Hỗ trợ một dòng chia nhiều chunk, nhiều dòng trong một chunk, LF/CRLF, empty/whitespace-only lines (bỏ qua). Dòng cuối có JSON đầy đủ không có LF vẫn parse khi EOF; JSON cụt thì lỗi.
- Dùng giải mã UTF-8 tăng dần, strict/fatal; byte tiếng Việt/Nga/emoji bị chia vẫn nguyên vẹn. Invalid UTF-8 phải lỗi, không silently chèn ký tự thay thế. Hỗ trợ BOM UTF-8 duy nhất ở đầu stream; BOM giữa stream không tự xóa.
- Giới hạn mỗi dòng **1,048,576 byte trước LF**, tính cả CR của CRLF/BOM nếu có. Bằng giới hạn hợp lệ, vượt một byte → invalid response và abort đọc. Kiểm tra trước khi tích lũy quá giới hạn; không chỉ đếm JS string length hoặc chờ newline mới kiểm tra. Quét theo dòng, không reject cả chunk lớn nếu chunk chứa nhiều dòng nhỏ hợp lệ.
- Không `response.text()/json()`, không buffer toàn response, không split từng chunk rồi JSON.parse độc lập. Parser có thể được đóng sớm bằng return khi client nhận terminal; phải giải phóng iterator trong finally.

### D. Lỗi, deadline và hủy

Giữ `AiProxyError` và năm code/message hiện có, không thêm raw cause vào response/log. Trước `onReady`, trả HTTP JSON `{ error: { code, message } }`; sau start, giữ HTTP200 và gửi `{ type: 'error', error: { code, message } }` rồi end:

| Nguyên nhân                                                          | HTTP trước start | Code / message cố định                                                     |
| -------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| BTC 401/403                                                          | 502              | `UPSTREAM_AUTH_ERROR` / `Model service authentication failed`              |
| BTC 429                                                              | 429              | `UPSTREAM_LIMIT_EXCEEDED` / `Model service limit exceeded`                 |
| Deadline tổng                                                        | 504              | `UPSTREAM_TIMEOUT` / `Model service timed out`                             |
| BTC status khác 200, redirect, network/read socket fail, event error | 502              | `UPSTREAM_ERROR` / `Model service request failed`                          |
| Header/body/NDJSON/event sai, vượt line limit, EOF thiếu finish      | 502              | `UPSTREAM_INVALID_RESPONSE` / `Model service returned an invalid response` |
| Lỗi code nội bộ bất ngờ                                              | 500              | `INTERNAL_ERROR` / `Internal server error`                                 |

- Deadline là `LLM_TIMEOUT_MS` hiện có, **tổng thời gian**, không phải idle timeout; delta/unknown event không reset timer. Bắt đầu trước fetch; bao headers/body/parse/callback backpressure. Check elapsed/signal trước onReady, mỗi lần emit và trước resolve; parse đồng bộ không được bỏ qua deadline. Timer riêng không unref, clear trong finally.
- Kết hợp external signal và controller deadline bằng listener/controller riêng; nếu signal đã aborted thì không fetch. Deadline phải abort cả fetch/reader và đánh thức thao tác đang đợi drain. Không chỉ Promise.race rồi để I/O chạy nền.
- External abort là hủy chủ động, **không phải UPSTREAM_TIMEOUT**: client reject `DOMException` tên `AbortError`, route bỏ qua khi chính signal route đã aborted/downstream đóng. Không trả HTTP499 hay phát event stopped. FE tự giữ partial/stopped; không thể gửi ack lên kết nối đã đóng.
- Nguyên nhân terminal được ghi một lần, không bị cleanup hoặc timer tới muộn đổi thành lỗi khác. Nếu disconnect và timeout tranh nhau, downstream đóng thì ngừng mọi write; tests không đòi đoán bên thắng trong cùng tick.
- Không gom tất cả lỗi theo tên AbortError/TypeError. Lỗi fetch/read do deadline → timeout; do external abort → cancel; lỗi transport khác → upstream error; JSON/validation → invalid response. Lỗi callback writer không được đổi nhầm thành upstream-invalid-response. Callback lỗi nội bộ phải đi đường INTERNAL_ERROR nếu còn gửi được.
- finally luôn clear timer, remove listener external abort, cancel reader khi chưa hoàn tất và release lock nếu đã lấy reader; cleanup best effort không che lỗi gốc. Không await body/socket vô hạn trong cleanup.

### E. Lifecycle Fastify và backpressure

Chốt dùng `reply.hijack()` và `reply.raw` cho **route mới**, không đổi global error handler hoặc route JSON. Đến `onReady` mới hijack/set status/header/flush/write start; trước đó Fastify vẫn có thể trả JSON lỗi. Kiểm tra kết nối còn sống trước hijack. Không gọi `reply.send()` sau hijack và không gắn schema200 kiểu object vào NDJSON.

- Gắn listener response `close` **trước khi gọi dependency**, không đợi đến onReady; nếu `!reply.raw.writableFinished`, abort controller request này. Không dùng `request.raw.on('close')` làm tín hiệu duy nhất: request body POST đọc xong không có nghĩa người dùng Stop. Có thể theo dõi request aborted bổ sung, không coi normal body end là hủy.
- Writer serialize object explicit, kiểm tra writableEnded/destroyed/signal trước write. Với start/delta, nếu write trả false, await drain **hoặc** close/error/abort của effectiveSignal nhận từ callback; dọn mọi listener khi settle, kể cả signal đã aborted ngay trước đăng ký listener. Không tiếp tục đọc upstream hoặc xếp thêm event vào queue vô hạn trong lúc downstream nghẽn.
- Writer xử lý tuần tự và có guard `terminalSent`/trạng thái tương đương. **Riêng done/error:** ghi tối đa một dòng rồi gọi end theo best effort, không đợi drain thêm (deadline client đã dọn sau finish). Với error do timeout, signal deadline đã aborted không được tự ngăn gửi dòng lỗi cuối nếu downstream vẫn writable; chỉ signal disconnect/transport đóng mới ngăn terminal. Không tạo timer route/deadline thứ hai. Nếu không còn ghi được thì destroy/end an toàn; không promise client luôn nhận được terminal khi transport đã lỗi.
- Success: await dependency resolve, tính cost từ model snapshot, gửi done, end; không abort một request khác hoặc phát error từ close bình thường. Thất bại sau start: sanitize error, gửi error/end nếu còn writable; không throw ra Fastify JSON error handler sau hijack.
- Client disconnect/lỗi response: abort dependency, không write tiếp, không done/cost. finally dọn listener route. Mọi promise/event error phải được xử lý để không có unhandled rejection/write-after-end. Không dùng shared controller/global state.
- Khi server shutdown có request đang chạy: teardown không được treo vì stream giữ socket. Test chủ động abort các kết nối trước app.close; không tuyên bố đã có graceful shutdown production mới trong BE008.

## Flow

1. Startup giữ BE005/BE007: load config/catalog snapshot; truyền thêm method stream vào buildApp rồi listen.
2. FE008 gửi một POST `/api/stream` cho mỗi model (2–4 request độc lập). Route validate trước mọi upstream call.
3. Route tạo controller/listener disconnect; client gửi một POST BTC `/stream` với header/body cố định và deadline riêng.
4. Upstream lỗi trước mở stream → HTTP JSON an toàn; HTTP200 hợp lệ → onReady, flush headers và start ngay.
5. Client parse từng dòng, normalize delta, await writer. FE nối delta vào đúng câu trả lời; backend không dựng lại full text.
6. Finish → client trả duration/usage, route tính cost BE007, phát done rồi end. Error/timeout → sanitize và kết thúc theo phase.
7. Stop/đóng trang → FE abort fetch, route thấy response đóng sớm và abort upstream. Các model khác chạy tiếp. Retry sau này là request mới; không resume stream cũ.

## Edge Cases

- Prompt có leading/trailing spaces, Unicode/IME/newline; đúng 10000 và quá giới hạn; model cùng name khác ID; catalog rỗng/lỗi thời; body thừa `stream`, `model`, key hoặc URL bị reject trước upstream.
- Headers upstream tới nhưng chưa có delta: start được flush; sau đó timeout/error. HTTP200 HTML/JSON/SSE không được đọc như NDJSON.
- Chunk cắt giữa byte emoji, giữa escape `\\n`, giữa hai ký tự của JSON; CRLF, BOM đầu, dòng trắng, dòng cuối không LF. NDJSON delta có newline thực phải nằm trong JSON escape, không được sửa framing để “cứu” JSON lỗi.
- Delta rỗng không tạo event; delta whitespace giữ nguyên. Text/reasoning xen kẽ hoặc nhiều block không cần marker; upstream không có reasoning thì không fake.
- Finish không usage/usage sai/usage0; input/output hợp lệ nhưng total/reasoning/cache dư → dùng BE007 đúng một lần. Pricing thiếu không làm stream lỗi.
- EOF trước finish sau partial text; raw error có key/prompt/sentinel; socket reset khác EOF sạch; lỗi sau start không đổi HTTP status hoặc trộn JSON envelope thường vào stream.
- Finish rồi upstream không close hoặc gửi garbage; dừng ở finish. Timeout/Stop khi chờ headers, body, drain; disconnect trước headers; callback ném lỗi; normal response close sau done.
- 2–4 request overlap: một lỗi/hủy/timeout không làm mất request tốt; Retry chỉ gọi model được chọn đúng một lần và không dùng usage/cost lần trước.

## Acceptance Criteria

- [x] `/api/generate`, `/api/models`, startup/env và smoke CLI hiện tại giữ nguyên contract; FE006/FE007 vẫn dùng được.
- [x] `/api/stream` validation tương đương generate; input sai không gọi dependency; thiếu stream dependency không fallback.
- [x] Upstream đúng path prefix/header/body/redirect policy, đúng một request, không lộ key qua redirect/API/log.
- [x] Start được nhận trước finish; delta tới tăng dần qua socket, không buffer full response hoặc typing giả.
- [x] Parser đúng UTF-8/NDJSON/boundary/BOM/CRLF/line limit; phân biệt framing errors với transport errors.
- [x] Event/public fields đúng B; reasoning chỉ từ dữ liệu thật; finish bắt buộc để success; terminal một lần.
- [x] Cost/duration chỉ ở done; metadata thiếu trả null, zero hợp lệ, không lộ token/usage/pricing/raw upstream.
- [x] Lỗi trước/sau mở stream đúng HTTP/envelope/event; message cố định, unknown internal error được sanitize.
- [x] Deadline bao toàn request, không reset vì delta; timeout/disconnect kết thúc fetch và chờ drain, cleanup đầy đủ.
- [x] Abort một request thật qua socket không tạo timeout/done/ghi sau đóng và không ảnh hưởng request khác. Không claim provider hủy hoặc hoàn phí.
- [x] Có test socket incremental/backpressure/cancel/overlap và startup wiring; không chỉ test Fastify inject hoặc mock callback.
- [x] Backend test/typecheck/build, root lint, targeted format/diff đạt bằng kết quả mới; không tick nghiệm thu live/frontend khi chỉ pass local.

- [ ] Nghiệm thu reasoning/thinking thật từ provider qua BTC: người dùng chưa kiểm tra được. Phần đã test bằng stub không thay thế xác minh này.

## Tasks

Thực hiện TASK-001 → TASK-006 **sau khi được giao triển khai**. Mỗi task: viết test có assertion hành vi → chạy thấy fail đúng lý do → code tối thiểu → chạy lại. Không dùng skip/todo, nới timeout, đổi fixture thành contract sai hoặc xóa assertion để che lỗi. Task đang dở giữ checkbox trống và ghi blocker cụ thể.

### TASK-001 — Parser tăng dần

- [ ] Tạo `ndjson.ts` và `ndjson.test.ts` theo signature C. Test từng byte và nhiều dòng/chunk; reconstruct chuỗi Nga/Việt/emoji chính xác, không có replacement character.
- [ ] Bảng test: LF/CRLF/BOM đầu/blank lines/final no-LF; object/array/null JSON vẫn được parser trả unknown để client validate; malformed JSON, UTF-8 lỗi và dangling multibyte ở EOF phải fail.
- [ ] Test đúng 1,048,576 byte và vượt một byte (cả chưa có newline), nhiều dòng nhỏ trong chunk tổng > giới hạn không fail nhầm. Không dùng fixture toàn bộ stream khổng lồ không cần thiết.
- [ ] Test consumer return sớm giải phóng input iterator và không parse garbage sau terminal do consumer dừng. Chạy `node --import tsx --test test/ndjson.test.ts` từ backend rồi typecheck.

### TASK-002 — Client stream thật qua HTTP stub

- [ ] Thêm types/method trong `aiProxy.ts`, test `aiProxyStream.test.ts`; giữ methods JSON cũ. Stub assert một POST `/prefix/stream`, exact body/header, prompt không trim, key giả. Target redirect thứ hai có counter0.
- [ ] Gated stub flush headers trước và giữ body mở; onReady phải tới trước khi cho phép delta/finish. Gửi từng event có barrier acknowledgement để chứng minh callbacks đến trước finish; không dựa sleep ngắn để đo scheduler.
- [ ] Test tất cả event normalization C, unknown type, missing/wrong delta/type, empty text, only reasoning, usage valid/missing/invalid/0, own fields và field dư không bị passthrough.
- [ ] Test finish rồi upstream treo/garbage/finish thứ hai: client resolve và cancel body ngay; EOF không finish fail. Không biến không có text thành lỗi nếu có finish.
- [ ] Test status 401/403/429/400/406/500 kể cả body HTML không end; sai/missing Content-Type/body, JSON lỗi → đúng D; socket reset → upstream error; raw event error không lọt ra message.
- [ ] Test timeout trước headers, sau headers/trong body, liên tục delta nhưng quá deadline; external abort trước fetch (counter0), trong headers/body/onDelta chờ signal. Assert cleanup/upstream disconnect, không chỉ assert promise reject.
- [ ] Callback onReady/onDelta throw sentinel không bị gắn nhầm invalid response; callback await tuần tự, max in-flight1. Callback chờ effectiveSignal được giải phóng do deadline dù external signal chưa abort; assert kết quả UPSTREAM_TIMEOUT. Chạy parser/client tests rồi typecheck.

### TASK-003 — Route và dependency wiring

- [ ] Tạo `routes/stream.ts`, option app và server wiring theo A/E. Không đổi body schema route JSON cũ; route mới dùng schema tương đương, tránh refactor ngoài scope.
- [ ] `stream.test.ts`: inject validation cases của generate cho path mới (JSON/parser/media/size, blank/unknown/extra/wrong types, Unicode boundaries), spy stream call count0 khi input sai. Dependency thiếu với model hợp lệ →503; model sai vẫn400.
- [ ] Test fake StreamGenerate gọi onReady/delta rồi resolve để assert exact fields/headers/start/done/cost; AiProxyError trước ready đúng HTTP JSON, sau ready đúng NDJSON error. Error thường chứa sentinel chỉ ra INTERNAL_ERROR cố định; không stack/sentinel/raw fields.
- [ ] Cost cases: pricing input0.25/output2, usage input1000/output675 → xấp xỉ0.0016; missing usage/pricing →null; tokens0 →0. Dùng tolerance cho float, không hiển thị/round giá ở backend.
- [ ] Startup test process qua upstream stub kiểm tra `/api/stream` không503, nhận start/delta/done thật; catalog vẫn chỉ nạp một lần. Không coi chỉ buildApp injection là đủ chứng minh server.ts đã nối dependency.

### TASK-004 — Socket, cancellation và backpressure

- [ ] Trong `stream.test.ts`, start app listen `127.0.0.1`, port0; upstream dùng helper hiện có. Đăng ký teardown ngay khi tạo, đóng client sockets/controllers trước app.close/upstream.close. Mọi barrier có deadline và release trong finally để fail không treo suite.
- [ ] Test consumer đọc start và delta trong khi stub vẫn chưa gửi finish (barrier chưa mở); assert incremental delivery qua HTTP thật. Inject chỉ dùng cho validation/completed output, không làm bằng chứng flush/cancel.
- [ ] Abort fetch downstream trước upstream headers và sau delta; stub quan sát upstream response/socket close, active request count về0. Giữ request B đang chạy để chứng minh B vẫn nhận done sau khi A bị hủy. Body POST đọc xong bình thường không được tự abort stream.
- [ ] Test socket EOF sạch thiếu finish và reset giữa stream khác nhau theo D; không thêm done, terminal tối đa một, không unhandled rejection/write-after-end. Test done normal close không phát error muộn.
- [ ] Test backpressure buộc writer.write trả false bằng writer seam nhỏ/module-private helper hoặc HTTP consumer pause có kiểm soát; không dựa một response nhỏ với OS buffer lớn. Assert upstream/onDelta không tiến tiếp cho đến drain; abort/close/error/timeout đều đánh thức waiter và dọn listener.
- [ ] Không cần export framework writer mới chỉ để test. Nếu dùng fake writable cho branch drain, bổ sung socket smoke chứng minh wiring close đúng; fake không thay thế test hủy HTTP thật.
- [ ] Test riêng done/error với write trả false: vẫn end/settle không đợi drain sau terminal; timeout không ngăn gửi best-effort error, disconnect thì không write. Dọn timer/listener không làm terminal lần hai.
- [ ] Dùng barrier/counter chứng minh 2/3/4 POST chồng lấn; một timeout/429/abort không chặn các model còn lại. Retry thủ công model lỗi tạo đúng một POST mới, không refresh catalog/chạy lại model tốt.

### TASK-005 — Regression và kiểm tra an toàn

- [ ] Chạy toàn backend suite; giữ các test BE004–BE007, smoke exact keys bốn field JSON, snapshot/pricing mutation và error mappings cũ.
- [ ] Logger enabled trong ít nhất một integration case; capture log để assert không có key giả/prompt sentinel/raw upstream error/usage/pricing. Không chỉ dùng logger:false rồi kết luận log an toàn. Text/reasoning cố ý trong delta được phép tới đúng response, không được log tự động.
- [ ] Typecheck/build kiểm tra `dist` chỉ production src; không đưa scripts/test/stub vào build. Không đổi glob/dependency/config để né compile failure.

### TASK-006 — Verification và bàn giao FE008

- [ ] Chạy từ root: `npm test --prefix backend`, `npm run typecheck --prefix backend`, `npm run build --prefix backend`, `npm run lint`. Chạy Prettier chỉ các file đã sửa và `git diff --check`; không format toàn repo.
- [ ] Ghi lệnh/exit code/số test thực tế và giới hạn trong spec khi được phép cập nhật; failed check phải nêu rõ, không copy kết quả cũ hoặc tick task chưa thực thi. Không bắt buộc chạy frontend tests cho thay đổi backend-only, không gọi live để đổi checklist thành xanh.
- [ ] Nếu được phép sửa tài liệu, cập nhật README/BE000 trạng thái hiện hành và contract stream; không đánh dấu FE008 đã triển khai. Quyền sửa code BE008 không tự động cho phép sửa frontend hoặc roadmap khác ngoài phạm vi đã xác nhận.
- [ ] Bàn giao FE008: endpoint/body/event union B, lỗi HTTP JSON trước start so với error event sau start; EOF không terminal là lỗi; delta append; done có cost/duration; abort fetch là Stop và partial/stopped do FE quản lý; generation ID ở FE chống cập nhật từ request cũ. Không có endpoint stop/resume và không dùng EventSource cho POST này.
- [ ] Nghiệm thu live nếu có yêu cầu riêng: xác nhận số request/model/phạm vi quota trước chạy; local suite không chứng minh deployment BTC hỗ trợ đầy đủ contract hoặc Stop dừng tính phí. Không tự chạy live để thử lỗi429/so quota.

### 2026-11-16 — Review triển khai Gemini và sửa lỗi Codex

- Đã có parser NDJSON, client stream, route `/api/stream`, wiring app/server và startup test; `/api/generate` và catalog cũ giữ nguyên. Baseline Gemini chạy local **241/241 tests/subtests pass** trước khi thêm regression, nhưng còn các nhánh lỗi chưa được phát hiện bởi bộ test đó.
- **Đã tái hiện fail rồi sửa:** deadline khi callback reject bằng abort reason phải là UPSTREAM_TIMEOUT thay vì rơi vào INTERNAL_ERROR; external abort phải chặn cả delta/finish đã buffer và kiểm tra sau callback; lỗi terminal write phải destroy response thay vì bỏ qua khiến response có thể còn mở.
- Callback/controller ghi nhận nguyên nhân timeout/external một lần; kiểm tra hủy/deadline trước onReady, trong vòng event, sau callback và trước resolve. Giữ nguyên raw callback error khi không phải hủy/timeout, không gọi đó là upstream-invalid-response.
- Bổ sung regression client/terminal writer; test barrier/counter chứng minh overlap thật2/3/4 (test cũ chỉ có4 request và không đo overlap); socket disconnect trước headers; assert upstream đóng sau finish; terminal kết thúc cả khi write trả false. Thêm socket reset sau delta để phân biệt network error với EOF sạch thiếu finish; startup integration bật logger thật kiểm tra success và in-band error không lộ key/prompt/text/raw error/usage/pricing.
- Kết quả cuối local: `npm test --prefix backend` **250/250 tests/subtests pass**, không skip/cancel; typecheck/build/root lint/targeted Prettier và `git diff --check` exit0. Build dùng src-only tsconfig, không đưa test/stub vào dist. Review độc lập không phát hiện thêm blocker production. Không sửa frontend, env/key, dependency hoặc smoke CLI; không stage/commit/push.
- Review không khẳng định trình tự TDD của Gemini; các regression Codex thêm có bằng chứng fail trước sửa/pass sau sửa. Chưa có live BTC, browser→backend stream hoặc UI Stop/reasoning FE008. Một số matrix trong Tasks (chẳng hạn toàn bộ biến thể malformed usage, tất cả Unicode/request-size validation cho route mới) chưa có test stream riêng; không tick nghiệm thu đầy đủ các matrix này dựa trên regression JSON cũ.

### 2026-11-17 — Ghi nhận thay đổi giao diện Stop và render toán

- Theo yêu cầu người dùng, đã ghi bổ sung này ở cuối cả FE008 và BE008. Code thay đổi lần này thuộc frontend: style Stop, render công thức trong question/answer, dependency/tests/browser checks; chi tiết và file scope tại nhật ký cuối FE008.
- Backend BE008, payload `{ prompt, model }`, delta text/reasoning, duration/cost và cơ chế abort giữ nguyên; không thêm system prompt, không ép provider trả Markdown/LaTeX. Không gọi BTC live. NDJSON vẫn truyền nguyên chuỗi model trả về, frontend mới chịu trách nhiệm parse delimiter toán để hiển thị.
- Frontend bổ sung remark-math/rehype-katex/katex và parser bảo vệ code; math không đổi source text hoặc nội dung Copy code. Stop dùng token hiện có, icon sáng và nút pill32px, không đổi hủy request hoặc cam kết billing.
- Kiểm chứng cho thay đổi này: frontend **268/268 tests pass**, typecheck/build/lint/browser layout+interactions/format/diff đạt. Chưa chạy lại backend suite vì không sửa backend; không dùng kết quả frontend để tuyên bố nghiệm thu BTC/abort tính phí. JS bundle tăng lên khoảng798.72kB (gzip243.85kB), vẫn có warning>500kB. Không stage/commit/push.

### 2026-11-17 — Xác nhận nghiệm thu từ người dùng

- [x] Người dùng xác nhận tất cả kiểm tra chức năng BE008/FE008 đã hoàn tất, ngoại trừ reasoning. Đã tick Acceptance Criteria theo xác nhận này, bao gồm luồng ứng dụng được người dùng trực tiếp kiểm thử.
- [ ] Reasoning/thinking thật: chưa kiểm tra được; để lại như phần mở rộng chưa nghiệm thu, không chặn phạm vi tối thiểu của đề bài.
- Đây là bằng chứng nghiệm thu do người dùng cung cấp, không phải lượt chạy test mới của Codex. Các ô Tasks còn trống mô tả script/matrix tự động cụ thể chưa có bằng chứng đầy đủ được giữ nguyên; không tự nhận đã viết hoặc chạy thêm các test đó.
- Bước tiếp theo: soạn FE009 responsive/mobile, chuyển các cột model thành tabs trên màn hình hẹp theo yêu cầu chung bắt buộc của đề bài. Chưa tạo spec FE009 trong lượt cập nhật này.
