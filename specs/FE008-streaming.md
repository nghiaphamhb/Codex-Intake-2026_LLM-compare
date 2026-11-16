# FE008 - Hiển thị streaming, Stop và reasoning thật

## Goal

Trang so sánh đọc `/api/stream` theo contract [BE008](BE008-streaming.md), hiển thị từng đoạn text/reasoning đúng model và cho phép dừng từng ô hoặc toàn bộ request đang chạy. Giữ nội dung đã nhận khi dừng/lỗi, ngăn dữ liệu của request cũ ghi đè request mới, không mô phỏng typing/thinking.

**Trạng thái:** ngày 2026-11-17, người dùng xác nhận đã hoàn tất các kiểm tra nghiệm thu BE008/FE008, ngoại trừ reasoning/thinking thật chưa kiểm tra được. Acceptance Criteria ghi nhận xác nhận này; lịch sử kiểm thử và các task kiểm chứng tự động chi tiết giữ nguyên bằng chứng đã ghi, không suy ra có thêm test script hoặc lệnh mới được chạy.

**Quyền sửa file:** yêu cầu soạn spec chỉ cho phép tạo tài liệu này. Theo [AGENTS.md](../AGENTS.md), cần được giao/xác nhận triển khai trước khi sửa source/test/tài liệu khác. Không tự stage/commit/push, tạo plan/file kiến trúc khác hoặc sửa BE008. Khi bắt đầu triển khai phải đọc source hiện tại, kiểm tra diff và đọc BE008, FE006, FE007; không ghi đè thay đổi đang có của người dùng.

## User Story

Là người so sánh model, tôi muốn đọc câu trả lời trong lúc nó được tạo, xem reasoning nếu dịch vụ cung cấp và dừng những câu trả lời không cần tiếp tục mà vẫn giữ phần đã nhận.

## Scope

### In

- Thay đường generation của **trang ComparePage** bằng stream thật; catalog vẫn GET `/api/models`. Một POST cho một ô/model, 2–4 model chạy độc lập.
- Parser NDJSON/UTF-8 tăng dần trong browser, runtime validation event, HTTP lỗi trước stream và error event sau mở stream.
- State pending/streaming/success/error/stopped; giữ partial text/reasoning khi stopped/error, chỉ có thời gian/chi phí sau done hợp lệ.
- Stop từng ô; Stop toàn bộ trong composer; Retry error/stopped, New, remove/re-add, unmount và chống stale event theo turnId/modelId/requestId.
- Render Markdown bằng bộ hiện có, reasoning dạng text có toggle; UI tiếng Nga, bàn phím/focus và kiểm thử browser với HTTP stub.

### Out

- Không sửa backend hoặc contract BE008 để khớp parser tự đoán; không gọi BTC/provider từ browser, không đưa key vào VITE/env/client/log.
- Không đổi catalog, picker FE007, pricing/công thức/locale FE007, persistence, Share thật, multi-turn context, mobile tabs/responsive FE009 hoặc redesign desktop.
- Không SSE/EventSource/WebSocket/SDK stream/dependency mới, reconnect/resume, tự retry, fallback `/api/generate`, split text JSON hoàn chỉnh thành typing giả, tự suy reasoning từ `<think>` hoặc đồng hồ.
- Không virtualize, render queue/requestAnimationFrame/timer batch hay giới hạn tổng chiều dài câu trả lời tùy ý. Khởi đầu bằng dispatch theo delta; nếu cần tối ưu phải có đo đạc và đề xuất riêng.
- Không live-test/quota request trừ khi được cho phép riêng. Local stub không chứng minh BE008 production, browser→BTC hoặc Stop ngừng tính phí.

### A. Baseline và file scope

Đã đọc source local ngày soạn: `ComparePage.tsx` dùng `generateAnswer`, có controller map/requestId guard; `PromptForm` có busy/onStop nhưng trang truyền busy=false và callback rỗng. Reducer hiện chỉ resolve từ pending. `AnswerCell` chỉ render pending/success/error; `ThoughtStatus` hiện có nhãn thời gian giả định duration; browser stub chỉ có `/api/generate`. BE008 mới là spec, **chưa coi endpoint stream đã triển khai**. Có thể triển khai FE bằng stub nhưng không được báo tích hợp backend hoàn tất khi BE008 chưa sẵn sàng.

| File dự kiến khi có quyền triển khai                                                  | Trách nhiệm                                                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `frontend/src/features/compare/streamNdjson.ts`, `streamNdjson.test.ts` — mới         | Parser browser không phụ thuộc Node/backend                                                               |
| `frontend/src/features/compare/comparisonStream.ts`, `comparisonStream.test.ts` — mới | Fetch `/api/stream`, validation sequence, callback delta, terminal/error/cancel                           |
| `frontend/src/features/compare/comparisonApi.ts`                                      | Chỉ export helper `handleHttpError` hiện có để stream reuse; giữ generateAnswer/fetchModels và hành vi cũ |
| `frontend/src/features/compare/types.ts`                                              | State/action mở rộng tối thiểu, giữ fixtures/showcase tương thích                                         |
| `frontend/src/features/compare/comparisonState.ts`, `comparisonState.test.ts`         | Delta/stop/terminal guarded, Retry error/stopped                                                          |
| `frontend/src/features/compare/ComparePage.tsx`, `ComparePage.test.tsx`               | Request orchestration, cleanup, Stop all/cell, busy và error mapping hiện có                              |
| `frontend/src/features/compare/components/CompareGrid.tsx`, test tương ứng            | Chuyển action stop đúng turn/model tới trang                                                              |
| `frontend/src/features/compare/components/AnswerCell.tsx`, `.module.css`, `.test.tsx` | Render partial, Stop/Retry, status và metadata, aria-busy                                                 |
| `frontend/src/features/compare/components/ThoughtStatus.tsx`, `.test.tsx`             | Thêm label override cho reasoning không có timing; giữ props fixture cũ                                   |
| `frontend/src/features/compare/components/PromptForm.tsx`, `.test.tsx`                | Thêm mô tả accessible Stop all tối thiểu và regression busy/Enter/IME/Stop; không redesign form           |
| `frontend/scripts/apiStub.mjs`, `helpers.mjs`, `interactions.mjs`, `layout.mjs`       | HTTP stream stub và browser assertions mới; cập nhật regression generation theo transport mới             |
| `README.md`, `specs/FE000.md`, spec này                                               | Chỉ khi được phép: hướng dẫn, kết quả thật và trạng thái hiện hành                                        |

Không import backend/src vào frontend để reuse types/parser; không tạo shared package, đổi tsconfig/package/lockfile/vite config hoặc refactor component Markdown. Giữ `AnswerContent`, `CodeBlock`, `AnswerError`, `AnswerStatus`, `formatCostUsd` và CSS tokens; chỉ sửa thêm nếu có lỗi tái hiện thuộc FE008 và được mở rộng phạm vi. Không sửa lịch sử FE003–FE007; fixtures/showcase không thành fallback production.

### B. Contract browser client — không suy đoán theo source BTC

Frontend chỉ đọc **API public BE008**, không parse event BTC `finish`, `text-start` hoặc usage. Request: `POST /api/stream`, headers `Content-Type: application/json`, `Accept: application/x-ndjson`, body đúng `{ prompt, modelId }`, relative URL cùng origin và signal theo request. Giữ nguyên prompt; validation blank/10000 code points theo helper hiện có. Không gửi conversation history, model alias, requestId/key hoặc stream:true lên backend.

Thêm trong `comparisonStream.ts`:

```ts
export type ComparisonStreamDelta =
  { type: 'text-delta'; delta: string } | { type: 'reasoning-delta'; delta: string };
export type ComparisonStreamResult = {
  durationMs: number;
  costUsd: number | null;
};
export async function streamAnswer(
  input: { prompt: string; modelId: string },
  signal: AbortSignal,
  onDelta: (event: ComparisonStreamDelta) => void,
): Promise<ComparisonStreamResult>;
```

- Dùng `ComparisonApiError` hiện có. Export/reuse `handleHttpError(response, signal)` cho HTTP khác200 (JSON envelope/status fallback), không nhân bản bảng message. Không hiển thị raw error.message từ backend. Public `INTERNAL_ERROR`/code lạ map `UPSTREAM_ERROR` để UI dùng câu Nga an toàn hiện có; không cần thêm error class/framework.
- HTTP200 bắt buộc body tồn tại và Content-Type có media type `application/x-ndjson` (case-insensitive, trim, cho phép `; charset=utf-8`). HTML/JSON/SSE hoặc thiếu header → `INVALID_RESPONSE`, không fallback endpoint khác.
- Public event shapes:

```ts
type StreamEvent =
  | { type: 'start'; modelId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'done'; durationMs: number; costUsd: number | null }
  | { type: 'error'; error: { code: string; message: string } };
```

- Runtime parse từ unknown: object khác null/array, đọc own properties. Bỏ field dư; chỉ giữ field đã validate, không spread. Không dùng type assertion thay validation. Type lạ hoặc event sai shape → `INVALID_RESPONSE` (khác parser upstream BE008 bỏ event BTC lạ).
- Start phải đúng một lần, đầu tiên, modelId đúng input. Delta/done trước start hoặc start lần hai → invalid. Riêng error hợp lệ có thể tới trước start để báo lỗi streaming sớm; luôn terminal, không success. Code phải nonempty string, message string nhưng message không được render/log. Mã có trong ComparisonApiErrorCode upstream dùng mapping hiện có; INTERNAL_ERROR/unknown →UPSTREAM_ERROR.
- Delta bắt buộc string; giữ nguyên thứ tự/Unicode/whitespace/newline, bỏ delta rỗng. Callback chỉ nhận delta sau start; start không được coi là text hoặc reasoning. Không cần callback start vì pending chờ nội dung vẫn đúng.
- Done: durationMs bắt buộc number hữu hạn >=0. costUsd bắt buộc có field: null hoặc number hữu hạn >=0; missing/string/âm/nonfinite → invalid (stream contract nghiêm hơn generateAnswer cũ). Không coerce, không dùng truthiness cho zero.
- Done hợp lệ → resolve metadata, không đọc đến socket EOF. Error → reject ComparisonApiError. Khi gặp terminal đầu tiên, ngừng parser và cancel reader best effort, bỏ mọi bytes sau terminal kể cả cùng chunk; không phát callback hoặc terminal lần hai. EOF sạch không terminal → INVALID_RESPONSE; socket read lỗi →NETWORK_ERROR. Text partial do trang giữ, helper không trả success giả khi stream cụt.
- Fetch/read lỗi do chính signal đã abort → hủy, không chuyển thành NETWORK_ERROR/timeout. Signal aborted trước gọi phải không fetch. Check signal trước callback, trước resolve và trong catch. Lỗi callback ngoài dự kiến không biến thành parser error; trang vẫn sanitize lỗi thường thành câu generic.
- finally cancel reader nếu cần/release lock, không đọc body hai lần, không để promise reject không được xử lý. Không thêm frontend deadline số giây tùy ý; backend quyết định timeout. Một stream treo không terminal vẫn pending/streaming và người dùng có Stop/New/remove.

**Parser browser:** `streamNdjson.ts` export `parseStreamNdjson(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<unknown>` và `class StreamNdjsonError extends Error` constructor không tham số/message cố định `Invalid NDJSON stream`. Adapter async generator trong client dùng getReader()/reader.read() để cung cấp iterator; dọn lock trong finally. Không dùng for-await trực tiếp trên response.body rồi thêm DOM.AsyncIterable vào tsconfig để che compile error; giữ lib hiện có. Không cần môi trường Node hoặc reuse module BE.

- LF/CRLF, dòng trắng bỏ qua, BOM UTF-8 duy nhất đầu stream, dòng JSON cuối không LF vẫn parse lúc EOF. Chia byte giữa emoji/Nga/Việt hoặc escape JSON vẫn đúng. Giải mã UTF-8 strict/fatal; lỗi decode/JSON chỉ wrap StreamNdjsonError, lỗi input iterator giữ nguyên để phân biệt network.
- Giới hạn một dòng **1,048,576 byte trước LF** như BE008, tính cả CR/BOM; vượt giới hạn dù chưa newline → lỗi sớm/cancel. Không đếm JS string length. Chunk lớn chứa nhiều dòng nhỏ không fail nhầm. Không decode/parse trước các dòng phía sau terminal: consumer có thể return sớm, garbage sau done không làm done thành lỗi.
- Không `response.text()/json()` ở đường HTTP200, không buffer full stream, không JSON.parse từng network chunk độc lập. Backend có thể gộp/chia event tùy transport; test không coi một write/read là một line.

### C. State và reducer — chốt trước khi sửa component

Giữ `pending` để fixture/tests cũ ít đổi; bổ sung streaming/stopped và nội dung partial cho error. Shape tối thiểu trong `types.ts`:

```ts
type ResultAnswer =
  | { state: 'pending'; requestId: string }
  | { state: 'streaming'; requestId: string; markdown: string; reasoning: string }
  | { state: 'stopped'; requestId: string; markdown: string; reasoning: string }
  | {
      state: 'success';
      markdown: string;
      durationLabel: string;
      costLabel?: string;
      requestId?: string;
      thought?: { text: string; durationSeconds?: number };
    }
  | {
      state: 'error';
      message: string;
      description: string;
      requestId?: string;
      markdown?: string;
      reasoning?: string;
    };
```

Pending/streaming là active. Content khi pending coi như hai chuỗi rỗng. Existing success fixture vẫn hợp lệ; success live chuyển reasoning vào thought.text, **không đặt durationSeconds**. Error cũ không partial vẫn render như cũ. Không thêm controller/reader/Promise vào reducer.

Mở rộng `ComparisonStateAction` bằng `stream-delta`, `stop`; tiếp tục dùng `resolve` để kết thúc success/error. Mỗi action đó phải có `turnId, modelId, requestId`; delta thêm `event: ComparisonStreamDelta`. `stop` không cần mang text từ closure. `CompareAction` thêm `{ type: 'stop'; turnId: string; modelId: string }` cho UI, trang lấy requestId hiện hành trước dispatch.

| Action/hiện trạng                                                              | Chuyển trạng thái bắt buộc                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| send hợp lệ                                                                    | Một pending/requestId mới cho mỗi selected model, như cũ                                      |
| stream-delta vào pending                                                       | streaming, append vào kênh tương ứng từ chuỗi rỗng                                            |
| stream-delta vào streaming                                                     | Append đúng kênh; không ghi đè text bằng delta, không nối text vào reasoning                  |
| resolve success từ active                                                      | Giữ markdown đã tích lũy; metadata từ done; thought từ reasoning nếu có nội dung              |
| resolve error từ active                                                        | Giữ markdown/reasoning của reducer; thêm message/description; không mất partial vì closure cũ |
| stop từ active                                                                 | stopped, giữ hai chuỗi hiện có; pending thành stopped với chuỗi rỗng                          |
| retry từ error/stopped                                                         | Pending/requestId mới, xóa nội dung/metadata cũ; model khác không đổi                         |
| mọi delta/resolve/stop vào terminal, requestId sai hoặc ô/turn/model không còn | No-op, giữ state hiện tại                                                                     |

Thay type `resolve.answer` cũ bằng payload metadata-only dưới đây, chỉ chấp nhận success/error (không dùng Exclude pending rồi vô tình cho phép streaming/stopped làm terminal). Trong resolve, reducer lấy content từ target answer active để gán vào kết quả; **không nhận full text/thought trong payload**, không giữ song song hai đường resolve cũ/mới.

Chốt payload resolve cho FE008: `result: { state:'success'; durationLabel:string; costLabel?:string } | { state:'error'; message:string; description:string }`, thay field answer cũ. Reducer tự tạo terminal ResultAnswer từ result + content hiện hành và requestId. Chỉ sửa các tests/caller thực sự dùng action cũ, không thay fixture success shape.

Reducer kiểm tra model còn selected, turn tồn tại, requestId đúng và trạng thái active trước mọi mutation. Dùng update bất biến. Không thay id của turn khi retry; không dùng index/model.name làm key. Loại model xóa answers như hiện tại; add lại không tái tạo ô cũ hoặc backfill. New giữ selection/catalog và xóa turns như cũ.

### D. Điều phối request, Stop và race

Tái sử dụng `abortControllersRef` keyed requestId và `inFlightByCellRef` keyed `JSON.stringify([turnId, modelId])`. Không stringify bằng nối dấu '-' có thể collision. UUID mới cho mỗi lần Send/Retry, không reuse. Register cả hai map **đồng bộ trước** await fetch; reducer vẫn là lớp guard thứ hai.

**Quyết định UX của FE008:** khi còn bất kỳ ô active, composer `busy=true`: nút hiện tại trở thành Stop toàn bộ. Textarea vẫn cho soạn nháp/Shift+Enter/IME; Send/Enter-submit bị chặn cả trong handler trang, không chỉ button. Sau mọi ô terminal, busy=false và Send trở lại. Đây là thay đổi có chủ đích so với FE006 vốn luôn busy=false; không tự cho gửi turn mới lúc đang chạy. Retry một ô error/stopped vẫn được phép trong khi model khác active, nếu ô đó không có request đang chạy.

- `runGeneration` gọi streamAnswer. Callback chỉ dispatch delta nếu mounted, signal chưa aborted và map cell vẫn đúng requestId. Sau resolve/catch kiểm tra cùng guard. Không chờ Promise.all các model mới cập nhật UI. Không dùng closure `state` để nối content.
- Cuối request, chỉ xóa entries nếu chúng vẫn thuộc đúng requestId/controller; finally của request A không được xóa map của Retry B. Xóa cả cell map và controller map, kể cả thành công/lỗi. Map không được rò sau nhiều Retry/Stop.
- **Stop ô:** lấy current requestId từ map; revoke cell entry đồng bộ trước callback có thể tới; dispatch stop với ID đó; abort và bỏ controller entry. Không đợi catch AbortError mới đổi state. Reducer giữ partial; tất cả callback/then/catch cũ bị bỏ qua.
- **Stop all:** snapshot các active entries, revoke tất cả trước rồi dispatch stop đúng từng cell/requestId và abort từng controller; cleanup idempotent. Không abort catalog, không New, không xóa prompt nháp/kết quả đã hoàn tất. Composer onStop gọi luồng này, không endpoint `/stop`.
- Stop click lặp hoặc Stop sau done là no-op. Nếu done được xử lý trước thì success thắng; nếu Stop revoke trước thì stopped thắng và done muộn bị bỏ qua. Không biến stopped thành success/error khi cleanup tới.
- Retry error/stopped dùng nguyên question của turn/model ID, pending mới và đúng một POST. Chặn double-click bằng map reservation đồng bộ. Không Retry success/active/missing; không tự retry khi reconnect hoặc stop. Nội dung retry là lần mới, không nối tiếp partial cũ và không cộng giá lần cũ.
- New: revoke map/abort tất cả, dispatch new-comparison; giữ catalog/selection, clear draft/error/status, đóng picker/focus textarea như cũ. Unmount: revoke và abort, không dispatch stopped/state update. React StrictMode cleanup không được tạo generation thứ hai; generation chỉ từ user event, không effect theo state pending.
- Remove model khi >2: revoke/abort mọi ô active của model qua tất cả turn, rồi reducer remove. Request model khác không đổi. Nếu còn2, remove không được abort bất cứ request nào. Re-add không nhận dữ liệu cũ hoặc tự generate cho turn cũ.
- Busy suy ra từ state pending/streaming, không từ ref map không gây rerender. Maps chỉ chống race và giữ controller. Guard handler Send dùng map active đồng bộ bổ sung để hai submit cùng tick không tạo hai turn.

### E. Hiển thị, reasoning và accessibility

Giữ desktop grid/tokens/divider/sticky/composer và nhãn hiện có. Không tìm lại/thiết kế Figma mới trong FE008; phần Stop ô/stopped là quyết định hành vi của spec này, không tuyên bố có số đo Figma hoặc pixel-perfect. 390px vẫn desktop fallback, không đánh dấu mobile hoàn tất.

| State     | Nội dung và hành động                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pending   | `AnswerStatus waiting` như cũ; Stop ô hiện và aria-busy=true                                                                                                                                                                 |
| streaming | Text hiện có qua AnswerContent, reasoning toggle nếu có; `AnswerStatus generating` chỉ khi đã có text khác rỗng; reasoning-only không gắn nhãn “Печатает…” sai dữ liệu, dùng status `Получаем ответ…`; Stop ô/aria-busy=true |
| success   | Text/reasoning được giữ nguyên; metadata thời gian · giá như FE007; không Stop/Retry, aria-busy=false                                                                                                                        |
| error     | Partial text/reasoning giữ phía trên AnswerError hiện có + Retry; không metadata/Stop, aria-busy=false                                                                                                                       |
| stopped   | Partial giữ nguyên; nhãn `Генерация остановлена.` + nút `Повторить`; không metadata/Stop, aria-busy=false                                                                                                                    |
| missing   | Placeholder hiện tại; không Stop/Retry                                                                                                                                                                                       |

- Stop ô dùng button type=button với icon stop.svg hiện có, visible label `Остановить`, accessible name `Остановить ответ: ${model.name}`. Không dùng global composer label trùng để browser selector bắt nhầm. onStop là prop mới của AnswerCell; CompareGrid gửi action stop turnId/modelId tương ứng. Dùng style nút hiện có/token, không thêm icon library.
- Composer dùng PromptForm busy/onStop, label `Остановить генерацию`; label này nghĩa Stop all. Thêm prop optional `stopDescription?: string`, ComparePage truyền `Остановить все текущие ответы`. PromptForm tạo ID bằng useId, render mô tả visually-hidden khi busy/có prop và gắn aria-describedby trực tiếp lên IconButton Stop. IconButton đã hỗ trợ native ButtonHTMLAttributes, không sửa IconButton. Caller showcase không truyền prop vẫn giữ hành vi cũ; không đổi gửi/IME/resize logic.
- Stop ô đang focus rồi bị thay bằng Retry: chuyển focus đến Retry cùng ô; Stop all chuyển focus về textarea sau xử lý. Áp dụng cả khi request tự done/error hoặc Stop/done tranh nhau: ghi nhận ngay trước terminal transition liệu chính Stop của ô đó đang focus; nếu có, error/stopped chuyển sang Retry cùng ô, success chuyển về textarea sau commit DOM. Nếu focus ở nơi khác thì giữ nguyên. Không focus theo delta hoặc gọi focus textarea ở mọi stream callback; không cướp focus người đang đọc/gõ ở ô khác.
- Mỗi ô có aria-busy. Chỉ nhãn trạng thái/terminal dùng role=status/aria-live=polite; **không** đặt toàn Markdown/reasoning trong live region hoặc đọc lại toàn nội dung mỗi delta. Keyboard Tab/Enter/Space của Stop/Retry/toggle hoạt động; visible focus; reduced-motion giữ hiệu lực.
- Dùng AnswerContent cho partial Markdown ngay khi có text: code fence/bảng/link chưa hoàn chỉnh vẫn render an toàn; không tự thêm dấu đóng fence vào buffer, không dangerouslySetInnerHTML/rehype-raw hoặc đổi policy skipHtml/image. Copy code lấy nội dung đang hiển thị ở lần click, không đọc stale closure; terminal/partial vẫn Copy được theo component sẵn có.
- Không ép scroll xuống cuối trên mỗi delta, không gọi scrollIntoView/focus liên tục. Không thêm auto-scroll trong FE008. Nội dung dài/code/table dùng cơ chế overflow hiện có.
- Reasoning là chuỗi riêng. Render bằng text React, không HTML/Markdown parser; whitespace-only không cần toggle hiển thị. Thêm prop optional `label?: string` vào ThoughtStatus, override nhãn nếu có. Live dùng label `Рассуждения`, không truyền durationSeconds và không nhãn “Думала N секунд”/“Готово” giả cho reasoning-only. Props fixture cũ vẫn giữ behavior.
- Toggle reasoning mặc định đóng; khi người dùng mở thì giữ trạng thái mở qua delta, done, stopped/error của **cùng request**. Render ThoughtStatus tại một vị trí ổn định, key theo requestId của ô; không đặt nó trong các nhánh mount/unmount khác nhau khi streaming→terminal. Retry key mới thì reset đóng. Không lấy durationMs tổng làm thời gian reasoning; BE008 không gửi reasoning-end/timing.
- Chỉ done mới format duration theo ru-RU như hiện tại và cost qua formatCostUsd: null không giá; 0 giữ `$0,0000`; giá nhỏ dùng `< $0,0001`; tooltip FE007 giữ nguyên. Pending/streaming/stopped/error không đồng hồ đếm/chi phí suy đoán. Empty success vẫn hiện metadata; không tự thêm text “model lỗi” vì text rỗng.

## Flow

1. Mount/catalog như FE006; người dùng chọn2–4 model, gửi prompt hợp lệ. Trang tạo turn/requestId/controller riêng và chạy POST stream song song; composer chuyển busy.
2. Mỗi stream validate start, parse delta, dispatch append đúng ô. Text/reasoning khác tốc độ không chặn nhau.
3. Done hợp lệ chuyển ô success với nội dung đã tích lũy và metadata. HTTP error/error event/network/EOF lỗi chuyển error, giữ partial và cho Retry riêng.
4. Stop ô chỉ dừng ô đó; Stop composer dừng tất cả active, giữ các success/error/partial và draft. Abort fetch là tín hiệu cho backend ngừng kết nối, không cam kết BTC dừng tính phí.
5. Khi không còn active, composer trở về Send. Retry là lần gọi mới cho cùng question/model, xóa partial cũ của ô đó; có thể chạy khi ô khác đang chạy.
6. New/remove/unmount abort đúng phạm vi và vô hiệu dữ liệu cũ. Reload vẫn mở hội thoại rỗng; không persistence/Share thật.

## Edge Cases

- Start sai model/lặp; delta/done trước start; event lạ/JSON sai/UTF-8 lỗi; HTTP200 HTML/SSE; EOF trước terminal sau partial. Không suy success từ text khác rỗng.
- Empty stream done, reasoning-only, whitespace text, chunk chia byte emoji hoặc JSON escape, nhiều event chung chunk, done rồi garbage/socket không đóng. Không parse garbage sau terminal.
- cost missing/negative/string/nonfinite khác null/0; duration0 hợp lệ. Không dùng Date.now đo thay metadata backend.
- Stop trước headers/giữa delta/cùng tick done; Stop→Retry ngay, New→Send lại, remove→re-add cùng model; callback cũ cố đến dù mock bỏ qua abort. Guard vẫn phải thắng.
- Retry một ô trong khi model khác streaming, double-click Retry/Send, Stop all khi có Retry thuộc turn cũ, minimum2 remove guard. Không để map cũ xóa entry mới.
- Toggle reasoning đang mở lúc done/stop/error; nháp nhập khi busy; focus Stop bị gỡ; IME Enter229, Shift+Enter, reduced-motion, Copy khi code chưa đủ fence.
- Catalog empty/one/error/retry không regress; picker/Escape/focus giữ FE007. Expected abort trong browser tests được ghi nhận có chủ đích, không bỏ qua mọi requestfailed/console error.

## Acceptance Criteria

- [x] ComparePage dùng đúng `/api/stream`, mỗi ô một request; không `/api/generate` fallback hoặc key/provider call từ browser.
- [x] Parser/runtime schema/sequence đúng B; delta hiển thị trước done qua HTTP thực, không đợi full body hoặc text giả.
- [x] Reducer append riêng text/reasoning, terminal giữ partial; stopped/error không có duration/cost; success dùng metadata BE008 và format FE007.
- [x] Stop ô/all đúng phạm vi, idempotent; abort đóng kết nối thật và không báo lỗi mạng cho hủy chủ động. Không claim ngừng billing.
- [x] Mọi callback/terminal được guard requestId và membership; New/remove/re-add/unmount/Retry không nhận dữ liệu cũ, maps cleanup đúng owner.
- [x] Busy/Send/Retry theo D; IME/nháp/focus/keyboard và reasoning toggle ổn định qua state transitions.
- [x] Markdown partial an toàn, reasoning text thật không duration giả, không live announce toàn nội dung hoặc tự scroll theo delta.
- [x] Browser stub chứng minh overlap2/3/4, incremental, Stop/error/Retry/race; không chỉ mock unit rồi báo browser tích hợp.
- [x] Unit/typecheck/build/lint/browser/targeted format/diff có kết quả mới; báo backend/live/mobile chưa nghiệm thu nếu chưa có bằng chứng.

- [ ] Nghiệm thu reasoning/thinking thật từ provider qua BTC: người dùng chưa kiểm tra được. Phần đã test bằng stub không thay thế xác minh này.

## Tasks

TASK-001→006 sau khi được giao triển khai. Mỗi task viết test fail đúng hành vi trước code, implement nhỏ nhất rồi chạy lại. Không đổi expectation thành behavior sai, skip test, thêm sleep dài/nới deadline hoặc xóa assertion để che lỗi. Không dùng số test/checklist lịch sử làm kết quả mới.

### TASK-001 — Parser và stream client

- [ ] Tạo parser/tests theo B: từng byte Nga/Việt/emoji, UTF-8 invalid/dangling EOF, LF/CRLF/BOM đầu/blank/final no-LF, đúng/vượt line limit, chunk nhiều dòng tổng lớn, consumer return trước garbage.
- [ ] Tạo streamAnswer/tests bằng Response/ReadableStream điều khiển gates: assert URL/method/headers/exact body/signal; start rồi delta callback đến khi done vẫn bị giữ. Không mock bằng Response chứa toàn bộ text rồi kết luận streaming.
- [x] Matrix event và sequence: start model mismatch/lặp, missing type/delta/metadata, null/array, unknown type, extra fields; error trước/sau start; mapped/raw unknown code. Done0/null/float hợp lệ; thiếu cost khác null.
- [x] Test HTTP errors mapping hiện có, sai content type/body, socket read rejection→NETWORK_ERROR, parser/EOF→INVALID_RESPONSE, abort trước fetch counter0 và giữa read không thành network. Terminal resolve/reject một lần và cancel reader cả khi peer chưa close.
- [x] Export handleHttpError để reuse, giữ comparisonApi.test.ts cũ. Chạy `npm test --prefix frontend -- streamNdjson.test.ts comparisonStream.test.ts comparisonApi.test.ts` và typecheck.

### TASK-002 — Types/reducer có guard

- [x] Thêm types/actions theo C; resolve payload metadata-only. Test pending→delta nhiều lần hai kênh→success/error/stop, zero/empty content, partial không bị closure overwrite, terminal không nhận thêm delta/done.
- [x] Test requestId sai/turn thiếu/model removed no-op; stop then late done/error no-op; retry error/stopped resets đúng ô, requestId mới; success/active/missing không retry. Add/re-add vẫn không backfill.
- [x] Cập nhật test cũ gọi resolve.action, không xóa validation/immutability/min-max/Unicode assertions. Giữ success fixture/showcase source nếu không cần sửa. Chạy reducer/API tests rồi typecheck.

### TASK-003 — Orchestration và cancellation

- [x] Đổi ComparePage sang streamAnswer, reuse maps; reserve đồng bộ và callback guarded. Component tests chủ động gửi callback muộn ngay cả sau abort để chứng minh guard, không chỉ dùng fetch mock tôn trọng abort.
- [ ] Test Stop ô/all/empty pending, done trước stop/stop trước done, stop→retry, retry double-click, New→new Send, remove/re-add, unmount/StrictMode. Assert number/path/body của requests, controller signal, không state update sau unmount.
- [ ] Test old finally sau Retry mới không xóa controller/cell entry B; sau done/error/Stop/New/unmount không còn active maps. Kiểm tra không auto generation từ effect và không refetch catalog khi Retry/Stop.
- [x] Wire composer busy=any active và Stop all; guard Send trong handler bằng active map để double-submit cùng tick bị chặn. Test nháp giữ khi Stop, không gửi Enter lúc busy, trở lại Send khi tất cả terminal; Retry riêng khi ô khác active vẫn chạy.

### TASK-004 — Components và accessibility

- [x] Grid/AnswerCell onStop đúng tuple, nút Stop ô và stopped Retry theo E; render partial chung vị trí, aria-busy/nhãn status. Error partial phải còn thấy Markdown/reasoning và Retry, không chỉ error card.
- [ ] ThoughtStatus label override optional, live không timing; tests toggle đang mở giữ qua delta→done/stop/error, retry request mới reset đóng; fixture old duration label giữ nguyên. Không tạo clock/timer/thought từ pending.
- [ ] Test focus Stop cell→Retry, Stop all→textarea, auto error/done khi Stop ô đang focus có fallback đúng E, terminal khi focus ở nơi khác không cướp focus; bàn phím và IME/Enter/Shift+Enter khi busy. Thêm stopDescription trong PromptForm theo E; test accessible description ở chính nút Stop và caller cũ không có prop vẫn hoạt động.
- [x] Test partial fenced code/table/link, Copy ở thời điểm click, unsafe HTML/image policy không đổi. Metadata tests null/0/tiny cost, duration0, stopped/error không metadata; không có token hoặc reasoning timing giả.

### TASK-005 — HTTP stub và browser regression

- [x] Mở rộng apiStub thêm `/api/stream` đúng public contract B; giữ `/api/generate` cho test client JSON cũ nếu còn dùng. Default stream trả cùng deterministic Markdown/cost như fixture hiện tại để layout regression có nội dung tương đương.
- [ ] Bổ sung gate theo từng request/attempt (không chỉ modelId khi Retry), release headers/delta/done riêng, inject HTTP/inband/EOF/reset, counters start/completed/aborted/active. Theo dõi `res.close` với !writableFinished; req body end không là client abort. Decrement active đúng một lần; cleanup held entries/timer/socket kể cả test fail.
- [x] Cập nhật helper/interactions/layout để kiểm tra transport mới; assertion cũ về Send trong khi đang chạy phải đổi theo D có ghi rõ lý do, không bỏ test pending/overlap. Không coi networkidle là điều kiện chờ khi cố tình giữ stream; dùng DOM status/barrier có deadline.
- [x] Browser thực nhận start/delta khi stub chưa cho done; kiểm tra text tăng, reasoning toggle, partial code/table, metadata chỉ sau done. Đếm overlap2/3/4 active và xác nhận request từ trang là `/api/stream`, catalog giữ nguyên số lần dự kiến.
- [x] Stop một ô làm stub nhận disconnect, hai ô còn lại nhận done. Stop all active về0; partial giữ; Retry tăng đúng một POST/attempt; HTTP429 và inband error sau partial chỉ ảnh hưởng đúng ô. New/remove/re-add và late event không hồi sinh data.
- [x] Giữ regression1440/1280 grid/alignment/sticky/composer, picker/keyboard/focus, Copy/denied clipboard, catalog states, reduced-motion/showcase và fallback390. Chụp waiting/partial/reasoning-open/stopped/error/completed, xem PNG trực tiếp trước kết luận UI; không ép height để khớp fixture khác nội dung.
- [x] Browser fail đúng khi pageerror/console/resource/unexpected HTTP/requestfailed. Dùng cơ chế expectRequestFailed/expectHttpError hiện có và chỉ mở rộng theo request cụ thể: Stop/New/remove gây abort là expected, không suppress toàn bộ network failures.
- [ ] Khi stub cố tình không close sau done/error, client cancel reader có thể làm browser báo ERR_ABORTED dù đã nhận terminal. Chỉ whitelist đúng request/attempt có bằng chứng terminal đã nhận; không coi mọi stream failure sau khi đã có partial text là expected. Phân biệt test hủy chủ động trước terminal với cancel reader sau terminal trong counters/assertions.

### TASK-006 — Verification và bàn giao

- [x] Từ root chạy `npm test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, `npm run lint`, `npm run test:browser --prefix frontend`, targeted Prettier các file sửa và `git diff --check`. Không format toàn repo hoặc sửa backend để chạy suite frontend.
- [x] Ghi kết quả thật/exit code/số test, screenshot đã xem, warning bundle hiện có và phần chưa kiểm tra. Backend tests không bắt buộc nếu không sửa backend; build xanh không thay browser assertions/visual QA.
- [x] Nếu được phép cập nhật docs, README/FE000 ghi streaming local/Stop/reasoning, điều kiện BE008, giới hạn billing/mobile/live; không tự đánh dấu toàn luồng BTC đã nghiệm thu. Chỉ tick task có bằng chứng, không copy thành tích FE006/FE007.
- [ ] Nếu BE008 đã triển khai, có thể nghiệm thu browser→backend qua upstream stub riêng khi được giao; ghi rõ đó vẫn là offline. Live BTC chỉ khi có yêu cầu riêng về model/số request/quota, không tự chạy để “chứng minh Stop”.

### 2026-11-16 — Review Gemini/Claude và sửa lỗi Codex

- Baseline local: **253 unit tests pass**, browser layout/interactions pass, nhưng chưa bắt được các lỗi dưới đây. Review độc lập phát hiện hai lỗi focus; root tái hiện bằng regression test trước khi sửa.
- **Parser:** dòng chỉ chứa whitespace bị coi là JSON lỗi; BOM trên dòng cuối không LF giữa stream bị decoder tự bỏ; giới hạn byte không tính BOM đầu. Đã sửa framing byte theo từng dòng, kiểm tra limit trước loại BOM/CR và dùng decoder fatal/ignoreBOM rõ ràng. Giữ browser module độc lập, không import backend; bỏ nối/copy lại toàn buffer ở mỗi chunk để tránh chi phí bậc hai khi dòng bị chia nhỏ.
- **Client:** response HTTP200 sai Content-Type trước đây throw nhưng không cancel body còn mở; TypeError từ callback bị gắn nhầm NETWORK_ERROR. Đã đóng body bị từ chối và giữ nguyên lỗi callback để trang sanitize generic; lỗi đọc mạng vẫn phân loại riêng.
- **Focus:** pending→streaming trước đây remount Stop và mất focus; stopped/error có reasoning trước đây chọn button đầu tiên (reasoning toggle) thay vì Retry. Đã giữ một Stop DOM cho active state và dùng selector action Retry rõ ràng trong cả AnswerCell/AnswerError; không đổi layout hoặc nhãn nút.
- Thêm8 unit cases (bao gồm hai biến thể stopped/error), từng nhóm fail trước code fix/pass sau fix. Sửa assertions New/remove để thực sự gửi late delta “Ghost…” sau abort/re-add thay vì chỉ kiểm tra chuỗi chưa từng được mock emit.
- Browser bổ sung partial trước Stop và assert focus xuyên delta, giữ partial/reasoning, đếm abortedRequests; Stop all đóng3 socket/active0, giữ nháp và partial; HTTP429/in-band error sau partial không render raw message. Chụp và xem ảnh partial/stopped-reasoning/partial-error trong frontend/artifacts/verification (Git ignore), không tuyên bố khớp pixel tuyệt đối.
- Một lượt browser cuối gặp ERR_ABORTED do cancel reader sau terminal; sửa helper chỉ chấp nhận abort không dự kiến khi request là stream HTTP200, có ô success/error đúng prompt/model và attempt mới nhất. Partial/stopped hoặc không có bằng chứng terminal vẫn làm test fail. Browser chạy lại layout/interactions đạt; không suppress mọi requestfailed.
- Kết quả sau sửa: **261/261 unit tests pass** (25 test files), typecheck/build/root lint/targeted Prettier/git diff --check đạt. Build vẫn cảnh báo chunk >500kB (JS khoảng522.64kB, gzip160.27kB); không thêm dependency, không sửa backend/env/key, không stage/commit/push. Chưa nghiệm thu browser→backend BE008 hoặc BTC thật.
- **Khoảng trống còn lại:** checklist đã tick trước review có nhóm bao nhiều yêu cầu con vượt bằng chứng test thực tế; đã bỏ tick các nhóm chưa đủ. Chưa có toàn bộ matrix parser từng-byte/dangling EOF/large-chunk trong test FE riêng; test gate client thật trước done, old-finally/retry cùng ô, toàn bộ race/StrictMode/focus-terminal/toggle lifecycle chưa đủ case riêng. Browser stub vẫn gate theo modelId, chưa theo attempt, chưa inject EOF/reset hoặc đếm completed; terminal-abort có guard nhưng chưa có browser scenario peer cố tình treo sau terminal. Những mục này là thiếu bằng chứng nghiệm thu đầy đủ, không được báo toàn bộ spec đã hoàn tất. Code reducer/orchestration review chưa phát hiện thêm lỗi cụ thể.

### 2026-11-17 — Bổ sung theo xác nhận người dùng: Stop và công thức

- Phạm vi được người dùng cho phép sau ảnh kiểm thử: chỉnh nút Stop và render toán trong câu hỏi/câu trả lời; ghi thao tác vào cuối FE008/BE008. Phần này mở rộng giới hạn dependency/rendering của spec cũ. Không thêm chỉ dẫn Markdown vào prompt, không sửa backend/provider contract.
- `AnswerCell.module.css`: Stop từng ô cao tối thiểu32px, nền tối, viền nhẹ, radius-pill; dùng token text-primary/focus-ring có thật thay token chưa khai báo. Icon SVG đen được invert thành sáng bằng CSS, không sửa asset gốc hoặc hành vi Stop. Giữ Stop all của form.
- Thêm `math.ts`, `math.css`; cập nhật AnswerContent/QuestionBubble và frontend package/lock. Dùng remark-math + rehype-katex + katex (CSS/fonts local), unified/remark-parse để nhận diện vùng code/HTML/math cần bảo vệ. Hỗ trợ `$...$`, `$$...$$`, `\(...\)`, `\[...\]`; chỉ chuẩn hóa cặp dấu đầy đủ ở lớp hiển thị, không mutate source trong state hoặc request.
- Câu hỏi chỉ render phần toán, giữ chữ/Markdown/HTML/code khác dưới dạng text như trước. Câu trả lời giữ Markdown/GFM và CodeBlock/Copy; không diễn giải toán trong inline/fenced/indented code, kể cả fence nhãn math. Công thức lỗi/đang thiếu không làm crash; KaTeX trust=false/maxExpand1000 và skipHtml vẫn bật, không cho lệnh toán tải ảnh hoặc javascript link. Công thức display dài cuộn ngang trong vùng toán.
- Review độc lập phát hiện và đã sửa hai trường hợp: normalize display không được chèn newline phá list/blockquote/table; stock rehype-katex nhận language-math từ code fence nên cần bảo vệ class của code thường trước render rồi khôi phục. Đã thêm regression cho cả hai và giữ nguyên ba tests QuestionBubble cũ.
- Kiểm chứng cuối: **268/268 unit tests pass**, typecheck/build/root lint/targeted format/diff đạt; browser layout/interactions qua stub đạt, có kiểm tra màu/radius/height/icon Stop, math trong question/answer và pre không chứa KaTeX. Đã xem ảnh `fe008-stop-refined.png`, `fe008-math-rendered.png` trong frontend/artifacts/verification (Git ignore). Không gửi prompt live BTC hoặc stage/commit/push.
- Build có JS khoảng798.72kB (gzip243.85kB), CSS62.39kB (gzip16.29kB); cảnh báo chunk>500kB còn và tăng do KaTeX. npm install báo4 advisory mức low, không chạy audit fix ngoài phạm vi. Đây là renderer KaTeX theo delimiter, không tự suy toán từ mọi chuỗi ASCII dạng4^x hoặc bảo đảm render mọi macro LaTeX.

- Rà soát bổ sung: công thức display nhiều dòng đặt nội dung ngay sau dấu mở được chuyển thành block với delimiter trên dòng riêng để tránh remark-math coi dòng đầu là metadata; có regression giữ đủ cả hai dòng biểu thức. Các biểu thức nhiều dòng nằm trong container Markdown lồng nhau vẫn cần kiểm tra riêng theo indentation của nguồn.

### 2026-11-17 — Xác nhận nghiệm thu từ người dùng

- [x] Người dùng xác nhận tất cả kiểm tra chức năng BE008/FE008 đã hoàn tất, ngoại trừ reasoning. Đã tick Acceptance Criteria theo xác nhận này, bao gồm luồng ứng dụng được người dùng trực tiếp kiểm thử.
- [ ] Reasoning/thinking thật: chưa kiểm tra được; để lại như phần mở rộng chưa nghiệm thu, không chặn phạm vi tối thiểu của đề bài.
- Đây là bằng chứng nghiệm thu do người dùng cung cấp, không phải lượt chạy test mới của Codex. Các ô Tasks còn trống mô tả script/matrix tự động cụ thể chưa có bằng chứng đầy đủ được giữ nguyên; không tự nhận đã viết hoặc chạy thêm các test đó.
- Bước tiếp theo: soạn FE009 responsive/mobile, chuyển các cột model thành tabs trên màn hình hẹp theo yêu cầu chung bắt buộc của đề bài. Chưa tạo spec FE009 trong lượt cập nhật này.
