# F003 - Danh sách mô hình

## Goal

Cung cấp danh sách mô hình thống nhất để frontend lựa chọn và F004 kiểm tra model ID. Phụ thuộc F001–F002; không cần gọi LLM để thực hiện feature này.

## User Story

Là người dùng, tôi muốn biết ID, tên và nhà cung cấp của các mô hình được phép dùng để chọn chúng khi so sánh.

## Scope

### In
- `GET /api/models` trả HTTP 200, `{ "models": [...] }`.
- Danh sách cho phép nằm trong backend, được cấu hình tĩnh cho bản tối thiểu. Đây là danh sách hỗ trợ, không phải trạng thái online của nhà cung cấp.
- Mỗi model có ba trường bắt buộc `id`, `name`, `provider`.
- Cùng một snapshot danh sách phục vụ GET và validation ở F004.
- Test dùng danh sách giả truyền qua hàm tạo app; không có endpoint cho client sửa danh sách.

### Out
- Không tự đoán model ID, không thêm endpoint `/models` upstream khi chưa có tài liệu.
- Không tự host/fork proxy, đồng bộ catalog, cache, database, giá hoặc token usage.
- Không kiểm tra đủ 2–4 model ở endpoint này; đây là catalog, không phải một lượt so sánh.

Bàn giao: đọc `AGENTS.md`, `specs/backend-plan.md`, F001–F002. Dùng `.agents/skills/karpathy-guidelines/SKILL.md` và quy trình kiểm chứng của `.agents/skills/verification-before-completion/SKILL.md`. Đường dẫn tính từ root; lệnh npm chạy trong `backend/`. Chỉ sửa file khi đã có quyền triển khai từ người dùng, không tự commit.

## Flow

1. Khi tạo app, lấy catalog mặc định hoặc catalog được truyền vào cho test.
2. Validate và chụp bản sao catalog để request không làm thay đổi danh sách.
3. Đăng ký `GET /api/models` với snapshot đó.
4. Trả JSON chỉ gồm ba trường công khai mỗi model. Ví dụ dưới là minh họa contract, không phải ID thật:

```json
{
  "models": [
    { "id": "test/model-a", "name": "Model A", "provider": "Test provider" }
  ]
}
```

## Edge Cases

- Chưa xác minh model ID: catalog mặc định là `[]`; GET vẫn trả 200 với `{ "models": [] }`.
- ID trùng, field rỗng/whitespace hoặc giá trị không phải string: từ chối catalog khi tạo app, không đợi đến request.
- ID có khoảng trắng hai đầu: từ chối cấu hình, không âm thầm sửa ID; `name`/`provider` cũng không được có khoảng trắng hai đầu.
- Model ID khác hoa/thường là hai ID khác nhau; không lowercase hoặc đổi tên ID từ nhà cung cấp.
- Thay đổi mảng/objects đầu vào sau khi tạo app không thay đổi snapshot đang phục vụ.
- Proxy không hoạt động không khiến GET catalog gọi mạng hoặc thất bại.

## Acceptance Criteria

- [x] Response là `{ models: Model[] }`, mỗi phần tử chỉ có `id`, `name`, `provider`.
- [x] ID duy nhất, tất cả field là chuỗi không rỗng và đã trim đúng trong cấu hình.
- [x] Danh sách rỗng được xử lý bình thường; không phát hành test model như model thật.
- [x] GET catalog không gọi upstream và không tiết lộ key/base URL.
- [x] F004 có thể sử dụng cùng snapshot để kiểm tra model ID.
- [ ] API và test có thể hoàn thành trước, nhưng chỉ xác nhận catalog thật khi ID/cách chọn model đã được ban tổ chức xác minh.

## Tasks

Thứ tự: TASK-001 là xác minh nguồn; nếu bị chặn, ghi nhận và vẫn làm TASK-002–004 với catalog mặc định rỗng, fixture chỉ trong test. TASK-005 phải ghi rõ nghiệm thu dữ liệu thật còn chờ; không đánh dấu toàn bộ feature tích hợp hoàn tất.

### TASK-001 - Xác minh nguồn model ID

- [x] **Nguồn cần đọc:** đề `https://codex.so/llm-compare`, README `https://github.com/slaveeks/ai-proxy`, Swagger `https://llm.codex.so/docs`.
- [x] Bối cảnh đã xác minh ngày 08/11/2026: repo công khai lấy `MODEL` từ env server; `/generate` chỉ khai báo `prompt`. Chưa có contract được xác nhận để client chọn model hay lấy catalog. Không coi `openai/gpt-5-mini` trong env mẫu là danh sách được token người dùng cấp quyền.
- [x] Xác minh với thông tin ban tổ chức cung cấp: base URL, cách gửi model ID, danh sách model được cấp quyền, tên/provider. Chỉ soạn câu hỏi trong chat nếu thiếu; không tự gửi tin cho người khác, không yêu cầu commit token.
- [x] **Đầu ra:** danh sách ID được xác nhận hoặc báo rõ `blocked: awaiting model contract`. Không cần tạo tài liệu mới chỉ để ghi kết quả; báo trong bàn giao. TASK-002 tiếp tục được dù chưa có dữ liệu thật.

### TASK-002 - Kiểu Model và catalog có kiểm tra

- [x] **Files:** tạo `backend/src/models.ts`, `backend/test/models.test.ts`.
- [x] Export contract dùng nguyên tên cho F004:

```ts
export interface Model {
  id: string;
  name: string;
  provider: string;
}
export const configuredModels: readonly Model[] = [];
export function validateModels(models: readonly Model[]): void;
```

- [x] `configuredModels` giữ rỗng nếu TASK-001 chưa có kết quả; chỉ điền model thật được xác nhận, không test model trong runtime mặc định.
- [x] Viết test cho catalog rỗng/hợp lệ trước, ID trùng và từng field rỗng/sai kiểu/whitespace phải throw. Với dữ liệu sai kiểu trong test, có thể cast qua `unknown` để kiểm tra runtime, không làm yếu interface production.
- [x] Triển khai validation một vòng lặp và `Set<string>` cho ID. Chỉ so sánh chuỗi chính xác. Throw lỗi cấu hình có tên field/loại lỗi, không log env/token hoặc dump cả object.
- [x] **Kiểm tra:** `npm test` pass các ca catalog sau khi triển khai; không gọi upstream.

### TASK-003 - Snapshot và route GET

- [x] **Files:** sửa `backend/src/app.ts`, tạo `backend/src/routes/models.ts`; cập nhật `backend/test/models.test.ts`.
- [x] Mở rộng contract F001, giữ `logger` và hành vi app cũ:

```ts
// app.ts: import type Model từ './models.js'
export interface BuildAppOptions {
  logger?: boolean;
  models?: readonly Model[];
}
// routes/models.ts
export function registerModelRoutes(
  app: FastifyInstance,
  models: readonly Model[],
): void;
```

- [x] Trong `buildApp`, dùng `options.models ?? configuredModels`; validate trước khi tạo Fastify instance để không tạo handle khi config sai. Tạo snapshot bằng `.map(({ id, name, provider }) => ({ id, name, provider }))`. Giữ snapshot là biến cục bộ, không mutable global registry. F004 sẽ dùng cùng biến này.
- [x] Route helper đăng ký trực tiếp `app.get('/api/models', ...)`; gọi helper từ `buildApp`. Không cần plugin framework hoặc service class.
- [x] Thêm response schema 200: object bắt buộc `models`, array items là object với ba string field bắt buộc, `additionalProperties: false` cho outer và item. Chỉ trả metadata công khai; không expose toàn bộ config.
- [x] Test inject dùng `{ models: [{ id: 'test/model-a', name: 'Model A', provider: 'Test' }] }`, không sửa catalog production để test pass.
- [x] **Kiểm tra:** GET trả deep-equal fixture công khai, đúng JSON content type; F001 health vẫn pass.

### TASK-004 - Test trường hợp biên và tính độc lập

- [x] **Files:** hoàn thiện `backend/test/models.test.ts`.
- [x] Test catalog rỗng trả 200 + `models: []`; input trùng hoặc sai metadata khiến `buildApp` throw trước listen.
- [x] Test snapshot: tạo app từ fixture, gọi `app.ready()`, sửa `fixture[0].name` và thêm phần tử; GET vẫn trả bản ban đầu. Không sửa fixture trong khi app chưa được tạo snapshot.
- [x] Test app mặc định khi chưa xác nhận catalog trả `[]`; khi catalog thật được cấu hình sau này, thay assertion bằng danh sách đã xác nhận, không tiếp tục ép test mặc định rỗng.
- [x] Mỗi app đều có `t.after(() => app.close())`. Kiểm tra body không có `llmApiKey`, `LLM_API_KEY`, base URL hoặc trường nội bộ.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck` đều exit 0; không cần key thật.

### TASK-005 - Đối chiếu dữ liệu và bàn giao

- [x] Chạy `npm test`, `npm run typecheck`, `npm run build` tại `backend/`.
- [x] Khi startup đã cấu hình đúng theo F002, gọi `curl.exe -i http://127.0.0.1:3000/api/models` (hoặc port đã chọn); so sánh với catalog cấu hình.
- [x] Nếu TASK-001 còn chờ, báo rõ: route/test hoàn thành, catalog thật chưa nghiệm thu; không tạo endpoint upstream giả để bỏ qua blocker. Không dùng key giả để tuyên bố model hoạt động.
- [x] Bàn giao model contract cho F004: `Model`, `configuredModels`, `validateModels`, `BuildAppOptions.models` và snapshot cục bộ trong `buildApp`. Không tự mở rộng sang generation.
