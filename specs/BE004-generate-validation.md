# BE004 - Kiểm tra yêu cầu sinh câu trả lời

**Trạng thái:** đã triển khai và qua review/kiểm tra cục bộ ngày 2026-11-12. Spec này mô tả mốc BE004 với placeholder 501; BE005 đã thay placeholder bằng generation, giữ validation và cập nhật test đường hợp lệ. Chưa nghiệm thu LLM thật bằng key BTC.

## Goal

Chấp nhận request có câu hỏi hợp lệ và model ID nằm trong catalog trước khi triển khai gọi proxy ở BE005. Phụ thuộc BE001–BE003. BE004 không sinh văn bản và không tiêu hao hạn mức API.

## User Story

Là người dùng, tôi muốn được báo rõ khi câu hỏi hoặc mô hình không hợp lệ để sửa và gửi lại.

## Scope

### In

- `POST /api/generate`, nhận JSON `{ "prompt": string, "modelId": string }`.
- Câu hỏi không chỉ có whitespace, tối đa 10000 Unicode code points theo JSON Schema `maxLength`, không dùng UTF-16 `.length` để kiểm tra giới hạn lần hai. Đây là giới hạn của ứng dụng, không phải giới hạn đã được BTC công bố.
- Model ID khớp chính xác catalog snapshot của BE003, không trim/lowercase ID trong request.
- Từ chối sai kiểu, thiếu field và field dư; không tự chuyển số thành chuỗi hoặc âm thầm xóa field dư.
- Lỗi validation/JSON sai trả 400, `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.
- Request hợp lệ tạm trả 501 + `GENERATION_NOT_IMPLEMENTED`; BE005 sẽ thay hành vi này bằng lời gọi proxy. Không dùng fake answer hoặc 200 để che việc chưa triển khai generation.
- Giữ lỗi HTTP parser khác như unsupported media type/oversized payload đúng status thay vì chuyển mọi lỗi thành 400.
- Catalog ở bước này là snapshot BE003; test truyền fixture qua `buildApp({ models })`, runtime mặc định vẫn có thể rỗng. BE005 sẽ nạp snapshot từ proxy, không hardcode model từ mô tả OpenAPI vào production.
- Giữ `modelId` trong API nội bộ. BE005 chuyển nó thành trường `model` khi gọi `POST /generate` của proxy; BE004 không nhận thêm alias `model` từ client.

### Out

- Proxy, thời gian phản hồi, timeout upstream, streaming, retry và auth người dùng.
- Không nhận array model; một request tương ứng một model. Frontend gửi 2–4 request đồng thời ở giai đoạn sau.
- Không thêm Zod/Ajv trực tiếp hoặc framework lỗi mới: dùng schema/validator có sẵn của Fastify.

Bàn giao cho Gemini 3.8 Flash: đọc `AGENTS.md`, `specs/BE000.md`, BE001–BE003 và code hiện tại trước khi thực thi. Spec này đã có task; không tạo thêm plan/file tài liệu hoặc mở rộng scope. Áp dụng `.agents/skills/karpathy-guidelines/SKILL.md` và skill test/verification khi thực thi. Không sửa file ngoài quyền được cấp; không tự stage/commit/push. Paths tính từ root repository; các lệnh npm backend chạy tại `backend/`.

**Bản đồ thay đổi và các quyết định không cần đoán**

| File                             | Thay đổi BE004                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `backend/src/app.ts`             | Thêm strict Ajv options, error handler và đăng ký generate route với `modelsSnapshot` hiện có |
| `backend/src/routes/generate.ts` | File mới: body type/schema, hai kiểm tra ngữ nghĩa, response tạm 501                          |
| `backend/test/generate.test.ts`  | File mới: inject tests cho validation, parser, snapshot và lỗi; không mở cổng                 |

- Chỉ ba file code/test trên cần thay đổi. Khi được giao triển khai, có thể tick tiêu chí đã chứng minh và thêm kết quả cuối spec này; không sửa BE000/BE005/README/config/package/lockfile hoặc frontend nếu chưa có yêu cầu riêng.
- `buildApp` tiếp tục là hàm đồng bộ; giữ nguyên `BuildAppOptions`, `logger`, health và model routes. `setErrorHandler` hiện chưa có: thêm sau khi tạo Fastify và trước khi đăng ký các route. Gọi `registerGenerateRoutes(app, modelsSnapshot)` cạnh lời gọi `registerModelRoutes` hiện có.
- Import nội bộ dùng đuôi `.js` dù source là `.ts`, đúng NodeNext hiện có. `GenerateBody` và schema ở riêng file generate, chưa cần export chúng, barrel, service, custom validator hoặc plugin `app.register`.
- Giữ parser/body limit mặc định; chấp nhận JSON kể cả `application/json; charset=utf-8`. Không viết parser, content-type hook, CORS, auth hoặc `setNotFoundHandler` mới. Unknown route vẫn dùng body 404 mặc định Fastify; yêu cầu envelope chỉ áp dụng lỗi được error handler xử lý và response route generate.
- Validation mặc định chạy trước route handler: không dùng `attachValidation`, không tự parse JSON hoặc ép kiểu body. `.trim()` chỉ kiểm tra trắng; không gán lại prompt/modelId. Không dùng regex loại bỏ HTML/Markdown hoặc đếm grapheme thay `maxLength`.
- Request có nhiều lỗi: schema/parser được xử lý trước; sau schema, prompt trắng được kiểm tra trước unknown model. Empty string bị schema từ chối với `Invalid request body`, whitespace-only đi qua schema rồi nhận `Prompt must not be blank`.
- Schema chỉ ràng buộc body, không yêu cầu header key/query/auth. Không nhận alias `model`, URL hoặc key trong body. Body thiếu field vẫn sai dù field tương tự có trong query.

## Flow

1. Fastify parse JSON và kiểm tra schema.
2. Handler kiểm tra `prompt.trim().length > 0`, nhưng giữ nguyên prompt hợp lệ cho BE005, không trim nội dung gửi LLM.
3. Handler tìm model ID chính xác trong snapshot dùng cho `/api/models`.
4. Bước nào không hợp lệ: trả 400, không gọi upstream, không echo prompt.
5. Hợp lệ: trả 501 với thông báo generation chưa triển khai. Đây chỉ là trạng thái giữa BE004 và BE005.

## Edge Cases

- Body thiếu, null, array, JSON sai, thiếu field, field dư.
- Số/boolean/object/array thay cho string phải bị từ chối dù có thể stringify.
- Prompt rỗng, space/tab/newline/NBSP: reject. Unicode, Markdown, code block và newline trong prompt có nội dung: accept.
- Tối đa 10000 code points: tiếng Việt và emoji được xử lý theo JSON Schema, không đo byte hoặc code unit.
- ID không tồn tại, khác hoa/thường, có whitespace hai đầu: reject nếu không khớp catalog.
- Catalog rỗng: mọi model ID bị từ chối; health và GET models vẫn dùng được.
- HTTP 415 và 413 được giữ nguyên status; lỗi bất ngờ không làm lộ stack, prompt, token hoặc config.

## Acceptance Criteria

- [x] JSON hợp lệ với model đã biết đi qua validation và trả 501 đúng mã tạm.
- [x] Request sai trả 400 với envelope thống nhất; không lộ prompt hoặc raw parser error.
- [x] Field dư và sai kiểu bị reject, không bị validator tự sửa cho hợp lệ.
- [x] Giới hạn 10000 code points đúng cả BMP và emoji.
- [x] Catalog GET và generate validation dùng cùng snapshot; unknown model bị từ chối.
- [x] Lỗi parser 415/413 không biến thành 400/500; lỗi 500 không có stack/secret.
- [x] Không có network call tới LLM trong feature này; BE001–BE003 không regression.
- [x] Giữ body 404 mặc định Fastify; không đổi contract health/models hoặc sửa cấu hình runtime để phục vụ test. Mọi nhánh lỗi được kiểm tra đúng cả status và toàn bộ envelope.

## Tasks

Thực hiện tuần tự TASK-001 → TASK-006. Test dùng fixture model qua `buildApp({ models })`, không thêm model giả vào runtime catalog. Không cần token thật để chạy inject tests.

### TASK-001 - Request contract và JSON Schema

- [x] **Files:** tạo `backend/src/routes/generate.ts`, `backend/test/generate.test.ts`; sửa `backend/src/app.ts` để đăng ký route.
- [x] Trong `generate.ts`, định nghĩa kiểu body và schema cùng file để không tách abstraction một lần dùng:

```ts
interface GenerateBody {
  prompt: string;
  modelId: string;
}
const bodySchema = {
  type: 'object',
  required: ['prompt', 'modelId'],
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 10000 },
    modelId: { type: 'string', minLength: 1 },
  },
} as const;
```

- [x] Export `registerGenerateRoutes(app: FastifyInstance, models: readonly Model[]): void`, import `Model` từ `../models.js`. Đăng ký `app.post<{ Body: GenerateBody }>('/api/generate', { schema: { body: bodySchema } }, handler)`.
- [x] `app.ts` truyền chính snapshot đã tạo ở BE003 vào helper, không tạo danh sách thứ hai, không lấy catalog từ request client.
- [x] Viết test thiếu `prompt` trước và chạy để thấy chưa có route. Sau đó tạo route tạm trả 501 khi qua schema, assert thiếu field trả 400 và fixture hợp lệ trả 501. Giai đoạn này chỉ assert status; strict type/no-field-removal thuộc TASK-002, envelope thuộc TASK-003. Không yêu cầu sai kiểu bị reject khi Ajv còn coerce mặc định. Chưa cần response schema thành công 200 của BE005.
- [x] **Kiểm tra:** route tồn tại, schema reject field thiếu và request hợp lệ schema đi đến handler. Chưa đánh dấu acceptance toàn feature.

### TASK-002 - Validation nghiêm ngặt và kiểm tra ngữ nghĩa

- [x] **Files:** sửa `backend/src/app.ts`, `backend/src/routes/generate.ts`; bổ sung `backend/test/generate.test.ts`.
- [x] Fastify mặc định có thể coerce type/remove field; cấu hình ngay khi tạo instance, giữ nguyên options logger và các route cũ:

```ts
ajv: {
  customOptions: {
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
  },
}
```

- [x] Viết test `prompt: 123`, `modelId: 123`, field dư và prompt whitespace trước; chạy để thấy các trường hợp chưa bị chặn đúng, sau đó thêm cấu hình/logic.
- [x] Handler chỉ dùng `.trim()` để kiểm tra rỗng. Kiểm tra `models.some(model => model.id === request.body.modelId)`; không normalize ID. Không thêm `enum` động vào schema vì validation từ snapshot trong handler đã đủ.
- [x] Với các nhánh ngữ nghĩa, dùng `return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '...' } })`. Không throw error thường vì sẽ bị xử lý thành 500, không dùng `reply.send` rồi tiếp tục tới nhánh 501.
- [x] Whitespace trả 400 với message `Prompt must not be blank`; ID không biết trả 400 `Unknown modelId`; cả hai dùng code `INVALID_REQUEST`. Không trả nguyên prompt hay danh sách cấu hình trong lỗi.
- [x] **Kiểm tra:** các ca trên trả 400; `prompt: '  Hello\nworld  '` với model đúng vẫn qua validation. Chưa trim/mutate body để dành nội dung chính xác cho BE005.

### TASK-003 - Chuẩn hóa lỗi request và parser

- [x] **Files:** sửa `backend/src/app.ts` tại nơi đăng ký `setErrorHandler`; thêm test vào `backend/test/generate.test.ts`.
- [x] Handler lỗi đặt ở app scope trước các route; không tạo thư viện lỗi chung cho feature nhỏ. Thứ tự nhánh cần rõ:

| Điều kiện                                           | HTTP       | code                     | message                                 |
| --------------------------------------------------- | ---------- | ------------------------ | --------------------------------------- |
| Có `validation`, JSON parse lỗi hoặc body JSON rỗng | 400        | `INVALID_REQUEST`        | `Invalid request body`                  |
| Unsupported content type                            | 415        | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type must be application/json` |
| Payload vượt body limit của Fastify                 | 413        | `PAYLOAD_TOO_LARGE`      | `Request body is too large`             |
| Lỗi HTTP 4xx khác do framework                      | Giữ status | `REQUEST_ERROR`          | `Request could not be processed`        |
| Lỗi không phân loại hoặc 5xx                        | 500        | `INTERNAL_ERROR`         | `Internal server error`                 |

- [x] Với Fastify đã cài, callback `setErrorHandler` mặc định nhận `error: unknown`. Thu hẹp object khác null rồi kiểm tra property bằng `in` và kiểu: `code` string, `statusCode` number, `validation` là array. Không dùng `any`, `@ts-ignore`, ép cả error thành kiểu tùy ý hoặc đọc property trực tiếp trên unknown. Các biến phân loại được tính ngay trong callback, chưa cần helper/type guard file riêng.
- [x] Mã đã đối chiếu package local: `FST_ERR_CTP_INVALID_JSON_BODY`/`FST_ERR_CTP_EMPTY_JSON_BODY` → 400; `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 415; `FST_ERR_CTP_BODY_TOO_LARGE` → 413. Nhánh schema dùng `validation` array. Nhánh HTTP 4xx khác chỉ nhận status nguyên trong [400, 499]; phần còn lại → 500. Không dùng `error.message` để nhận diện hoặc ép mọi statusCode thành validation error.
- [x] Envelope luôn là `{ error: { code, message } }`. Không trả `error.message`, `error.stack`, `validation` nguyên bản hoặc request body ra client. Không log toàn bộ request/config/error object có thể chứa input; nếu cần log chỉ dùng request ID và phân loại lỗi an toàn.
- [x] Viết test malformed JSON bằng `payload: '{'` và header `content-type: application/json`; kiểm tra 400 và message tổng quát. Các lỗi 400 do handler tự trả ở TASK-002 cũng phải cùng envelope.
- [x] **Kiểm tra:** các lỗi schema/parser đều đúng envelope; health, GET models vẫn giữ response cũ. Unknown route vẫn 404, không bị đổi thành 500.

### TASK-004 - Phản hồi tạm cho request hợp lệ

- [x] **Files:** sửa handler `backend/src/routes/generate.ts`; bổ sung test thành công validation.
- [x] Sau schema và semantic checks, trả chính xác HTTP 501:

```json
{
  "error": {
    "code": "GENERATION_NOT_IMPLEMENTED",
    "message": "Text generation is not implemented yet"
  }
}
```

- [x] Dùng `reply.code(501).send(...)` trực tiếp; không throw 501 qua error handler tổng quát vì nó sẽ được sanitize thành 500. Không tạo `fetch`, SDK, sleep, fake answer hoặc success 200.
- [x] Thêm comment ngắn trong handler rằng BE005 thay đoạn này bằng upstream call sau validation. Không viết trước client proxy/interface/service chưa cần dùng.
- [x] **Kiểm tra:** fixture model hợp lệ trả đúng 501/mã/message; invalid input vẫn trả 400 trước khi tới đoạn này.

### TASK-005 - Ma trận kiểm thử request

- [x] **Files:** hoàn thiện `backend/test/generate.test.ts`. Dùng `node:test`, `node:assert/strict`, `app.inject()` và đóng app qua `t.after`.
- [x] Import/pattern theo `backend/test/health.test.ts`. Mỗi test tạo app riêng; đăng ký mọi route phụ trước lần `inject()` đầu tiên vì inject làm app ready. Không thêm route sau ready; không gọi `app.listen`, `server.ts`, load `.env`, mock fetch hoặc sửa `process.env` trong test này.
- [x] Fixture riêng: `[{ id: 'test/model-a', name: 'Model A', provider: 'Test' }]`. Body cơ sở `{ prompt: 'Hello', modelId: 'test/model-a' }`. Đổi từng đầu vào trong bảng để ca thất bại có một nguyên nhân rõ ràng.
- [x] Nhóm shape/type (400): không body, body null/array, thiếu mỗi field, số/boolean/object/array ở mỗi field, trường `extra`, JSON sai, JSON rỗng.
- [x] Cách tạo input inject: object hợp lệ dùng `payload: { ... }`; các JSON top-level null/array/string/number/boolean dùng `payload: JSON.stringify(value)` và header `content-type: application/json`. Không dùng `payload: null` để biểu diễn JSON null. JSON rỗng dùng `payload: ''` + JSON header, body vắng dùng không có `payload`; hai ca này khác nhau. Các field prompt/modelId sai kiểu cần bao gồm cả `null`.
- [x] Bổ sung boundary 9999, 10000, 10001 code points cho ASCII/emoji; tối đa chấp nhận, vượt trả 400. Không gán `Content-Length` thủ công. Payload 10000 emoji vẫn nhỏ hơn body limit mặc định.
- [x] Nhóm prompt (400): `''`, `' \t\n'`, NBSP-only, `'a'.repeat(10001)` và `'😀'.repeat(10001)`. Nhóm hợp lệ (501): `'a'.repeat(10000)`, `'😀'.repeat(10000)`, tiếng Việt, newline, bảng Markdown, code fence và prompt có khoảng trắng hai đầu.
- [x] Nhóm ID (400): không tồn tại, sai hoa/thường, thêm whitespace, catalog rỗng. Nhóm hợp lệ: ID chính xác đi đến 501. Test snapshot: sửa fixture gốc sau `buildApp` không thêm model mới được chấp nhận; GET và POST vẫn nhất quán.
- [x] Snapshot test cụ thể: tạo app với model-a, sau buildApp đổi ID fixture thành model-b và thêm model-c; GET vẫn chỉ model-a; POST model-a → 501, model-b/model-c → 400. Dùng payload mới từng lần để không vô tình sửa fixture hoặc tái sử dụng body đã bị validator thay đổi.
- [x] Nhóm transport: `content-type: application/xml` trả 415; body string dài hơn 1 MiB với JSON content type trả 413 (dùng Fastify default body limit, không thay production limit để test). Test này khác giới hạn prompt 10000 ký tự.
- [x] Ca 413 dùng JSON hợp lệ: stringify object có prompt `'a'.repeat(1024 * 1024 + 1)`, model hợp lệ và JSON header; assert 413/PAYLOAD_TOO_LARGE, không phải 400 do maxLength. Ca charset dùng object hợp lệ và JSON charset header → 501. Thêm ca prompt trắng + unknown model → message prompt trắng; body có field dư `model` → message schema generic.
- [x] Nhóm lỗi bất ngờ: tạo app test riêng, đăng ký route chỉ trong test để throw `Error('test-secret-do-not-log')`, inject và xác nhận 500 generic không chứa chuỗi đó hoặc stack; route test không tồn tại trong source production.
- [x] Test hai hàng còn lại của bảng error handler bằng route chỉ trong test: throw `Object.assign(new Error('sentinel-private'), { statusCode: 409 })` → 409/REQUEST_ERROR; tương tự statusCode 503 → 500/INTERNAL_ERROR. Không thay route generate để gây lỗi và không yêu cầu chuẩn hóa body 404 mặc định.
- [x] Với mọi error response, kiểm tra có đúng `error.code`, `error.message`, không có prompt, stack hoặc config. Ví dụ cú pháp:

```ts
const response = await app.inject({
  method: 'POST',
  url: '/api/generate',
  payload: { prompt: 123, modelId: 'test/model-a' },
});
assert.equal(response.statusCode, 400);
assert.equal(response.json().error.code, 'INVALID_REQUEST');
```

- [x] Ngoài status, dùng `assert.deepEqual(response.json(), { error: { code: ..., message: ... } })` để bắt field dư/raw validation. 501 cũng là một error response cần deep-equal. Kiểm tra không lộ bằng sentinel riêng, không dùng `body.includes(prompt)` khi prompt rỗng/chuỗi ngắn. `logger: false` không chứng minh log production an toàn: không thêm raw log ở handler và không tuyên bố đã capture log nếu chỉ kiểm response.

- [x] **Kiểm tra:** chạy `npm test`; mọi ca có status và assertion cụ thể. Không gọi upstream trong test hoặc source BE004; test không cần token/mạng thật.

### TASK-006 - Kiểm tra toàn bộ và bàn giao cho BE005

- [x] Chạy lần lượt `npm test`, `npm run typecheck`, `npm run build`, xác nhận tất cả exit 0. Báo số test/lệnh thực tế, không tuyên bố đã kiểm thử LLM.
- [x] Từ root chạy `npm run lint`, `npx --no-install prettier --check backend/src/app.ts backend/src/routes/generate.ts backend/test/generate.test.ts specs/BE004-generate-validation.md` và `git diff --check`. Chỉ format các file thuộc scope, không `npm run format`/`lint:fix` toàn repo. Với lỗi có sẵn ngoài scope, báo riêng thay vì sửa lan rộng.
- [x] Dùng terminal với env giả hợp lệ theo BE002 để chạy server nếu cần smoke test. Catalog runtime có thể rỗng, vì vậy manual POST với test model trả 400 là đúng; chỉ inject test mới truyền test catalog để kiểm chứng đường 501. Không thêm fixture production để manual test đẹp hơn.
- [x] Rà không có token, request body log, upstream call, file frontend hoặc sửa đổi không liên quan. Không tự stage/commit/push.
- [x] Bàn giao BE005: route nhận `GenerateBody`, đã validate prompt/model; dùng snapshot `Model[]` của BE003. BE005 phải thay placeholder 501 và cập nhật các test đường hợp lệ; giữ nguyên các test reject input của BE004.
- [x] Đọc [BE005](BE005-ai-proxy-integration.md) trước khi bàn giao: catalog thật lấy từ `/models`; upstream nhận `{ prompt, model }`. Không thêm network client hoặc điểm inject generation trước trong BE004.

Tham khảo chính thức: [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Fastify setErrorHandler](https://fastify.dev/docs/latest/Reference/Server/#seterrorhandler), [Fastify Testing](https://fastify.dev/docs/latest/Guides/Testing/).

### 2026-11-12 - Review khả năng thực thi cho Gemini 3.8 Flash

- Chốt phạm vi ba file code/test; giữ app đồng bộ, imports NodeNext `.js`, parser/body limit mặc định và lifecycle inject.
- Sửa thứ tự test để không đòi strict validation trước TASK-002; phân biệt lỗi schema với lỗi ngữ nghĩa, response trực tiếp với throw.
- Đối chiếu Fastify đã cài bằng probe trong bộ nhớ: body vắng/null → 400 validation, JSON rỗng → EMPTY_JSON_BODY, JSON hỏng → INVALID_JSON_BODY, XML → 415; 10000 emoji qua maxLength. Unknown route vẫn 404 với envelope mặc định của framework, không qua custom error handler.
- Bổ sung cách tạo payload inject, snapshot test cụ thể, nhánh HTTP 4xx/5xx và assertion toàn envelope. Đây là review/spec update, chưa triển khai route hoặc chạy bộ test nghiệm thu BE004.

### 2026-11-12 - Kết quả triển khai BE004

- **Files đã tạo/sửa:** `backend/src/routes/generate.ts`, `backend/src/app.ts`, `backend/test/generate.test.ts` (và cập nhật checklist/kết quả trong `specs/BE004-generate-validation.md`). Không chỉnh sửa BE000/BE005/README/config/package/lockfile hoặc frontend; không stage/commit/push.
- **Triển khai chính:**
  - `backend/src/routes/generate.ts`: đăng ký `POST /api/generate` với `bodySchema` (`required: ['prompt', 'modelId']`, `additionalProperties: false`, `prompt` minLength 1 / maxLength 10000, `modelId` minLength 1), kiểm tra `prompt.trim().length === 0` (`Prompt must not be blank`) trước `models.some((model) => model.id === request.body.modelId)` (`Unknown modelId`), không mutate/trim input và trả 501 `GENERATION_NOT_IMPLEMENTED` làm placeholder cho BE005.
  - `backend/src/app.ts`: cấu hình strict Ajv (`coerceTypes: false`, `removeAdditional: false`, `useDefaults: false`), gắn `setErrorHandler` chuẩn hóa envelope `{ error: { code, message } }` cho lỗi validation/JSON parse/empty JSON (400), 415, 413, framework 4xx (`REQUEST_ERROR`) và lỗi khác/5xx (`INTERNAL_ERROR`), giữ nguyên 404 mặc định, health và models routes.
  - `backend/test/generate.test.ts`: bao phủ kiểm thử shape/kiểu, JSON primitive/null/array/rỗng/hỏng, field dư (`extra`, `model`, `url`, `apiKey`), query fallback, boundary 9999/10000/10001 ASCII & emoji, blank/NBSP/Markdown/Unicode, exact modelId/catalog rỗng/snapshot bất biến, 415/413/charset và error handler 500/409/503/404.
- **Kiểm tra đã chạy sau sửa đổi cuối:**
  - `backend/`: `npm test` (67/67 subtests/cases pass — chưa gồm smoke test HTTP tách riêng), `npm run typecheck` (exit 0), `npm run build` (exit 0).
  - Smoke test `node dist/server.js` với env giả (`PORT=3199`, `LLM_BASE_URL=https://example.invalid`, `LLM_API_KEY=smoke-test-only-key`): `GET /api/health` → 200 `{"status":"ok"}`, `GET /api/models` → 200 `{"models":[]}`, `POST /api/generate` → 400 `{"error":{"code":"INVALID_REQUEST","message":"Unknown modelId"}}`.
  - Root: `npm run lint` (exit 0), `npx --no-install prettier --check backend/src/app.ts backend/src/routes/generate.ts backend/test/generate.test.ts specs/BE004-generate-validation.md` (exit 0), `git diff --check` (exit 0).
- **Giới hạn & bàn giao BE005:** chưa gọi mạng hoặc kiểm thử LLM thật (placeholder 501 theo thiết kế BE004). BE005 sẽ thay nhánh 501 bằng lời gọi upstream proxy `{ prompt, model: modelId }` sau bước validation hiện có và cập nhật các test đường hợp lệ từ 501 sang 200/503.

### 2026-11-12 - Review và kiểm tra lại BE004 (Codex)

- Đối chiếu route, strict Ajv, error handler và inject tests với spec: chưa phát hiện blocker trong source BE004; không sửa code chỉ để thay đổi phong cách. Parser/body limit mặc định, catalog snapshot và response 501 giữ đúng ranh giới BE004/BE005.
- Chạy lại tại backend: `npm test` **67/67 tests pass**, `npm run typecheck` và `npm run build` exit 0. Từ root: `npm run lint`, targeted Prettier và `git diff --check` exit 0. Đây là kết quả chạy lại trong lượt review, không chỉ dẫn lại báo cáo Gemini.
- Sửa trạng thái BE004 trong BE000 và điều kiện phụ thuộc ở đầu BE005 cho khớp source hiện tại. Giữ nguyên các thay đổi đã có trước lượt review; không stage/commit/push.
- Giới hạn: không có log theo từng task để xác minh lại thứ tự red/green khi Gemini triển khai; không xác nhận các checkbox về trình tự chỉ từ test đang xanh. Không chạy lại smoke test HTTP thủ công mà Gemini ghi phía trên; không gọi proxy hoặc LLM thật. Bộ test và startup tests cục bộ không cần key BTC.
- Reviewer độc lập không phát hiện blocker trong phạm vi BE004; probe JSON chứa `__proto__`/`constructor` trả 400 với envelope generic, không lộ nội dung parser. Reviewer không sửa file và không thay thế các lệnh kiểm tra đã chạy ở trên.
