# BE004 - Kiểm tra yêu cầu sinh câu trả lời

## Goal

Chấp nhận request có câu hỏi hợp lệ và model ID nằm trong catalog trước khi triển khai gọi proxy ở BE005. Phụ thuộc BE001–BE003. BE004 không sinh văn bản và không tiêu hao hạn mức API.

## User Story

Là người dùng, tôi muốn được báo rõ khi câu hỏi hoặc mô hình không hợp lệ để sửa và gửi lại.

## Scope

### In

- `POST /api/generate`, nhận JSON `{ "prompt": string, "modelId": string }`.
- Câu hỏi không chỉ có whitespace, tối đa 10000 Unicode code points theo JSON Schema `maxLength`, không dùng UTF-16 `.length` để kiểm tra giới hạn lần hai.
- Model ID khớp chính xác catalog snapshot của BE003, không trim/lowercase ID trong request.
- Từ chối sai kiểu, thiếu field và field dư; không tự chuyển số thành chuỗi hoặc âm thầm xóa field dư.
- Lỗi validation/JSON sai trả 400, `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.
- Request hợp lệ tạm trả 501 + `GENERATION_NOT_IMPLEMENTED`; BE005 sẽ thay hành vi này bằng lời gọi proxy. Không dùng fake answer hoặc 200 để che việc chưa triển khai generation.
- Giữ lỗi HTTP parser khác như unsupported media type/oversized payload đúng status thay vì chuyển mọi lỗi thành 400.

### Out

- Proxy, thời gian phản hồi, timeout upstream, streaming, retry và auth người dùng.
- Không nhận array model; một request tương ứng một model. Frontend gửi 2–4 request đồng thời ở giai đoạn sau.
- Không thêm Zod/Ajv trực tiếp hoặc framework lỗi mới: dùng schema/validator có sẵn của Fastify.

Bàn giao cho Gemini: đọc `AGENTS.md`, `specs/BE000.md` và BE001–BE003. Dùng `.agents/skills/writing-plans/SKILL.md` để giữ task rõ ràng, `.agents/skills/karpathy-guidelines/SKILL.md` để tránh mở rộng scope và skill test/verification khi thực thi. Không sửa file ngoài quyền được cấp; không tự commit. Paths tính từ root repository, npm chạy tại `backend/`.

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

- [ ] JSON hợp lệ với model đã biết đi qua validation và trả 501 đúng mã tạm.
- [ ] Request sai trả 400 với envelope thống nhất; không lộ prompt hoặc raw parser error.
- [ ] Field dư và sai kiểu bị reject, không bị validator tự sửa cho hợp lệ.
- [ ] Giới hạn 10000 code points đúng cả BMP và emoji.
- [ ] Catalog GET và generate validation dùng cùng snapshot; unknown model bị từ chối.
- [ ] Lỗi parser 415/413 không biến thành 400/500; lỗi 500 không có stack/secret.
- [ ] Không có network call tới LLM trong feature này; BE001–BE003 không regression.

## Tasks

Thực hiện tuần tự TASK-001 → TASK-006. Test dùng fixture model qua `buildApp({ models })`, không thêm model giả vào runtime catalog. Không cần token thật để chạy inject tests.

### TASK-001 - Request contract và JSON Schema

- [ ] **Files:** tạo `backend/src/routes/generate.ts`, `backend/test/generate.test.ts`; sửa `backend/src/app.ts` để đăng ký route.
- [ ] Trong `generate.ts`, định nghĩa kiểu body và schema cùng file để không tách abstraction một lần dùng:

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

- [ ] Export `registerGenerateRoutes(app: FastifyInstance, models: readonly Model[]): void`, import `Model` từ `../models.js`. Đăng ký `app.post<{ Body: GenerateBody }>('/api/generate', { schema: { body: bodySchema } }, handler)`.
- [ ] `app.ts` truyền chính snapshot đã tạo ở BE003 vào helper, không tạo danh sách thứ hai, không lấy catalog từ request client.
- [ ] Viết test thiếu `prompt`/sai `modelId` type trước, chạy thấy route chưa đáp ứng. Tạo route ban đầu trả 501 khi qua schema; TASK-002 và TASK-003 sẽ làm validation đầy đủ. Chưa cần response schema thành công 200 của BE005.
- [ ] **Kiểm tra:** route tồn tại, schema reject field thiếu và request hợp lệ schema đi đến handler. Chưa đánh dấu acceptance toàn feature.

### TASK-002 - Validation nghiêm ngặt và kiểm tra ngữ nghĩa

- [ ] **Files:** sửa `backend/src/app.ts`, `backend/src/routes/generate.ts`; bổ sung `backend/test/generate.test.ts`.
- [ ] Fastify mặc định có thể coerce type/remove field; cấu hình ngay khi tạo instance, giữ nguyên options logger và các route cũ:

```ts
ajv: {
  customOptions: {
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
  },
}
```

- [ ] Viết test `prompt: 123`, `modelId: 123`, field dư và prompt whitespace trước; chạy để thấy các trường hợp chưa bị chặn đúng, sau đó thêm cấu hình/logic.
- [ ] Handler chỉ dùng `.trim()` để kiểm tra rỗng. Kiểm tra `models.some(model => model.id === request.body.modelId)`; không normalize ID. Không thêm `enum` động vào schema vì validation từ snapshot trong handler đã đủ.
- [ ] Whitespace trả 400 với message `Prompt must not be blank`; ID không biết trả 400 `Unknown modelId`; cả hai dùng code `INVALID_REQUEST`. Không trả nguyên prompt hay danh sách cấu hình trong lỗi.
- [ ] **Kiểm tra:** các ca trên trả 400; `prompt: '  Hello\nworld  '` với model đúng vẫn qua validation. Chưa trim/mutate body để dành nội dung chính xác cho BE005.

### TASK-003 - Chuẩn hóa lỗi request và parser

- [ ] **Files:** sửa `backend/src/app.ts` tại nơi đăng ký `setErrorHandler`; thêm test vào `backend/test/generate.test.ts`.
- [ ] Handler lỗi đặt ở app scope trước các route; không tạo thư viện lỗi chung cho feature nhỏ. Thứ tự nhánh cần rõ:

| Điều kiện                                           | HTTP       | code                     | message                                 |
| --------------------------------------------------- | ---------- | ------------------------ | --------------------------------------- |
| Có `validation`, JSON parse lỗi hoặc body JSON rỗng | 400        | `INVALID_REQUEST`        | `Invalid request body`                  |
| Unsupported content type                            | 415        | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type must be application/json` |
| Payload vượt body limit của Fastify                 | 413        | `PAYLOAD_TOO_LARGE`      | `Request body is too large`             |
| Lỗi HTTP 4xx khác do framework                      | Giữ status | `REQUEST_ERROR`          | `Request could not be processed`        |
| Lỗi không phân loại hoặc 5xx                        | 500        | `INTERNAL_ERROR`         | `Internal server error`                 |

- [ ] Dùng `error.validation`, `error.statusCode`, `error.code` sau khi thu hẹp kiểu an toàn; kiểm tra parser codes của Fastify 5 trong package đã cài (`FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`). Không ép mọi error có statusCode thành validation error.
- [ ] Envelope luôn là `{ error: { code, message } }`. Không trả `error.message`, `error.stack`, `validation` nguyên bản hoặc request body ra client. Không log toàn bộ request/config/error object có thể chứa input; nếu cần log chỉ dùng request ID và phân loại lỗi an toàn.
- [ ] Viết test malformed JSON bằng `payload: '{'` và header `content-type: application/json`; kiểm tra 400 và message tổng quát. Các lỗi 400 do handler tự trả ở TASK-002 cũng phải cùng envelope.
- [ ] **Kiểm tra:** các lỗi schema/parser đều đúng envelope; health, GET models vẫn giữ response cũ. Unknown route vẫn 404, không bị đổi thành 500.

### TASK-004 - Phản hồi tạm cho request hợp lệ

- [ ] **Files:** sửa handler `backend/src/routes/generate.ts`; bổ sung test thành công validation.
- [ ] Sau schema và semantic checks, trả chính xác HTTP 501:

```json
{
  "error": {
    "code": "GENERATION_NOT_IMPLEMENTED",
    "message": "Text generation is not implemented yet"
  }
}
```

- [ ] Dùng `reply.code(501).send(...)` trực tiếp; không throw 501 qua error handler tổng quát vì nó sẽ được sanitize thành 500. Không tạo `fetch`, SDK, sleep, fake answer hoặc success 200.
- [ ] Thêm comment ngắn trong handler rằng BE005 thay đoạn này bằng upstream call sau validation. Không viết trước client proxy/interface/service chưa cần dùng.
- [ ] **Kiểm tra:** fixture model hợp lệ trả đúng 501/mã/message; invalid input vẫn trả 400 trước khi tới đoạn này.

### TASK-005 - Ma trận kiểm thử request

- [ ] **Files:** hoàn thiện `backend/test/generate.test.ts`. Dùng `node:test`, `node:assert/strict`, `app.inject()` và đóng app qua `t.after`.
- [ ] Fixture riêng: `[{ id: 'test/model-a', name: 'Model A', provider: 'Test' }]`. Body cơ sở `{ prompt: 'Hello', modelId: 'test/model-a' }`. Đổi từng đầu vào trong bảng để ca thất bại có một nguyên nhân rõ ràng.
- [ ] Nhóm shape/type (400): không body, body null/array, thiếu mỗi field, số/boolean/object/array ở mỗi field, trường `extra`, JSON sai, JSON rỗng.
- [ ] Nhóm prompt (400): `''`, `' \t\n'`, NBSP-only, `'a'.repeat(10001)` và `'😀'.repeat(10001)`. Nhóm hợp lệ (501): `'a'.repeat(10000)`, `'😀'.repeat(10000)`, tiếng Việt, newline, bảng Markdown, code fence và prompt có khoảng trắng hai đầu.
- [ ] Nhóm ID (400): không tồn tại, sai hoa/thường, thêm whitespace, catalog rỗng. Nhóm hợp lệ: ID chính xác đi đến 501. Test snapshot: sửa fixture gốc sau `buildApp` không thêm model mới được chấp nhận; GET và POST vẫn nhất quán.
- [ ] Nhóm transport: `content-type: application/xml` trả 415; body string dài hơn 1 MiB với JSON content type trả 413 (dùng Fastify default body limit, không thay production limit để test). Test này khác giới hạn prompt 10000 ký tự.
- [ ] Nhóm lỗi bất ngờ: tạo app test riêng, đăng ký route chỉ trong test để throw `Error('test-secret-do-not-log')`, inject và xác nhận 500 generic không chứa chuỗi đó hoặc stack; route test không tồn tại trong source production.
- [ ] Với mọi error response, kiểm tra có đúng `error.code`, `error.message`, không có prompt, stack hoặc config. Ví dụ cú pháp:

```ts
const response = await app.inject({
  method: 'POST',
  url: '/api/generate',
  payload: { prompt: 123, modelId: 'test/model-a' },
});
assert.equal(response.statusCode, 400);
assert.equal(response.json().error.code, 'INVALID_REQUEST');
```

- [ ] **Kiểm tra:** chạy `npm test`; mọi ca có status và assertion cụ thể. Không gọi upstream trong test hoặc source BE004; test không cần token/mạng thật.

### TASK-006 - Kiểm tra toàn bộ và bàn giao cho BE005

- [ ] Chạy lần lượt `npm test`, `npm run typecheck`, `npm run build`, xác nhận tất cả exit 0. Báo số test/lệnh thực tế, không tuyên bố đã kiểm thử LLM.
- [ ] Dùng terminal với env giả hợp lệ theo BE002 để chạy server nếu cần smoke test. Catalog runtime có thể rỗng, vì vậy manual POST với test model trả 400 là đúng; chỉ inject test mới truyền test catalog để kiểm chứng đường 501. Không thêm fixture production để manual test đẹp hơn.
- [ ] Rà không có token, request body log, upstream call, file frontend hoặc sửa đổi không liên quan. Không tự stage/commit/push.
- [ ] Bàn giao BE005: route nhận `GenerateBody`, đã validate prompt/model; dùng snapshot `Model[]` của BE003. BE005 phải thay placeholder 501 và cập nhật các test đường hợp lệ; giữ nguyên các test reject input của BE004.

Tham khảo chính thức: [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Fastify setErrorHandler](https://fastify.dev/docs/latest/Reference/Server/#seterrorhandler), [Fastify Testing](https://fastify.dev/docs/latest/Guides/Testing/).
