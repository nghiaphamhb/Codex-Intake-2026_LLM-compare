# FE004 - Ghép màn hình so sánh desktop LLM Compare

**Trạng thái:** SPEC để Gemini 3.8 Flash triển khai sau khi được người dùng giao thực hiện. Tạo SPEC không có nghĩa đã triển khai.
**Phụ thuộc:** nền frontend và FE003, gồm lịch sử sửa lỗi cuối FE003 ngày 2026-11-09.

## Goal

Thay trang showcase mặc định bằng màn hình kết quả so sánh desktop hoàn chỉnh, bám frame Figma 1440px: header, ba cột model, hai lượt hỏi với câu trả lời tương ứng, vùng thêm model bên phải và form phía dưới.

Kết quả là giao diện dùng dữ liệu mẫu có thể đối chiếu trực quan với Figma. Chưa tích hợp LLM hoặc quản lý cuộc hội thoại thật.

## User Story

Là người dùng, tôi muốn đọc câu trả lời của nhiều model cạnh nhau cho cùng một câu hỏi, để so sánh dễ dàng mà không nhầm câu trả lời thuộc model hoặc lượt hỏi nào.

Là người phát triển, tôi muốn tái sử dụng component FE003, giữ bộ test cũ và trang showcase, để ghép màn hình mà không làm mất các sửa lỗi đã được nghiệm thu.

## Scope

### In

- Trang mặc định tại `/` hiển thị màn hình kết quả desktop, dùng fixture Editor.js theo Figma.
- Header: logo/tên LLM Compare; hai nút sao chép liên kết và tạo so sánh mới.
- Thanh tiêu đề ba model, sticky khi cuộn trang; đường phân cách thẳng với cột câu trả lời.
- Hai lượt hỏi: mỗi câu hỏi hiển thị một lần; mỗi lượt có một hàng chung chứa ba câu trả lời.
- Hiển thị prose, bảng, code, thời gian/chi phí mẫu; trạng thái suy nghĩ và lỗi timeout mẫu.
- Vùng thêm model nét đứt bên phải; PromptForm bên dưới toàn bộ vùng nội dung.
- Giữ showcase FE003 tại `/?view=components`, không thêm router.
- Hoạt động Copy code, mở/đóng suy nghĩ và nhập văn bản theo FE003.
- Các thao tác thuộc giai đoạn sau chỉ phát callback và thông báo demo, không giả vờ đã thay đổi dữ liệu.
- CSS desktop co giãn trong khoảng viewport từ 1280px trở lên; nghiệm thu chính tại 1440px.
- Kiểm thử cấu trúc/dữ liệu/sự kiện và kiểm tra layout bằng trình duyệt thật.

### Out

- Gọi backend/LLM, catalog thật, streaming, timeout thật, tính phí thật.
- Thêm/xóa model thực tế, popover tìm model, Retry thực tế, lưu lịch sử và link khôi phục cuộc so sánh.
- Thêm lượt hỏi hoặc xóa cuộc so sánh sau thao tác gửi/tạo mới.
- Mobile tabs hay thiết kế mobile hoàn chỉnh; thuộc bước 7.
- Auth, router, Redux/Zustand, Storybook, framework UI mới.
- Thay đổi backend, giấy phép font, dependency nền hoặc .gitignore con.
- Tự commit/push hoặc sửa ngoài phạm vi được giao.

### Quy ước cho Gemini

- Đọc `AGENTS.md`, `specs/F000-pattern.md`, `specs/frontend-plan.md`, `specs/FE003-ui-components.md`, nhất là lịch sử sửa cuối FE003.
- Tuân thủ quyền sửa file của AGENTS.md. Khi được giao triển khai FE004, chỉ sửa frontend và tài liệu FE004/frontend-plan/README liên quan.
- Thực hiện TASK-001 → TASK-008 tuần tự; viết test hành vi/cấu trúc trước logic tương ứng.
- Không đánh dấu tiêu chí hình ảnh hoàn tất chỉ dựa vào HTTP 200, jsdom hoặc build.
- Khi sandbox lỗi CryptUnprotectData, dùng PowerShell ngoài sandbox theo cơ chế quyền công cụ; không tìm cách đổi thiết lập bảo mật.
- Paths của task tính từ `frontend/`, trừ `specs/...` tính từ root repository.
- Component nằm trong `src/features/compare/components/`; mỗi component mới có CSS Module riêng khi cần.
- Import trực tiếp component FE003 từ file của nó: barrel hiện chỉ export một số component, không mặc định mọi component đã được export qua index.
- Không tạo abstraction dự phòng hoặc framework layout. Không thay đổi các callback/props FE003 đang được dùng; nếu thêm prop phải optional và có mặc định tương thích.
- Không dùng style trang showcase hoặc selector `nth-child` để điều khiển dữ liệu trang desktop.

### Nguồn thiết kế và kích thước phải giữ

Figma file `tUMuB5lsAJ9gBPuQ6bJIQB`, page `1805:1587`.

- [Frame kết quả desktop](https://www.figma.com/design/tUMuB5lsAJ9gBPuQ6bJIQB/LOCAL-DRAFT--Copy-?node-id=2609-2229): `2609:2229`, 1440×1490px.
- Component kit `2608:2201`; frame generation `2610:2439` và mobile `2611:2452` chỉ tham khảo, không triển khai màn riêng.
- Bắt buộc đọc screenshot và design context của frame kết quả trước khi viết CSS. Dùng tích hợp Figma nếu có; tuân thủ skill Figma design-to-code của môi trường.
- Nếu không truy cập được, báo phần đối chiếu đang bị chặn; không tự tuyên bố khớp Figma.
- Tái sử dụng SVG trong `public/assets/icons/`, không vẽ lại, không dùng URL Figma tạm trong runtime.

| Thành phần | Mốc tại viewport 1440px |
|---|---|
| Nền toàn trang | #000000; Inter 14px/22px; code JetBrains Mono 12px/18px |
| Top bar | cao 63px, viền dưới 1px; nội dung từ x=112 tới x=1328 |
| Container chung | rộng tối đa 1216px, căn giữa; tại 1440px có lề trái/phải 112px |
| Body | padding-top 24px, bắt đầu tại y=87 |
| Khối so sánh | x=112, rộng 1016px |
| Khoảng cách tới vùng thêm model | 32px |
| Vùng thêm model | x=1160, rộng 168px; stretch theo chiều cao khối so sánh |
| Thanh tiêu đề model | cao 64px, bo 18px, glass token; ba cột bằng nhau và hai divider 1px |
| ModelHeader | padding 12px 28px; name 14px/20px, provider 12px/16px; nút xóa 32px nền trắng 8% |
| Câu hỏi | căn phải trong khối so sánh, chừa phải 28px; bubble rộng 454px, padding 12px 16px, bo 16px |
| Câu hỏi lượt 1 | cách thanh model 24px; mẫu cao 68px, answers bắt đầu y=243 |
| Cột câu trả lời | padding trên 24px, ngang 28px, dưới 40px; gap nội dung 14px |
| Lượt 2 | có viền trên ngăn lượt; câu hỏi cách viền 33px |
| Composer | wrapper padding-top 40px, padding-bottom 24px; form rộng 760px, căn giữa TOÀN container, một dòng cao 54px |

Các mốc y phía dưới phụ thuộc typography và nội dung: Figma có hàng đáp án đầu cao 581px, hàng sau cao 447px, body kết thúc y=1372, form ở y=1412. Đây là mốc kiểm tra fixture, **không** phải lý do gán chiều cao cố định hoặc cắt nội dung.

## Flow

1. Mở `/`: hiện header, ba model, hai câu hỏi và sáu ô đáp án từ fixture; input ban đầu rỗng.
2. Đọc từ trên xuống: một câu hỏi chung → một hàng đáp án ba model → lượt tiếp theo.
3. Khi cuộn trang, top bar cuộn bình thường; thanh model sticky cách mép trên viewport 16px. Thanh không chồng lên top bar ở đầu trang.
4. Toàn trang dùng một cuộn dọc. Không tạo ba vùng cuộn dọc độc lập cho ba model.
5. Copy code và toggle suy nghĩ hoạt động như FE003.
6. Click nút share/new/add/remove/retry hoặc submit prompt: phát action cho page; hiển thị một thông báo demo trong vùng status sau form. Không gọi API, không sửa fixture, không giả báo đã thêm/xóa/gửi thật.
7. Nhập câu hỏi không làm form tự fixed vào viewport. Form nằm sau nội dung trong normal flow.
8. Mở `/?view=components`: vẫn xem được showcase FE003 và toàn bộ tương tác cũ.

## Edge Cases

- Cột có câu trả lời ngắn/lỗi vẫn chiếm cùng hàng với cột dài; câu hỏi lượt tiếp theo bắt đầu sau đáp án dài nhất.
- Không xếp mỗi model thành một flex column độc lập, vì cách này làm các lượt hỏi lệch nhau.
- Trật tự property trong object đáp án không quyết định trật tự cột; luôn duyệt `models` rồi lookup theo model ID.
- Tên model dài truncate theo FE003; model vẫn giữ id ổn định.
- Đáp án thiếu cho một model không được kéo đáp án model khác sang cột đó; hiện ô trống có nhãn truy cập, giữ vị trí.
- Prose/URL dài không đẩy rộng cột; `min-width: 0` cho grid item và vùng prose.
- Code và bảng rộng chỉ cuộn ngang trong wrapper FE003; không tạo scrollbar ngang toàn trang ở 1440px.
- Mở rộng suy nghĩ hoặc nhập nhiều dòng làm layout tăng chiều cao tự nhiên; không đè lên lượt tiếp theo/form.
- Không dùng `overflow: hidden/auto/clip` trên ancestor của thanh sticky để chữa lỗi tràn; sửa min-width và vùng cuộn tại content con.
- Khi viewport dưới 1280px, giữ desktop canvas tối thiểu 1280px và cho cuộn ngang ở document như fallback tạm; không tự thiết kế mobile.
- Nếu clipboard từ chối, Copy code vẫn báo lỗi theo FE003, không giả báo thành công.
- Reduced motion và keyboard focus của FE003 phải còn hoạt động.
- Đợi font load trước đo layout/chụp ảnh; đo lại textarea khi resize như bản sửa FE003.

## Acceptance Criteria

- [ ] `/` hiển thị màn kết quả, `/?view=components` vẫn hiển thị showcase.
- [ ] Header, cột model, câu hỏi, đáp án, vùng thêm model và form đúng thứ tự Figma.
- [ ] Có đúng 3 model, 2 câu hỏi chung và 6 ô đáp án; đáp án đúng model/lượt.
- [ ] Tại 1440px: container 1216px; khối so sánh 1016px; gap 32px; add region 168px; composer 760px.
- [ ] Header 63px; thanh model 64px; các divider/cột thẳng nhau; sai lệch phép đo chính tối đa 2px do làm tròn.
- [ ] Thanh model sticky top 16px khi cuộn; không che nội dung ở đầu trang và không mất sticky do overflow ancestor.
- [ ] Các ô trong cùng lượt có cùng top và bottom, chiều cao theo ô dài nhất; không cắt nội dung.
- [ ] Mỗi câu hỏi chỉ xuất hiện một lần, không nhân bản vào từng cột.
- [ ] Composer ban đầu rỗng, hiện placeholder; form bình thường cao 54px, nút trắng 36px; không fixed.
- [ ] Câu trả lời có đúng nội dung Editor.js, bảng, code, lỗi và số liệu mẫu theo task fixture.
- [ ] Copy code và mở/đóng suy nghĩ hoạt động; callback demo không thay đổi models/turns hoặc gọi API.
- [ ] Không có page error, tài nguyên lỗi hoặc URL Figma asset tạm; không tràn ngang ở 1440px và 1280px.
- [ ] Giữ các test FE003, gồm clipboard race/newline/auto-height; toàn bộ test/typecheck/build exit 0.
- [ ] Có ảnh kết quả 1440×1490px và đối chiếu bằng mắt với frame; ghi rõ sai khác chưa đạt, không tự tick nghiệm thu khi còn lỗi đáng kể.
- [ ] Có lịch sử thực hiện/kiểm tra ở cuối SPEC; không sửa backend, không commit/push.

## Tasks

### TASK-001 - Giữ showcase và tạo entrypoint cho màn kết quả

**Files:** `src/app/App.tsx`, `src/app/App.module.css`, tạo `src/app/ComponentShowcase.tsx`, `ComponentShowcase.module.css`; tạo test `src/app/App.test.tsx`.

- [ ] Chuyển phần showcase hiện có và style của nó sang ComponentShowcase; sửa import tương đối khi cần, giữ hành vi.
- [ ] App đọc `new URLSearchParams(window.location.search).get('view') === 'components'`: đúng thì render showcase, còn lại render ComparePage.
- [ ] Không thêm router, navbar dev hoặc nhãn kỹ thuật trên trang kết quả.
- [ ] Test render theo query string bằng `history.replaceState`, restore URL sau test. Unknown view cũng mở trang kết quả.
- [ ] Giữ import font và global CSS trong main.tsx như hiện tại.

**Kiểm tra:** cả hai URL chạy; query không làm thay đổi fixture hoặc mất test cũ.

### TASK-002 - Khóa hợp đồng dữ liệu và fixture desktop

**Files:** tạo `src/features/compare/types.ts`, `desktopFixtures.ts`, `desktopFixtures.test.ts`. Giữ `fixtures.ts` cũ cho showcase.

**Interfaces:**

```ts
export type CompareModel = {
  id: string;
  name: string;
  provider: string;
};

export type ResultAnswer =
  | {
      state: 'success';
      markdown: string;
      durationLabel: string;
      costLabel: string;
      thought?: { text: string; durationSeconds: number };
    }
  | {
      state: 'error';
      message: string;
      description: string;
    };

export type CompareTurn = {
  id: string;
  question: string;
  answers: Record<string, ResultAnswer | undefined>;
};

export type CompareAction =
  | { type: 'share' }
  | { type: 'new-comparison' }
  | { type: 'add-model' }
  | { type: 'remove-model'; modelId: string }
  | { type: 'retry'; turnId: string; modelId: string }
  | { type: 'send'; prompt: string };
```

- [ ] Export `desktopModels: readonly CompareModel[]` theo đúng thứ tự:
  1. id `claude-demo`, name `Claude Haiku 5.5`, provider `Anthropic`.
  2. id `yandex-demo`, name `YandexGPT 5 Lite`, provider `Яндекс`.
  3. id `giga-demo`, name `GigaChat 2`, provider `Сбер`.
- [ ] ID là ID fixture UI, không phải catalog thật; không lấy tên model đang bán ngoài thiết kế.
- [ ] Export `desktopTurns: readonly CompareTurn[]` với `turn-1`, `turn-2`.
- [ ] Câu hỏi turn-1: `Что ты знаешь о редакторе Editor.js? Кто его разработал и чем он отличается от аналогов?`
- [ ] Câu hỏi turn-2: `Покажи минимальный пример, как подключить Editor.js на страницу`.
- [ ] Turn-1/Claude: prose mở đầu `Editor.js — блочный редактор с открытым исходным кодом. Его разрабатывает команда CodeX.`, nhấn đậm Editor.js và CodeX; heading h3 `Чем отличается от аналогов`; đoạn so sánh HTML với JSON; bảng 2 cột `Редактор | Формат данных`, 3 hàng `Editor.js | JSON-блоки`, `TinyMCE | HTML`, `Quill | Delta (JSON)`; kết luận `Каждый тип блока — отдельный плагин: заголовок, список, изображение, код.`.
- [ ] Turn-1/Claude thought có durationSeconds 4, text mẫu ngắn giải thích sẽ giới thiệu Editor.js và so sánh định dạng. Nội dung thought mặc định đóng nên không thay đổi bố cục đầu trang.
- [ ] Turn-1/Yandex: đoạn `Editor.js — бесплатный веб-редактор от команды CodeX. Контент в нём состоит из блоков, а на выходе получается чистый JSON, который удобно хранить и выводить где угодно.`; heading h3 `Пример данных`; code fence json minh họa blocks/type/header/data/text/level theo screenshot; hai bullet về npm package `@editorjs/editorjs` và plugin.
- [ ] JSON mẫu giữ indentation 2 spaces, các khóa như sau; xuống dòng mở object/array để khớp code block Figma:

```json
{
  "blocks": [{
    "type": "header",
    "data": { "text": "Привет", "level": 2 }
  }]
}
```

- [ ] Turn-1/Giga là error: `Модель не ответила за 60 секунд`; description `Остальные ответы сохранены. Можно повторить запрос только к этой модели.`; không có metadata thành công.
- [ ] Turn-2/Claude: đoạn `Установите сам редактор и плагин заголовков, затем создайте экземпляр:`, code js bên dưới, kết luận `Данные забирайте через editor.save() — метод вернёт JSON с блоками.`.
- [ ] Turn-2/Yandex: `Достаточно двух шагов:`; ordered list cài `@editorjs/editorjs`, tạo phần tử id `editor`; code js `const editor = new EditorJS('editor');`.
- [ ] Turn-2/Giga: đoạn `Подключите редактор через npm и создайте экземпляр, указав id контейнера на странице: new EditorJS({ holder: 'editor' }).`, dùng inline code cho constructor; đoạn `Без плагинов будет доступен только блок с текстом. Заголовки, списки и картинки подключаются отдельными пакетами.`.
- [ ] Code js cho turn-2/Claude:

```js
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';

const editor = new EditorJS({
  holder: 'editor',
  tools: { header: Header }
});
```

- [ ] Metadata (chuỗi hiển thị, không tự tính hoặc chuyển đổi giá):
  - turn-1/Claude `2,1 с` và `$0,0021`; Yandex `1,4 с` và `$0,0009`.
  - turn-2/Claude `1,8 с` và `$0,0016`; Yandex `1,1 с` và `$0,0006`; Giga `3,4 с` và `$0,0011`.
- [ ] Lấy dấu câu/break và khoảng trắng còn lại theo screenshot/design context. Không thay fixture Editor.js bằng QuickSort hoặc nội dung random.
- [ ] Test hai turn có ID riêng, 3 model ID riêng, đúng error tại turn-1/Giga, đúng metadata; không gọi API.

### TASK-003 - Top bar và vùng thêm model

**Files:** tạo `CompareTopBar.tsx/.module.css/.test.tsx`, `AddModelColumn.tsx/.module.css/.test.tsx` trong thư mục components.

**Interfaces:**

```ts
type CompareTopBarProps = {
  onShare: () => void;
  onNewComparison: () => void;
};
type AddModelColumnProps = {
  onAdd: () => void;
};
```

- [ ] Top bar dùng logo.svg kích thước gốc 20px, brand 16px/22px semibold; gap brand 10px.
- [ ] Nút secondary có link.svg và nhãn `Скопировать ссылку`; primary nhãn `Новое сравнение`; dùng Button FE003.
- [ ] Header ngoài full width có bottom border; inner dùng chung max-width/gutter với body. Header cao 63px; không fixed/sticky header ngoài.
- [ ] AddModelColumn là native button chiếm toàn vùng 168px, border dashed trắng 18%, bo 18px, padding trên 20px; icon plus.svg trong vòng tròn 44px nền trắng 8%, nhãn `Добавить модель` 13px/18px medium bên dưới gap 10px.
- [ ] Add region stretch theo body, không fixed height 480px. Giữ focus outline; click bất kỳ chỗ nào trong vùng phát onAdd đúng một lần.

**Tests:** đúng accessible name, callback click/keyboard; không có network hoặc thao tác clipboard trong top bar (chỉ callback demo).

### TASK-004 - Thanh model và lưới đáp án theo từng lượt

**Files:** tạo `CompareGrid.tsx/.module.css/.test.tsx`, `AnswerCell.tsx/.module.css/.test.tsx`.

**Interfaces:**

```ts
type CompareGridProps = {
  models: readonly CompareModel[];
  turns: readonly CompareTurn[];
  onAction: (action: CompareAction) => void;
};
type AnswerCellProps = {
  model: CompareModel;
  turnId: string;
  answer: ResultAnswer | undefined;
  onRetry: () => void;
};
```

- [ ] CompareGrid là khối models 1016px trong shell; bên trong có một model bar rồi danh sách turn.
- [ ] Dùng CSS Grid cùng công thức `repeat(n, minmax(0, 1fr))` cho model bar và MỖI hàng đáp án. Truyền số lượng cột bằng một CSS custom property; không viết 3 layout khác nhau.
- [ ] Divider 1px dùng border-left trên các ô từ cột thứ hai; border-box và cùng công thức grid đảm bảo trục phân chia khớp nhau.
- [ ] Mỗi turn là section với label câu hỏi; bubble nằm ở hàng riêng phủ chiều rộng models; rồi hàng đáp án dùng stretch.
- [ ] Hàng đáp án không có chiều cao cố định. Mỗi cell padding 24px 28px 40px; min-width 0. Không thêm scrollbar dọc vào cell.
- [ ] Phần question của turn đầu padding 24px 28px 0; lượt sau có border-top và padding 33px 28px 0. Bubble rộng 454px, giới hạn max-width 100%, căn phải.
- [ ] AnswerCell success: thought nếu có → AnswerContent → metadata, gap 14px; metadata font mono 12px/18px, màu secondary, chuỗi `durationLabel · costLabel`.
- [ ] AnswerCell error: tái sử dụng AnswerError, Retry phát `{ type: 'retry', turnId, modelId }`; không metadata.
- [ ] AnswerCell thiếu: vùng rỗng với `aria-label="Нет ответа: {model.name}"`; không thay bằng error giả và không đổi vị trí cột.
- [ ] ModelHeader nhận onRemove bọc action đúng modelId; map cột theo models, key ổn định bằng id.
- [ ] Model bar sticky top16px, z-index10, glass/bg/border/shadow tokens; không đặt overflow lên ancestor của sticky.

**Tests:** 2 câu hỏi chỉ xuất hiện mỗi câu một lần; 6 cell đúng model/turn (label cell `{model.name}, {turnId}`); model order vẫn đúng khi đảo thứ tự keys trong answers; missing answer giữ ô; Retry/remove có đúng IDs. Kiểm tra pixel alignment bằng trình duyệt trong TASK-008, không giả lập layout bằng jsdom.

### TASK-005 - Điều chỉnh component FE003 tối thiểu để khớp frame

**Files:** chỉ sửa component/CSS có sai khác đã xác định; giữ nguyên API cũ và tests.

- [ ] ModelHeader: bỏ border-bottom riêng ở từng header, dùng model bar làm viền ngoài; padding 12px 28px, name14/20, provider12/16; remove button32px nền control, không thay nền generic IconButton ở mọi nơi.
- [ ] QuestionBubble: padding12px16px, không có viền, nền secondary; chiều rộng thuộc wrapper CompareGrid.
- [ ] AnswerError: layout dọc icon20 → message → description → Retry, gap12, padding20; border trắng12%, bo16. Icon Retry lấy SVG gốc retry.svg.
- [ ] AnswerContent trong cell: paragraph/list/heading/block cách nhau14px; không cộng dồn margin mặc định của CodeBlock với margin prose. Heading h3 16px/22px, đoạn14px/22px.
- [ ] Inline code theo Figma: mono13px, underline, không nền/viền/padding chip. Code block vẫn mono12px/18px.
- [ ] Bảng 2 cột phải vừa vùng prose khoảng282px; không tăng min-width120px của cell bảng từ bản sửa FE003. Bảng rộng hơn vẫn cuộn riêng.
- [ ] Không thay logic Copy, key theo code, newline LF/CRLF, auto-height, IME và ResizeObserver cleanup.
- [ ] Nếu cần scope style cho desktop để không ảnh hưởng showcase, thêm optional className cho component liên quan và đặt override qua class do page truyền; không duplicate renderer/component. Ghi lựa chọn thực tế trong lịch sử.

**Kiểm tra:** toàn bộ test FE003 còn xanh, showcase vẫn chạy; không dùng CSS selector phụ thuộc vị trí trong DOM để bypass props.

### TASK-006 - ComparePage, composer và action demo

**Files:** tạo `src/features/compare/ComparePage.tsx/.module.css/.test.tsx`; nối vào App.

- [ ] ComparePage dùng desktopModels/desktopTurns, container max1216px, gutter32px khi viewport>=1280px; tại1440px đạt lề112px do max-width.
- [ ] Body grid `minmax(0, 1fr) 168px`, gap32px, padding-top24px. Các viewport dưới1280px dùng desktop min-width1280px, cuộn document; không thêm mobile tabs trong task này.
- [ ] Form wrapper cùng container, padding-top40px/bottom24px; PromptForm width760px, căn giữa toàn container, không chỉ căn trong1016px models.
- [ ] Trang dùng normal flow; không ép height1490px, không overflow-hidden để vừa screenshot.
- [ ] State page chỉ gồm promptValue và demoMessage. busy luôn false; onStop callback no-op có comment rằng chưa chạy generation trong FE004.
- [ ] onSend phát action send với nguyên prompt; không thêm turn, không xóa input; các callback khác cũng qua một handleAction.
- [ ] Demo message là `Демо: действие «{action}» пока не подключено.`, action dùng nhãn tiếng Nga phù hợp; hiển thị sau form trong role=status, ban đầu rỗng/không chiếm chiều cao.
- [ ] Không thêm modal, toast library, timer, fetch, session/localStorage hoặc clipboard share thực tế.
- [ ] Không nhét nội dung nhắc kỹ thuật vào header/câu trả lời để giải thích chưa tích hợp.

**Tests:** default page có đúng brand/actions; input rỗng, Send disabled; nhập/gửi giữ input và không tăng lượt; add/new/share/remove/retry chỉ hiện thông báo demo, không thay model/turn; Copy/toggle vẫn là hành vi FE003.

### TASK-007 - Kiểm tra cấu trúc và hồi quy

- [ ] Chạy test theo từng task trước khi chạy full suite. Không sửa assertion cũ chỉ để test xanh khi hành vi FE003 bị mất.
- [ ] Test nhận diện target bằng role/text/accessible name; không chỉ snapshot cây DOM hoặc kiểm tra tên CSS class.
- [ ] Xác nhận mapping turn/model bằng dữ liệu test riêng có chuỗi đáp án khác nhau; không chỉ đếm 6 cell.
- [ ] Có test cho missing answer, callback IDs, showcase routing, submit demo không mutate fixture.
- [ ] Giữ 62 test baseline FE003, thêm test FE004; nếu số baseline thay đổi phải giải thích bằng kết quả thực tế.
- [ ] Chạy từ frontend:

```sh
npm test
npm run typecheck
npm run build
```

**Kết quả:** tất cả exit0. Không thêm dependency UI/router. Công cụ kiểm tra browser nếu cần thêm chỉ là dev dependency và phải ghi rõ trong bàn giao; không hardcode đường dẫn module nằm trong repo khác.

### TASK-008 - Đối chiếu Figma bằng trình duyệt và bàn giao

- [ ] Chạy trang tại127.0.0.1:5173, mở1440×1490px, đợi `document.fonts.ready`, chụp ảnh viewport và full page.
- [ ] So với screenshot frame2609:2229: bố cục, tên/nội dung, ngắt dòng, icon, kiểu chữ, màu, padding/gap và độ cao tổng. Sửa mọi sai khác đáng kể thuộc FE004.
- [ ] Đo bounding rect: container x112/w1216; models x112/w1016; add x1160/w168; gap32; header63; bar64; composer x340/w760; dung sai tối đa2px.
- [ ] Đo x ranh giới các cột của model bar và cả hai hàng đáp án; cùng hàng có top/bottom bằng nhau. Kiểm tra dài/ngắn khác nhau không đẩy lượt tiếp theo sai vị trí.
- [ ] Cuộn trang ít nhất400px: bar sticky top16px, không bị cắt; cuộn về đầu giữ model bar tại y87. Cuộn tới cuối, form không che đáp án.
- [ ] Mở thought, đổi viewport1440→1280, nhập nhiều dòng: bố cục không đè nhau; textarea không cắt chữ. Đổi lại1440 trước ảnh nghiệm thu.
- [ ] Ở1440 và1280, document.scrollWidth <= document.clientWidth. Ở390 chỉ xác nhận fallback desktop có thể cuộn, không tick đã làm mobile.
- [ ] Kiểm tra Copy thật, toggle suy nghĩ, callback demo, keyboard focus, reduced motion, console/page error và asset404.
- [ ] Nếu công cụ browser sandbox lỗi, chạy headless Chromium/Playwright qua PowerShell ngoài sandbox theo quyền công cụ; không dừng ở HTTP200.
- [ ] Chạy `git diff --check`; xác nhận backend và giấy phép font không bị sửa, chỉ một .gitignore gốc.
- [ ] Cập nhật README: URL trang chính/showcase, dữ liệu demo, lệnh chạy và giới hạn desktop.
- [ ] Cập nhật `specs/frontend-plan.md` bước4 với link FE004 và trạng thái dựa trên kiểm tra.
- [ ] Bổ sung mục lịch sử ở CUỐI spec này: ngày, task thực hiện, files đổi, số test, kết quả lệnh, viewport đã kiểm tra, đường dẫn ảnh/bằng chứng, sai khác còn lại.
- [ ] Không tự tick hoàn tất khi chưa xem ảnh hoặc còn sai khác đáng kể. Bàn giao cho bước5: callbacks CompareAction đã có, dữ liệu vẫn fixture; bước5 sẽ triển khai thay đổi models/turns và chia sẻ thực tế.
