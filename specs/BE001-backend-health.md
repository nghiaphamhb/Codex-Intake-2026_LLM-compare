# BE001 - Khởi chạy backend và health check

## Goal

Thiết lập backend Node.js + Fastify + TypeScript có thể chạy, build và kiểm tra trạng thái. Đây là feature đầu tiên; chưa có mã backend là trạng thái xuất phát dự kiến.

## User Story

Là người phát triển, tôi muốn chạy backend và gọi health endpoint để xác nhận server hoạt động trước khi thêm chức năng LLM.

## Scope

### In

- Backend nằm trong `backend/`, frontend sẽ nằm trong `frontend/`. Một repository, chưa dùng npm workspace.
- Chọn Node.js 24.x, npm, Fastify 5.x, TypeScript 5.9.x và tsx 4.x. Ghi phiên bản cụ thể đã cài trong lockfile; không dùng beta.
- ESM, TypeScript strict; runtime production chạy JavaScript đã build.
- `GET /api/health` trả HTTP 200, JSON `{ "status": "ok" }`.
- Script dev/build/start/typecheck/test; test bằng `node:test`, `node:assert/strict`, `Fastify.inject()`.
- Phân tách tạo app và mở cổng để test không cần mở cổng thật.

### Out

- Proxy, token, database, Docker, CORS và hosting.
- Kiểm tra sức khỏe upstream. Health chỉ xác nhận tiến trình backend có thể phục vụ HTTP.
- Không viết frontend; không tự commit, push hoặc sửa file ngoài phạm vi đã được người dùng cho phép.

Hướng dẫn bàn giao: đọc `AGENTS.md` và `specs/BE000.md` trước. Spec này là tài liệu thực thi, không tự cấp quyền sửa file: người triển khai vẫn cần được người dùng cho phép. Dùng `.agents/skills/writing-plans/SKILL.md`, `.agents/skills/karpathy-guidelines/SKILL.md` và skill test/verification khi triển khai. Giữ cấu trúc F000 theo yêu cầu người dùng, không đổi sang template mặc định của skill. Không cần hỏi lại các quyết định đã ghi ở đây. Khi thiếu quyền hoặc prerequisite, báo đúng phần thiếu, không tự đoán.

## Flow

1. Người phát triển chạy script từ `backend/`.
2. Server tạo app và mở cổng 3000 trên `127.0.0.1`.
3. Client gọi `/api/health` và nhận JSON 200.
4. Khi có lỗi mở cổng, server báo lỗi và tiến trình kết thúc với mã khác 0.

## Edge Cases

- Cổng bị chiếm: không log thông báo khởi động thành công; kết thúc khác 0.
- Route không tồn tại trả 404, không bị health route bắt nhầm.
- Import `app.ts` không tự listen hoặc đọc cấu hình/token.
- Import ESM phải tiếp tục hoạt động sau khi build; import tương đối trong TS dùng đuôi `.js`.
- Test đóng app sau mỗi ca, tránh giữ handle làm treo test runner.

## Acceptance Criteria

- [x] `npm run dev` khởi động được server; `npm run build` rồi `npm start` cũng chạy được.
- [x] Health trả 200 với đúng JSON, content type JSON; route khác trả 404.
- [x] Test dùng inject, không phụ thuộc mạng, token hay `.env`.
- [x] Typecheck kiểm tra cả source và test; production build chỉ xuất source.
- [x] Lỗi khởi động kết thúc khác 0; không có thay đổi frontend hoặc gọi LLM.

## Tasks

Thực hiện TASK-001 → TASK-005. Mọi lệnh npm bên dưới chạy tại `backend/` trừ khi ghi khác. Với logic có hành vi kiểm chứng được: viết test, chạy để thấy thất bại do thiếu hành vi, rồi triển khai tối thiểu và chạy lại. Không xem lỗi thiếu package là bằng chứng test hành vi đúng.

### TASK-001 - Khởi tạo package và công cụ

- [x] **Files:** tạo `backend/package.json`, `backend/package-lock.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`.
- [x] Kiểm tra `node --version`, `npm --version`; yêu cầu Node 24.x. Nếu runtime không có, báo prerequisite, không âm thầm đổi stack hay cài toàn máy.
- [x] Khởi tạo package private, đặt `"type": "module"`, `"engines": { "node": ">=24 <25" }`. Cài runtime `npm install fastify@5`; dev tools `npm install -D typescript@~5.9.0 tsx@4 @types/node@24`. Không thêm thư viện test, DI hoặc ORM.
- [x] Đặt scripts sau trong package; test files ở trực tiếp `test/` để glob này bao phủ toàn bộ:

```json
{
  "dev": "tsx watch src/server.ts",
  "build": "tsc -p tsconfig.build.json",
  "start": "node dist/server.js",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "node --import tsx --test test/*.test.ts"
}
```

- [x] Base tsconfig: `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `types: ["node"]`, `skipLibCheck: true`, `include: ["src/**/*.ts", "test/**/*.ts"]`. Build config extends base; `rootDir: "src"`, `outDir: "dist"`, `include: ["src/**/*.ts"]`, `exclude: ["test", "dist", "node_modules"]`. Không đặt `noEmit: true` trong base vì build kế thừa nó.
- [x] **Kiểm tra:** `npm ls --depth=0` thành công, có lockfile và đúng các dependency đã chọn. Chưa chạy test glob khi chưa có test file.

### TASK-002 - Tạo app độc lập với tiến trình server

- [x] **Files:** tạo `backend/src/app.ts`, bắt đầu `backend/test/health.test.ts`.
- [x] Export contract dùng cho các feature sau:

```ts
import type { FastifyInstance } from 'fastify';
export interface BuildAppOptions {
  logger?: boolean;
}
export function buildApp(options: BuildAppOptions = {}): FastifyInstance;
```

- [x] Viết test import `buildApp`, tạo hai app với `{ logger: false }`, kiểm tra chúng là hai instance riêng và đóng bằng `t.after(() => app.close())`. Chạy `npm test`; xác nhận lỗi do contract chưa được triển khai.
- [x] Tạo Fastify instance với logger mặc định tắt; server production sẽ truyền `true`. Không gọi `listen`, không import `server.ts`, không đọc env trong `app.ts`.
- [x] **Kiểm tra:** test tạo/đóng app thành công. `npm run typecheck` không có lỗi.

### TASK-003 - Health endpoint

- [x] **Files:** sửa `backend/src/app.ts`, bổ sung `backend/test/health.test.ts`.
- [x] Viết test trước với cú pháp sau; thêm test `/api/unknown` trả 404:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('GET /api/health returns ok', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
});
```

- [x] Chạy test để thấy health đang 404; đăng ký route GET chính xác `/api/health`, trả object thay vì JSON string. Chưa cần file route riêng cho một endpoint đơn giản.
- [x] **Kiểm tra:** `npm test` pass cả health và unknown route.

### TASK-004 - Entry point mở cổng

- [x] **Files:** tạo `backend/src/server.ts`.
- [x] Import `buildApp` từ `./app.js`, tạo app với logger bật; `await app.listen({ port: 3000, host: '127.0.0.1' })` trong luồng khởi động có catch. BE002 sẽ thay port bằng cấu hình env.
- [x] Khi listen thất bại, ghi lỗi khởi động, đóng app nếu cần rồi đặt `process.exitCode = 1`; không để server tiếp tục như đã khởi động. Chưa có secret nên chưa cần log config; không thêm log request body.
- [x] **Kiểm tra:** chạy `npm run dev`, tại terminal khác gọi `curl.exe -i http://127.0.0.1:3000/api/health` trên Windows (`curl -i ...` trên hệ khác). Mong đợi 200 và JSON ok. Dừng server bằng Ctrl+C sau kiểm tra.

### TASK-005 - Kiểm tra bàn giao

- [x] Chạy lần lượt `npm test`, `npm run typecheck`, `npm run build`; tất cả exit 0. Xác nhận có `dist/server.js`, không có test trong output build.
- [x] Chạy `npm start`, gọi health; mở thêm một tiến trình `npm start` khi tiến trình đầu đang chiếm cổng: tiến trình thứ hai phải thất bại khác 0. Dừng các tiến trình kiểm tra do mình tạo.
- [x] Rà `git status --short`, không stage/commit tự động, không xóa file người dùng. Báo các file đã thay đổi, lệnh đã chạy và lỗi còn lại. Không đánh dấu checkbox khi chưa có bằng chứng.

Tham khảo chính thức: [Fastify Testing](https://fastify.dev/docs/latest/Guides/Testing/), [TypeScript module NodeNext](https://www.typescriptlang.org/docs/handbook/modules/reference.html).
