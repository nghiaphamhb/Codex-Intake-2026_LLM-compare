# BE002 - Cấu hình môi trường

## Goal

Đọc cấu hình tập trung, dừng sớm khi cấu hình sai và giữ token ở backend. Phụ thuộc BE001 đã hoàn thành; không thay đổi stack hoặc scripts đang hoạt động nếu không cần.

## User Story

Là người vận hành, tôi muốn cấu hình backend qua biến môi trường để đổi môi trường chạy mà không sửa mã nguồn.

## Scope

### In

- `PORT`: mặc định 3000; số nguyên 1–65535.
- `LLM_BASE_URL`: bắt buộc, URL tuyệt đối HTTP/HTTPS, không chứa username/password, query hoặc fragment. Cho phép path prefix; không tự gắn `/v1` hoặc đoán contract.
- `LLM_API_KEY`: bắt buộc, chuỗi không rỗng; loại khoảng trắng hai đầu; không xuất ra log/response.
- `LLM_TIMEOUT_MS`: mặc định 60000; số nguyên dương tối đa 2147483647 để phù hợp timer Node.
- `.env` cục bộ là tùy chọn; biến môi trường đã có được ưu tiên.
- Cấu hình mẫu và Git ignore secret/artifact. Không thêm dependency chỉ để đọc `.env` vì Node 24 đã hỗ trợ.

### Out

- Không gọi proxy để xác thực token hoặc health check; không tự lấy/refresh token.
- Không secret manager, không config class/service, không database.
- Không tạo hoặc ghi đè `.env` thật của người dùng; chỉ tạo `.env.example` với placeholder.

Bàn giao cho Gemini: đọc `AGENTS.md`, `specs/BE000.md`, `specs/BE001-backend-health.md`. Thực thi task tuần tự với quyền sửa file được người dùng cấp; giữ cách tiếp cận tối thiểu theo `.agents/skills/karpathy-guidelines/SKILL.md`. Các đường dẫn dưới đây tính từ root repository; các lệnh npm chạy trong `backend/`. Không tự commit hoặc sửa scope.

## Flow

1. `server.ts` thử nạp `.env` ở working directory `backend/` nếu file tồn tại.
2. Đọc `process.env`, kiểm tra cấu hình và áp dụng mặc định cho biến tùy chọn.
3. Cấu hình hợp lệ: tạo app và listen với port đã đọc.
4. Thiếu/sai cấu hình: thông báo tên biến, không có giá trị secret; kết thúc khác 0 trước khi listen.

## Edge Cases

- Không có `.env` nhưng env hệ thống đầy đủ: chạy được.
- `.env` có tồn tại nhưng không đọc được: dừng với lỗi tổng quát, không in nội dung file.
- Biến tùy chọn không có: dùng mặc định; có nhưng rỗng: lỗi, không lặng lẽ dùng mặc định.
- Reject số âm, 0, số thập phân, `1e3`, `12abc`, vượt ngưỡng; không dùng `parseInt` làm validation duy nhất.
- URL không hợp lệ hoặc giao thức `file:`, `ftp:`: reject. Không ép HTTP thành HTTPS.
- Import `app.ts` và test inject không cần key; chỉ entry point thực mới yêu cầu cấu hình đầy đủ.

## Acceptance Criteria

- [x] Startup với config hợp lệ dùng đúng port, base URL, key và timeout.
- [x] Config thiếu/sai báo đúng tên biến và exit khác 0 trước khi listen.
- [x] Cả source và JavaScript build dùng cùng logic config.
- [x] `.env` không bắt buộc khi đã có env, env sẵn có không bị ghi đè bởi file.
- [x] Token không xuất hiện trong lỗi, log hoặc Git; test không dùng token thật.
- [x] Test của BE001 vẫn chạy mà không cần cấu hình LLM.

## Tasks

### TASK-001 - Hàm đọc và validate cấu hình

- [x] **Files:** tạo `backend/src/config.ts`, `backend/test/config.test.ts`.
- [x] Export contract:

```ts
export interface AppConfig {
  port: number;
  llmBaseUrl: string;
  llmApiKey: string;
  llmTimeoutMs: number;
}
export function readConfig(env: NodeJS.ProcessEnv): AppConfig;
```

- [x] Hàm thuần: chỉ đọc argument, không gọi mạng, không tự đọc file, không log, không mutate `process.env`. Throw `Error` với message ví dụ `Invalid configuration: LLM_API_KEY`; không nối giá trị đã nhập vào message.
- [x] Viết test trước: `readConfig({ LLM_BASE_URL: 'https://example.test', LLM_API_KEY: 'test-only-key' })` trả port 3000, timeout 60000, URL đã xác thực và key tương ứng. Thiếu key hoặc URL phải throw chứa tên biến. Chạy `npm test` để chứng minh hành vi chưa có.
- [x] Dùng `new URL()` để kiểm tra URL. Với số: trim, regex `/^\d+$/`, chuyển `Number`, kiểm tra integer/range. Phân biệt `undefined` với chuỗi rỗng. Trim base URL/key; giữ path prefix URL, loại slash cuối nếu có và ghi nhất quán trong test. Chưa ghép endpoint upstream.
- [x] **Kiểm tra:** test hàm thuần pass, `npm run typecheck` pass.

### TASK-002 - Nạp env ở entry point

- [x] **Files:** sửa `backend/src/server.ts`; không làm `app.ts` phụ thuộc env.
- [x] Import `existsSync` từ `node:fs`, `loadEnvFile` từ `node:process`, `readConfig` từ `./config.js`. Trong startup try/catch, nếu `existsSync('.env')` thì gọi `loadEnvFile('.env')`; sau đó `readConfig(process.env)` trước `buildApp`/`listen`.
- [x] Sử dụng `config.port` khi listen; vẫn giữ host `127.0.0.1` từ BE001. Key/base URL/timeout được đọc nhưng chưa gọi upstream hoặc truyền ra client; BE005 sẽ sử dụng chúng.
- [x] Catch lỗi config chỉ báo tên biến từ error an toàn; lỗi nạp file dùng thông báo tổng quát `Unable to load environment configuration`. Không `console.log(process.env)`, không log object config hay toàn bộ exception của thư viện đọc env.
- [x] **Kiểm tra:** test BE001 không cần key vẫn pass. Chạy tiến trình với env hợp lệ kiểm tra port; với env thiếu key, xác nhận dừng trước khi phục vụ health. Nếu máy đã có `.env` thật, không sửa/xóa file đó để tạo tình huống thiếu key; dùng tiến trình con với cwd tạm và env giả.

### TASK-003 - Cấu hình mẫu và Git ignore

- [x] **Files:** tạo `backend/.env.example`; tạo hoặc sửa `.gitignore` root chỉ bằng cách thêm quy tắc còn thiếu, giữ nguyên nội dung cũ.
- [x] Nội dung mẫu:

```dotenv
PORT=3000
# Placeholder: thay bang URL duoc ban to chuc xac nhan.
LLM_BASE_URL=https://example.invalid
LLM_API_KEY=replace-with-your-key
LLM_TIMEOUT_MS=60000
```

- [x] `.gitignore` có quy tắc `node_modules/`, `backend/dist/`, `.env`, `.env.*`, `!.env.example`. Không ignore lockfile hoặc toàn bộ `specs/`/`.agents/`.
- [x] **Kiểm tra từ root:** `git check-ignore backend/.env backend/.env.local backend/dist/server.js backend/node_modules/example` phải liệt kê cả bốn đường dẫn. `git check-ignore backend/.env.example` phải không có output (exit 1 là mong đợi cho lệnh kiểm tra này). Không cần tạo `.env` để dùng `git check-ignore`.

### TASK-004 - Ma trận kiểm thử cấu hình

- [x] **Files:** bổ sung `backend/test/config.test.ts`. Dùng object env riêng cho mỗi test thay vì thay đổi env toàn tiến trình.
- [x] Kiểm tra defaults, override hợp lệ, whitespace trim, optional rỗng, missing/blank required, URL sai protocol/credentials/query/hash, URL có path prefix và số ngoài giới hạn.
- [x] Test port 1/65535 hợp lệ, 0/65536 sai; timeout 1/2147483647 hợp lệ, 0/2147483648 sai; `1.5`, `1e3`, `abc` sai. Dùng bảng dữ liệu và `assert.throws`, không tạo framework validation riêng.
- [x] Dùng secret giả `test-secret-do-not-log`; lỗi config không được chứa nó hoặc URL đầu vào có credentials. Kiểm tra cấu trúc `AppConfig` không chứa các biến env khác.
- [x] **Kiểm tra:** `npm test`, `npm run typecheck` đều exit 0.

### TASK-005 - Kiểm chứng startup và bàn giao

- [x] **Files:** tạo `backend/test/startup.test.ts` cho hành vi entry point, nếu các ca chưa có trong test hiện tại.
- [x] Test tiến trình con dùng absolute loader vì cwd tạm không có `node_modules`: lấy `tsxLoaderUrl = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href` (import từ `node:url`, `node:module`), rồi `spawn(process.execPath, ['--import', tsxLoaderUrl, absoluteServerPath], { cwd: temporaryDirectory, env: sanitizedTestEnv })`. Truyền absolute server path; bỏ các biến `LLM_*`/`PORT` thật trước khi đặt giá trị giả. Đặt thời hạn chờ và dọn tiến trình/thư mục tạm do test tạo, không đụng thư mục người dùng.
- [x] Ca thiếu config: exit khác 0 và stderr không có key giả. Ca `.env` tùy chọn: dùng cwd tạm và file giả để kiểm tra nạp file; env truyền vào phải thắng giá trị trong file. Không gọi LLM.
- [x] Với ca startup hợp lệ, chọn port còn trống thay vì phụ thuộc port 3000 trên máy; chờ health trong thời hạn hữu hạn, capture cả stdout/stderr và kiểm tra chúng không chứa key giả. Dừng/đợi child process trong `finally` để test runner không bị treo.
- [x] Chạy `npm test`, `npm run typecheck`, `npm run build`. Chạy thử `npm start` với env giả hợp lệ và kiểm tra health; key giả chỉ để kiểm tra startup, không chứng minh tích hợp thật.
- [x] Báo lệnh/kết quả, file thay đổi và trạng thái dependency. Không tự commit. Kiểm tra key không được log ở startup hoặc trả qua health.

Tham khảo: [Node process.loadEnvFile](https://nodejs.org/docs/latest-v24.x/api/process.html#processloadenvfilepath), [Node URL](https://nodejs.org/docs/latest-v24.x/api/url.html).
