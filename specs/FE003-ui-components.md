# FE003 - Component UI cơ bản cho LLM Compare

**Trạng thái:** SPEC được người dùng duyệt. File này là tài liệu bàn giao cho Gemini; việc tạo SPEC không đánh dấu component đã được triển khai.

## Goal

Xây bộ component React có thể tái sử dụng để ghép màn hình LLM Compare ở bước 4. Component phải bám thiết kế Figma, có giao diện props rõ ràng và được kiểm thử hành vi độc lập.

Giữ nền hiện có: React, TypeScript strict, Vite, CSS Modules, font cục bộ và SVG gốc.

## User Story

Là người dùng, tôi muốn đọc câu trả lời của từng model, xem code, sao chép nội dung, mở phần suy nghĩ, nhập câu hỏi và thao tác gửi/dừng/thử lại bằng các điều khiển nhất quán.

Là người phát triển, tôi muốn ghép các component này thành màn hình so sánh mà không phải viết lại style và hành vi cơ bản.

## Scope

### In

- Component dùng chung: `Button`, `IconButton`, `TextInput`.
- Component so sánh: `ModelHeader`, `QuestionBubble`, `AnswerContent`, `CodeBlock`, `ThoughtStatus`, `AnswerStatus`, `AnswerError`, `PromptForm`.
- Trang xem mẫu thể hiện đầy đủ biến thể.
- Kiểm thử hành vi bằng Vitest và React Testing Library.
- Cập nhật hướng dẫn chạy và kiểm tra frontend.
- Giữ nguyên hai file giấy phép font `.txt` hiện có trong `frontend/public/assets/fonts/`. Giữ font và các file giấy phép trong bản build.

### Out

- Màn hình desktop/mobile hoàn chỉnh, sticky header và đồng bộ cột.
- Model picker, gọi API, streaming, timeout, lưu lịch sử và chia sẻ cuộc so sánh.
- Quản lý state toàn ứng dụng; không thêm Redux, router hoặc backend service.
- Storybook, framework UI, thư viện icon thay thế SVG Figma.
- Thay đổi backend, nâng cấp các dependency hiện có không liên quan.
- Tự commit, push hoặc chỉnh sửa file ngoài phạm vi được phép.

### Quy ước bàn giao Gemini

- Đọc `AGENTS.md`, `specs/frontend-plan.md` và spec này trước khi triển khai.
- Làm tuần tự TASK-001 → TASK-008. Viết test hành vi trước phần logic tương ứng.
- Các đường dẫn dưới đây tính từ `frontend/`, trừ khi ghi khác.
- Chỉ có `.gitignore` ở root repository.
- Khi PowerShell trong sandbox lỗi `CryptUnprotectData`, dùng cơ chế chạy ngoài sandbox theo quyền công cụ.
- Giữ nguyên các thay đổi có sẵn của người dùng; không tự stage/commit.
- Nếu không đọc được Figma, báo rõ phần đối chiếu bị chặn; không tự suy diễn rồi tuyên bố khớp thiết kế.
- Áp dụng hướng dẫn writing-plans, karpathy-guidelines, test-driven-development và verification-before-completion trong `.agents/skills/` khi thực thi, trong phạm vi quyền được người dùng cấp.

## Flow

1. Mở trang xem mẫu để xem component ở trạng thái mặc định, disabled và các trạng thái câu trả lời.
2. Component hiển thị dữ liệu nhận từ props; không tự lấy dữ liệu từ API.
3. Người dùng thao tác:
   - Copy: component ghi clipboard và thông báo kết quả.
   - Mở suy nghĩ: component đổi trạng thái mở/đóng cục bộ.
   - Xóa model, Retry, gửi hoặc dừng: component gọi callback do bên ngoài truyền vào.
4. Trang xem mẫu dùng state cục bộ để chứng minh callback hoạt động; không mô phỏng cuộc hội thoại hay tiến trình sinh nội dung.
5. Chạy kiểm thử, typecheck, build và đối chiếu trực quan trước khi bàn giao bước 4.

## Edge Cases

- Tên model, provider, câu hỏi hoặc URL dài không làm tràn trang.
- Bảng và code rộng cuộn trong vùng riêng.
- Clipboard thiếu API, bị từ chối hoặc trả promise lỗi: không báo Copy thành công.
- Nội dung code giữ nguyên whitespace và newline khi sao chép.
- Markdown chứa HTML hoặc URL nguy hiểm không được thực thi.
- Markdown chưa hoàn chỉnh vẫn hiển thị được, không gây crash.
- Prompt rỗng hoặc chỉ whitespace không được gửi.
- Enter trong quá trình tổ hợp IME không gửi câu hỏi.
- Khi đang busy, Enter không gửi thêm; nút dừng vẫn hoạt động.
- Callback không tự xóa dữ liệu trong component; bên cha quyết định cập nhật props.
- Nội dung suy nghĩ rỗng không tạo nút mở một vùng trống.
- Tắt chuyển động theo `prefers-reduced-motion`.

## Acceptance Criteria

- [x] Các component được export riêng, có props TypeScript, không phụ thuộc trang xem mẫu.
- [x] Dùng token, font và SVG hiện có; không tham chiếu URL asset Figma tạm thời.
- [x] Có đủ biến thể và tương tác quy định bên dưới.
- [x] Keyboard focus rõ; nút chỉ có icon có tên truy cập; input có label.
- [x] Copy, mở/đóng, Retry, xóa model và gửi/dừng có test hành vi.
- [x] Markdown có đoạn văn, danh sách, bảng, inline code và code block; không thực thi HTML.
- [x] Không tràn ngang trang ở viewport 390px; bảng/code tự cuộn.
- [x] Có bằng chứng đối chiếu trực quan với Figma; nếu chưa làm được phải ghi trạng thái chưa xác minh.
- [x] `npm test`, `npm run typecheck`, `npm run build` đều exit 0.
- [x] Bản build có font và các file giấy phép `.txt` hiện có.
- [x] Không thay đổi backend hoặc triển khai các luồng thuộc bước 4–7.

## Tasks

### TASK-001 - Chuẩn bị kiểm thử và bản đồ thiết kế

**Files:** sửa `package.json`, `package-lock.json`, `vite.config.ts`; tạo `src/test/setup.ts`.

- [x] Thêm dev dependencies: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`.
- [x] Giữ phiên bản React/Vite/TypeScript hiện có. Chọn bản stable tương thích Node 24 và peer dependencies hiện tại, ghi phiên bản thực tế vào lockfile; không dùng `--force` hoặc `--legacy-peer-deps`.
- [x] Thêm script `test: "vitest run"` và `test:watch: "vitest"`.
- [x] Cấu hình Vitest trong config hiện có: `environment: "jsdom"`, setup file, `globals: false`, `clearMocks: true`, `restoreMocks: true`.
- [x] Setup import matcher Vitest của jest-dom và đăng ký `cleanup` trong `afterEach`.
- [x] Đối chiếu Figma:
  - File `tUMuB5lsAJ9gBPuQ6bJIQB`.
  - Component kit `2608:2201`.
  - Kết quả desktop `2609:2229`.
  - Đang sinh câu trả lời `2610:2439`.
  - Mobile `2611:2452`.
  - [Mở tab thiết kế](https://www.figma.com/design/tUMuB5lsAJ9gBPuQ6bJIQB/LOCAL-DRAFT--Copy-?node-id=1805-1587).
- [x] Giữ font Inter 14px/22px cho nội dung, JetBrains Mono 12px cho code; lấy padding và kích thước từ component tương ứng.
- [x] Với hover/disabled chưa được Figma quy định: mặc định hover giảm opacity xuống `0.85`, disabled `0.4`, giữ focus ring hiện có.

**Kiểm tra:** test của TASK-002 chạy được trong jsdom; không đưa test setup vào entrypoint production.

### TASK-002 - Điều khiển dùng chung

**Files:** `src/components/ui/`, mỗi component có `.tsx`, `.module.css`; test hành vi đặt cạnh component.

**Interfaces:**

- `Button`: kế thừa props native button; thêm `variant?: "primary" | "secondary"`, mặc định secondary.
- `IconButton`: kế thừa props native button; bắt buộc `label: string` và `iconSrc: string`.
- `TextInput`: kế thừa props native input, bỏ `type`; bắt buộc `label: string`; dùng input type text.

- [x] Button/IconButton mặc định `type="button"`; cho phép ghi đè bằng `type="submit"`.
- [x] Nút disabled dùng thuộc tính native, không gọi callback.
- [x] IconButton dùng `aria-label`, ảnh bên trong `alt=""`; giữ kích thước gốc SVG.
- [x] TextInput tạo liên kết label/input bằng `useId`; label được ẩn trực quan, placeholder không thay thế label.
- [x] Chỉ tạo class CSS ẩn trực quan dùng chung khi bắt đầu cần nó.

**Tests:** click và bàn phím gọi callback; disabled không gọi; button mặc định không submit form; input tìm được qua label và cập nhật giá trị.

### TASK-003 - ModelHeader và QuestionBubble

**Files:** `ModelHeader.tsx`, `QuestionBubble.tsx`, CSS Module tương ứng và test đặt cạnh trong `src/features/compare/components/`.

**Interfaces:**

```ts
type ModelHeaderProps = {
  name: string;
  provider: string;
  onRemove?: () => void;
};

type QuestionBubbleProps = {
  text: string;
};
```

- [x] ModelHeader hiển thị tên/provider theo Figma; chỉ hiển thị nút xóa khi có `onRemove`.
- [x] Nút xóa có label tiếng Nga chứa tên model.
- [x] QuestionBubble hiển thị plain text, bảo toàn xuống dòng, ngắt được chuỗi dài; không render Markdown.
- [x] Component không ấn định chiều rộng màn hình hoặc tự đặt sticky.
- [x] Tên model/provider dài được truncate bằng ellipsis, giữ giá trị đầy đủ trong `title`.

**Tests:** render đúng nội dung, xóa gọi callback một lần, không callback thì không có nút xóa, câu hỏi chứa HTML chỉ hiển thị như text.

### TASK-004 - CodeBlock và AnswerContent

**Files:** `CodeBlock.tsx`, `AnswerContent.tsx`, CSS Module tương ứng và test đặt cạnh trong `src/features/compare/components/`; sửa dependency và lockfile.

**Dependencies runtime:** `react-markdown`, `remark-gfm`, `prism-react-renderer`.

**Interfaces:**

```ts
type CodeBlockProps = {
  code: string;
  language?: string;
};

type AnswerContentProps = {
  markdown: string;
};
```

- [x] CodeBlock có header ngôn ngữ và Copy; thiếu language hiển thị `text`.
- [x] Highlight cho `js/javascript`, `ts/typescript`, `json`; language khác hiển thị plain text, không tự đoán.
- [x] Dùng token class và CSS Module để áp màu; không thêm editor hoặc tải grammar từ mạng.
- [x] Copy gọi `navigator.clipboard.writeText(code)`; trạng thái:
  - Đang chờ promise: khóa nút để tránh thao tác lặp.
  - Thành công: hiện `Скопировано`.
  - Thất bại hoặc thiếu API: hiện `Не удалось скопировать`, cho phép thử lại.
- [x] Phản hồi dùng `aria-live="polite"`, giữ đến lần Copy tiếp theo hoặc khi `code` thay đổi; không thêm timer.
- [x] AnswerContent dùng react-markdown + remark-gfm; bật `skipHtml`, giữ cơ chế lọc URL mặc định.
- [x] Render code block qua CodeBlock; inline code vẫn ở trong dòng. Adapter `pre` đọc chuỗi code trước highlight; không trim nội dung.
- [x] Bảng có wrapper cuộn ngang, giữ cấu trúc table semantic.
- [x] Không render ảnh Markdown trong bước này; hiển thị alt text nếu có.
- [x] Link mở cùng tab; không dùng `dangerouslySetInnerHTML`.

**Tests:** Copy chính xác code với newline/whitespace; clipboard resolve/reject/không tồn tại; thay code xóa thông báo cũ; bảng, danh sách, inline code, code có/không ngôn ngữ; HTML và `javascript:` không được thực thi.

**Tham khảo:** [react-markdown](https://github.com/remarkjs/react-markdown), [Prism React Renderer](https://github.com/FormidableLabs/prism-react-renderer).

### TASK-005 - Trạng thái suy nghĩ, tiến trình và lỗi

**Files:** `ThoughtStatus.tsx`, `AnswerStatus.tsx`, `AnswerError.tsx`, CSS Module tương ứng và test đặt cạnh trong `src/features/compare/components/`.

**Interfaces:**

```ts
type ThoughtStatusProps = {
  state: "thinking" | "done";
  text?: string;
  durationSeconds?: number;
};

type AnswerStatusProps = {
  state: "waiting" | "generating";
};

type AnswerErrorProps = {
  message: string;
  description?: string;
  onRetry: () => void;
  retryDisabled?: boolean;
};
```

- [x] ThoughtStatus ban đầu đóng; dùng button với `aria-expanded`, `aria-controls` và ID riêng cho từng instance.
- [x] Chỉ có nút mở khi `text` có nội dung; nội dung dùng plain text, giữ xuống dòng.
- [x] Nhãn thinking là `Думает…`; done là `Думала {n} с`, thiếu thời gian dùng `Готово`. Đây là quy ước rút gọn, chưa làm pluralization.
- [x] Khi props chuyển thinking → done, giữ trạng thái mở/đóng của người dùng; không tự mở.
- [x] AnswerStatus waiting có skeleton và `Ждём ответ…`; generating hiện `Печатает…`.
- [x] AnswerError dùng icon cảnh báo và Button secondary `Повторить`; không tự gọi retry hoặc tạo timer.
- [x] Dùng vùng status phù hợp; không đưa toàn bộ nội dung câu trả lời vào live region.

**Tests:** thao tác bàn phím mở/đóng, nhiều instance không trùng ID, nội dung rỗng không có toggle, đổi state giữ trạng thái mở, Retry/disabled gọi đúng callback.

### TASK-006 - PromptForm

**Files:** `PromptForm.tsx`, `PromptForm.module.css`, `PromptForm.test.tsx` trong `src/features/compare/components/`.

**Interface:**

```ts
type PromptFormProps = {
  value: string;
  onValueChange: (value: string) => void;
  busy: boolean;
  onSend: (prompt: string) => void;
  onStop: () => void;
};
```

- [x] Dùng form và textarea controlled; placeholder theo Figma: `Задайте вопрос всем моделям`.
- [x] Khi không busy: nút Send submit; disabled nếu `value.trim()` rỗng.
- [x] `onSend` nhận nguyên `value`, không trim, không tự xóa input.
- [x] Enter không Shift và không IME gửi câu hỏi; Shift+Enter xuống dòng.
- [x] Theo dõi composition start/end và `isComposing`; keyCode 229 cũng không kích hoạt gửi.
- [x] Khi busy: textarea vẫn sửa được, Enter không gửi, nút đổi sang Stop với `type="button"`.
- [x] Stop chỉ gọi `onStop`; không tự thay đổi busy hoặc value.
- [x] Textarea tăng chiều cao theo nội dung tới 160px rồi cuộn nội bộ; giữ dòng và nút không chồng nhau.

**Tests:** submit hợp lệ; whitespace không gửi; dữ liệu gửi giữ khoảng trắng; Shift+Enter/IME không gửi; busy không gửi; Stop gọi callback; input chỉ đổi thông qua callback của cha.

### TASK-007 - Trang xem mẫu và đối chiếu hình ảnh

**Files:** mở rộng `src/app/App.tsx` và CSS Module hiện có; đặt dữ liệu mẫu trong `src/features/compare/fixtures.ts`.

- [x] Giữ phần xem token/font/icon; bổ sung nhóm component theo thứ tự TASK-002 → TASK-006.
- [x] Có mẫu default/disabled, câu hỏi dài, câu trả lời có bảng/code, trạng thái waiting/generating, suy nghĩ mở/đóng và lỗi Retry.
- [x] Fixture dùng nội dung mẫu tiếng Nga từ Figma; không đưa fixture vào catalog/backend.
- [x] State demo chỉ gồm giá trị input, busy và thông báo callback gần component; không dùng alert trình duyệt.
- [x] Kiểm tra viewport 1440px và 390px, sau khi font tải xong.
- [x] Đối chiếu font, line-height, màu, padding, radius, SVG và focus; không dùng ảnh chụp Figma làm UI.
- [x] Kiểm tra bằng bàn phím và reduced motion. Báo rõ nếu không mở được trình duyệt; HTTP/build không thay thế kiểm tra hình ảnh.

### TASK-008 - Kiểm tra nghiệm thu và bàn giao

**Files:** sửa `README.md` (nếu cần) và `specs/frontend-plan.md` (đường dẫn cuối tính từ root repository).

- [x] Giữ nguyên hai file giấy phép font `.txt` hiện có trong `public/assets/fonts/`.
- [x] Chạy lần lượt từ `frontend/`:

```sh
npm test
npm run typecheck
npm run build
```

- [x] Kiểm tra output build có font và các asset; không có URL asset Figma tạm.
- [x] Chạy `git diff --check`; kiểm tra không xuất hiện `.gitignore` con hoặc thay đổi backend.
- [x] Báo lại: component đã làm, kết quả lệnh thực tế, kết quả đối chiếu hình ảnh và phần chưa xác minh.
- [x] Cập nhật bước 3 trong frontend-plan với liên kết spec và trạng thái thực tế; không đánh dấu hoàn tất nếu còn tiêu chí bắt buộc chưa đạt.
- [x] Bàn giao bước 4 qua props/callback nêu trên; chưa tự triển khai màn hình so sánh hoàn chỉnh.


## Lịch sử thay đổi

### 2026-11-09 — Sửa lỗi sau nghiệm thu trực quan FE003 (by 6.1 Sol)

**Phạm vi được người dùng duyệt:** sửa 6 mục trong báo cáo review và ghi lịch sử tại cuối SPEC; chưa triển khai hoặc tạo SPEC FE004.

| Mục | Kết quả sửa |
|---|---|
| Nút gửi/dừng | PromptForm dùng nút tròn trắng 36×36px, giữ SVG đen gốc và kích thước icon. |
| Textarea bị cắt | Đo lại chiều cao khi value, chiều rộng hoặc font thay đổi; dùng ResizeObserver có cleanup, bỏ qua notification chỉ đổi chiều cao để tránh vòng lặp. Chiều cao textarea 36–160px; form một dòng cao 54px. |
| Bảng mobile khó đọc | Ô bảng có chiều rộng tối thiểu 120px, ngắt theo từ; bảng rộng cuộn trong wrapper, không đẩy rộng toàn trang. |
| Style khác Figma | Căn lại padding/viền/màu của Button; PromptForm dùng nền third, bo góc 16px, focus ring rõ; CodeBlock dùng header cùng nền, thêm SVG Copy. Bảng bỏ khung/bo góc và nền header không có trong mẫu. |
| Copy bất đồng bộ | Tách state vào instance được key theo code. Đổi nội dung tạo instance mới, promise từ lần copy cũ không thể ghi đè kết quả copy của nội dung mới. |
| Newline Prism | Bỏ nội dung newline giả của token rỗng; chèn mỗi separator đúng một lần và giữ LF/CRLF. Tính danh sách separator một lần cho mỗi render. |

**Files thay đổi** (đường dẫn tính từ root repository):

- `frontend/src/components/ui/Button.module.css`.
- `frontend/src/features/compare/components/AnswerContent.module.css`.
- `frontend/src/features/compare/components/CodeBlock.tsx`, `CodeBlock.module.css`, `CodeBlock.test.tsx`.
- `frontend/src/features/compare/components/PromptForm.tsx`, `PromptForm.module.css`, `PromptForm.test.tsx`.
- `specs/FE003-ui-components.md` — chỉ bổ sung phần lịch sử này.

**Kiểm thử hồi quy:**

- Trước sửa: 7 ca mới thất bại đúng lỗi (4 ca newline, 2 ca promise clipboard cũ resolve/reject ghi đè thao tác mới, 1 ca remeasure textarea).
- Sau sửa: thêm cả ca CRLF, tổng cộng **62/62 tests đạt trong 11 test files**.
- `npm run typecheck`, `npm run build`, `git diff --check`: exit 0.
- Review độc lập không phát hiện hồi quy chức năng trong các thay đổi.

**Xác minh trên trình duyệt:**

- Chromium headless chạy qua PowerShell ngoài sandbox, dùng Playwright có sẵn; không thêm dependency cho frontend.
- Kiểm tra trực tiếp `http://127.0.0.1:5173/`, đợi font tải xong; đối chiếu ảnh chụp với component Figma đã đọc.
- Viewport 1440px và 390px: không tràn ngang toàn trang, không có page error.
- Với cùng prompt, textarea đo lại từ 36px trên desktop thành 80px trên mobile, không cắt chữ; nội dung dài đạt trần 160px và cuộn nội bộ.
- Form một dòng cao 54px; nút Send/Stop 36×36px, nền trắng.
- Bảng mobile: vùng xem 308px, nội dung 483px, các cột tối thiểu 120px và cuộn riêng.
- Copy bằng Clipboard API thật thành công; nội dung code hiển thị khớp fixture, có xét chuẩn hóa LF/CRLF của Markdown và clipboard trên Windows. Unit test kiểm tra chính xác LF/CRLF ở CodeBlock.
- Focus outline hiện rõ khi vào textarea; xác nhận chế độ prefers-reduced-motion được áp dụng.
- Chụp và xem ảnh PromptForm, busy và code/table ở cả hai viewport; ảnh kiểm tra nằm trong thư mục tạm, không đưa vào source.

**Giới hạn:** đây là kiểm tra bộ component/trang showcase FE003, chưa phải nghiệm thu màn hình so sánh hoàn chỉnh hoặc toàn bộ luồng người dùng. Không sửa backend, không thay giấy phép font, không thêm .gitignore con và không commit/push.
