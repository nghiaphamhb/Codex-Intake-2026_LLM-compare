# BE007 - Chi phí ước tính cho từng câu trả lời

## Goal

Backend tính chi phí chuẩn ước tính từ pricing/usage BTC và trả `costUsd` cho FE007. Không gửi số token lên giao diện, không gọi giá bên ngoài proxy và không đổi luồng generation/Retry đã nghiệm thu.

**Trạng thái:** đã triển khai và kiểm tra local ngày 2026-11-14; chưa nghiệm thu live metadata/chi phí. Pattern: [F000](F000-pattern.md). Agent triển khai và chỉnh sửa sau này: **Codex (agent hiện tại)**. Turn soạn spec chỉ tạo tài liệu, không cho phép tự chạy code/live. Đọc AGENTS.md, BE005/BE006, FE006, spec này và source trước khi thực thi; không tạo plan/file kiến trúc khác. Giữ native fetch/Fastify, không thêm dependency.

## User Story

Là người so sánh model, tôi muốn thấy chi phí ước tính của từng câu trả lời cạnh thời gian phản hồi, đúng thiết kế, để cân nhắc kết quả và chi phí mà không cần xem số token.

## Scope

### In

- Nạp pricing tại startup cùng snapshot catalog; giữ usage nội bộ cho lần generation; tính cost tại route bằng pricing đúng model của snapshot.
- Mở rộng success API bằng đúng một trường bắt buộc `costUsd: number | null`. Giá trị USD, chưa làm tròn; null là không đủ metadata hợp lệ. Zero là giá trị thật, không đồng nghĩa thiếu dữ liệu.
- Test local/stub, cập nhật smoke CLI exact contract cho response bốn field và giữ output CLI hiện có.
- Metadata thiếu/sai không làm mất câu trả lời text hợp lệ; không đổi timeout/error mapping hoặc tự retry.

### Out

- Không sửa frontend/modal; FE007 làm phần hiển thị. Không trả usage/token/pricing/raw response trong API công khai hoặc log chúng.
- Không tổng chi phí hội thoại, hóa đơn/quota còn lại, currency conversion, streaming/Stop/reasoning hoặc persistence.
- Không SDK/Redis/database, bảng giá hardcode/provider pricing fetch, background refresh, thay key/env hoặc tự live-test.

### Nguồn và giới hạn tính toán

Đối chiếu 2026-11-14: [BTC README tại 6bfb63d](https://github.com/codex-team/ai-proxy/blob/6bfb63d3bbd03bc9477244ab2c2d372690e064df/README.md), [generate source](https://github.com/codex-team/ai-proxy/blob/6bfb63d3bbd03bc9477244ab2c2d372690e064df/src/routes/generate.js), [OpenAPI live](https://llm.codex.so/docs/json). Repo dùng AI SDK ^5.0.93 và trả totalUsage. [Tài liệu SDK v5](https://ai-sdk.dev/v5/docs/reference/ai-sdk-core/generate-text) tách input/output/total/reasoning/cache; không suy ra cách tính từ phiên bản SDK mới hơn.

Pricing là USD/triệu token chuẩn. Công thức trong spec là **ước tính cơ bản theo input/output báo cáo**, không cố mô phỏng hóa đơn provider: chưa điều chỉnh cache read/write, vùng, priority/flex, long-context hay reasoning tính phí khác. Không cam kết upper/lower bound. FE007 phải giải thích phạm vi ước tính qua tooltip/accessibility mà không thêm dòng token. Nếu muốn tính giá provider chính xác cần spec khác với bằng chứng về billing semantics.

### Contract và quyết định đã chốt

```ts
// backend/src/models.ts
export interface ModelPricing {
  input: number;
  output: number;
}
// Bổ sung vào Model hiện tại:
// pricing?: ModelPricing

// backend/src/aiProxy.ts
export interface GenerateUsage {
  inputTokens: number;
  outputTokens: number;
}
// GenerateResult giữ text, durationMs và thêm usage?: GenerateUsage

// backend/src/cost.ts — mới, pure function
export function estimateCostUsd(
  pricing: ModelPricing | undefined,
  usage: GenerateUsage | undefined,
): number | null;
```

- `parseCatalog`: id/name/provider vẫn validation BE005. Nếu pricing là own object có input/output là number hữu hạn >=0 thì giữ đúng hai field; nếu thiếu/null/array/sai một trong hai thì bỏ toàn bộ pricing của model đó. Không loại model hoặc fail startup chỉ vì metadata giá. Không coerce numeric strings. Cache fields/field dư bỏ qua, không để field dư sai kiểu phá hai giá hợp lệ.
- `parseGenerateResponse` hiện trả string: đổi thành `{ text: string; usage?: GenerateUsage }`. Text vẫn bắt buộc string, empty hợp lệ; text/JSON sai vẫn lỗi BE005. Chỉ giữ usage nếu own object có inputTokens/outputTokens là safe integer >=0; thiếu hoặc một field sai → bỏ usage. totalTokens/reasoningTokens/cachedInputTokens không dùng, không cộng thêm và không suy ngược input/output từ total. Unknown fields bỏ qua.
- Client `generate` trả `{ text, durationMs, ...(usage hợp lệ) }`. Thời gian vẫn bao headers/body/parse; không có HTTP request bổ sung để tính cost.
- Snapshot `buildApp` phải clone pricing sâu một cấp, không mất pricing do destructuring hiện tại và không giữ reference mutable của caller. `validateModels` vẫn hỗ trợ fixture cũ không pricing; khi caller truyền pricing, validate object/input/output hữu hạn >=0; báo lỗi cấu hình an toàn nếu sai. Không validate số bằng truthiness vì giá0 hợp lệ.
- `GET /api/models` **giữ nguyên** `{ models: [{ id, name, provider }] }`. ModelPricing chỉ backend dùng; route map rõ ba field, không dựa tình cờ serializer strip field để giữ kín contract. Không gửi bảng giá/token lên frontend hoặc sửa schema models.
- `estimateCostUsd`: thiếu pricing/usage → null; guard runtime số không hợp lệ, âm, NaN/Infinity, token không safe integer → null. Tính `inputTokens * (input / 1_000_000) + outputTokens * (output / 1_000_000)`; kết quả hữu hạn >=0 mới trả number. Không round/format, không dùng text length, không cộng total/reasoning/cache một lần nữa. Không gọi fetch/log/mutate trong helper.
- Generate route lấy model đúng ID từ snapshot sau validation, gọi client như hiện tại, trả object explicit bốn field `{ modelId, text, durationMs, costUsd }`. Không spread result; schema200 required đủ bốn, costUsd type number hoặc null, number minimum0, additionalProperties false. Response lỗi giữ envelope/status hiện có, không gắn cost vào lỗi.
- Retry là request mới, cost chỉ cho response lần đó; không cộng cost lần lỗi/lần trước. Không tìm metadata bằng model name hoặc fallback default model.

Ví dụ API mới (USD, không phải label UI):

```json
{ "modelId": "test/model", "text": "OK", "durationMs": 1800, "costUsd": 0.0016 }
```

Dữ liệu thiếu: cùng response với `costUsd: null`. `usage` không xuất hiện. FE006 cũ vẫn hoạt động do bỏ qua field dư; FE007 xử lý costUsd.

### File scope khi được giao triển khai

| File                                                                    | Trách nhiệm                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `backend/src/models.ts`, `backend/test/models.test.ts`                  | Type/validation pricing và tests                                                      |
| `backend/src/aiProxy.ts`, `backend/test/aiProxy.test.ts`                | Parse metadata, giữ contract text/lỗi/deadline                                        |
| `backend/src/cost.ts`, `backend/test/cost.test.ts` — mới                | Helper tính estimate và bảng test                                                     |
| `backend/src/app.ts`                                                    | Clone pricing trong snapshot                                                          |
| `backend/src/routes/models.ts`                                          | Explicit public projection ba field                                                   |
| `backend/src/routes/generate.ts`, `backend/test/generate.test.ts`       | costUsd + schema200; error/input regression                                           |
| `backend/test/proxyIntegration.test.ts`, `backend/test/startup.test.ts` | Chỉ cập nhật expected success và thêm regression snapshot/pricing qua startup nếu cần |
| `backend/scripts/smoke-proxy.ts`, `backend/test/smokeProxy.test.ts`     | Exact keys mới; validate costUsd/null, giữ output CLI không giá/token                 |
| `README.md`, `specs/BE000.md`, spec này                                 | Contract, giới hạn estimate, trạng thái/kết quả thực tế                               |

Không sửa frontend, `.env*`, package/lockfile/config/server.ts hoặc lịch sử BE005/BE006. Không tạo module tiền tệ, settings hoặc price registry dự phòng. Ngoài bảng: nêu lỗi tái hiện và xin mở rộng phạm vi trước sửa. Không stage/commit/push.

## Flow

1. Startup lấy catalog một lần; normalize pricing nếu đủ hợp lệ, clone snapshot cho validation/cost.
2. FE gửi prompt/modelId như cũ; validate trước generation, không thay model.
3. Client parse text và usage; metadata thiếu không làm text thành lỗi.
4. Route tính cost bằng đúng pricing model/usage lần gọi; trả bốn field. Giá được giữ theo snapshot đến restart, không GET lại mỗi request.
5. FE007 định dạng thời gian/chi phí; backend không biết locale hoặc layout.

## Edge Cases

- Pricing/usage vắng, null, string, array, thiếu field; giá0/token0 hợp lệ; negative, NaN/Infinity, token fraction/unsafe integer → unavailable metadata/costnull.
- Giá khác nhau cho hai model cùng name; snapshot không đổi khi caller mutate nested pricing sau buildApp.
- totalTokens không bằng input+output, reasoning/cache khác0: chỉ input/output dùng một lần theo công thức chuẩn cơ bản; không tự suy phí/cache discount.
- Câu trả lời rỗng vẫn success, cost tính nếu có metadata. HTTP lỗi/timeout giữ mã hiện tại, không dựng cost0.
- Metadata malformed không che lỗi text malformed. Lỗi pricing không làm fail toàn catalog, lỗi id/name vẫn fail như BE005.
- Smoke CLI đang kiểm tra exact keys ba field; phải cập nhật cùng BE007, không nới thành chấp nhận mọi key, không thay output/log bằng raw result.

## Acceptance Criteria

- [x] API generation success đúng bốn field; models API giữ ba field mỗi item, không token/pricing/log secret.
- [x] Metadata normalize đúng policy thiếu/sai/zero; text/error/deadline/validation BE005 giữ nguyên.
- [x] Cost pure, USD chưa round, null khác0; theo đúng model snapshot, không double-count hoặc tự pricing fetch.
- [x] Snapshot nested pricing độc lập mutation; một model thiếu giá không làm model khác mất cost.
- [x] Song song/Retry độc lập; đúng cost cho từng model/lần gọi, không batch/auto retry.
- [x] Smoke CLI nhận contract mới, vẫn một generation tối đa và output an toàn như BE006.
- [x] Suite backend, typecheck/build/lint, targeted format/diff đạt; báo cáo số thực tế, không live trừ khi được cho phép riêng.

## Tasks

Thứ tự TASK-001→004. Viết test fail trước code; test local bằng node:test/Fastify inject/HTTP stub hiện có. Không ghi kết quả giả vào checklist, không lấy số test lịch sử làm kết quả mới.

### TASK-001 — Metadata/snapshot

- [x] Thêm test client/model cho pricing/usage valid/0/partial/null/array/string/numeric string/negative/fraction/unsafe, field dư (cache/total/reasoning) không ảnh hưởng core. Phân biệt metadata sai với text/id sai.
- [x] Implement types/parse/validateModels/snapshot theo quyết định trên. Test mutate pricing nguồn sau buildApp không đổi cost; GET models deep-equal ba field không pricing.
- [x] Chạy client/model tests + typecheck. Chỉ thay expected GenerateResult nếu thực sự có usage, fixture cũ không metadata vẫn hợp lệ.

### TASK-002 — Cost và route

- [x] cost tests: pricing input0.25/output2, tokens input1000/output500 →0.00125; input1000/output675 →0.0016; cả token0 →0; missing metadata →null; giá0 →0; giá rất lớn dẫn kết quả không hữu hạn →null. So sánh float bằng tolerance nhỏ, không ép giá trị nhị phân phải equal literal.
- [x] Test no mutation; giá/count sai runtime →null. Implement helper theo công thức đã chốt.
- [x] Inject route tests cost/null/zero, response exact bốn field, không token/usage/default/pricing. Hai model cùng name khác ID/giá không lẫn. Input sai không gọi dependency; giữ tất cả error codes/parser/Unicode của BE004/BE005.
- [x] Implement route/schema/projection; không sửa lỗi production ngoài phạm vi. Chạy route/integration tests và typecheck.

### TASK-003 — Smoke và toàn luồng local

- [x] Update smoke exact-key expected mới. Cost sai kiểu/âm/nonfinite hoặc thiếu field → SMOKE_API_CONTRACT_FAILED; null/0/float hợp lệ. Giữ không echo cost/text/usage/key/prompt trong output CLI.
- [x] Fault hook regression field dư của BE006 vẫn phải fail; model/source fixtures không có metadata trả costnull. Test startup snapshot metadata qua stub không cần BTC.
- [x] Integration2/3/4 request với pricing riêng và response usage khác nhau, timeout/lỗi một model không làm mất cost model tốt; Retry thay response của đúng lần gọi. Không GET pricing lặp lại.

### TASK-004 — Verification/bàn giao

- [x] Backend npm test, npm run typecheck, npm run build; root npm run lint, targeted Prettier và git diff --check. Dist chỉ src; không scripts/test.
- [x] README/BE000 mô tả cost ước tính cơ bản, không token UI/quota/billing chính xác; ghi snapshot và chế độ null. Giữ lịch sử cũ, chỉ sửa trạng thái hiện hành.
- [x] Ghi số tests/exit codes thật và giới hạn. Live không bắt buộc: không gọi lại key/model thật chỉ để so giá, không đo quota hoặc cố gây429. Bàn giao FE007 contract số/null cùng ví dụ0/0.0016; không format ở backend.

### 2026-11-14 — Kết quả triển khai Codex

- Client normalize riêng pricing/usage, bỏ metadata thiếu/sai mà giữ model/text hợp lệ; giữ số0 và không cộng total/reasoning/cache. Thêm helper pure estimateCostUsd, clone nested pricing khi buildApp.
- Generate trả đúng bốn field với costUsd number/null; models API explicit projection id/name/provider. Smoke kiểm tra exact contract mới nhưng output CLI không có giá/token/text/key.
- Đã chạy test helper/route fail trước implementation (chưa có module cost); sau triển khai kiểm tra công thức, snapshot mutation, hai model cùng name, metadata matrix, zero/overflow, overlap2/3/4 qua HTTP client thật và smoke missing/negative/string/zero/float cost.
- Kết quả cuối: backend **198/198 tests/subtests pass**, typecheck/build exit0; root lint đạt, targeted Prettier đạt sau sửa format integration test, git diff --check đạt. Dist chỉ production src (có cost.js), không scripts/test.
- Reviewer độc lập không phát hiện blocker về normalize/snapshot/formula/public contract/smoke. Reviewer không thay thế kết quả test thực tế.
- README và BE000 đã cập nhật contract/giới hạn; không sửa frontend/modal, package/lockfile hoặc .env. Chưa chạy generation live; phép tính là ước tính chuẩn, không invoice/quota. FE007 chưa triển khai. Không stage/commit/push.

### 2026-11-14 — Hoàn tất checklist khi tích hợp FE007

- Tick các task local đã triển khai/kiểm tra; không có nghiệm thu live mới.
- Bổ sung smoke fault raw JSON costUsd:1e309 (không dùng JSON.stringify Infinity thànhnull), chứng minh CLI reject nonfinite. Startup child process nhận pricing/usage thật từ loopback stub, trả cost xấp xỉ0.0016, giữ public catalog ba field và snapshot giá sau khi upstream thay đổi.
- Full backend chạy lại **200/200 tests/subtests pass**, typecheck exit0; targeted format/diff đạt. Một lượt test startup chạy đồng thời ban đầu vượt deadline7s trên máy chậm; chạy isolated và fullsuite cuối đều đạt, không nới timeout hoặc thay source để che lỗi.
- Không gọi BTC/model thật. Các checkbox thể hiện hoàn tất code/local/bàn giao, không thay bằng chứng hóa đơn/giá thực thu.
