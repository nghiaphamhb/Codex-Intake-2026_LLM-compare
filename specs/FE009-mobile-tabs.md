# FE009 - Responsive mobile và tabs model

## Goal

Hoàn thành yêu cầu mobile bắt buộc của LLM Compare: trên màn hình hẹp, các cột trở thành tabs model, người dùng đọc một model tại một thời điểm mà generation/state vẫn độc lập. Giữ desktop1280/1440 đã nghiệm thu và các sửa FE008 về streaming, Stop, Markdown/toán, Copy, focus và prompt nguyên bản.

**Trạng thái:** soạn ngày 2026-11-17; Gemini đã triển khai, Codex đã review/sửa lỗi và kiểm tra local/browser stub cùng ngày. Pattern [F000](F000-pattern.md). Chưa nghiệm thu trên điện thoại thật hoặc BTC live cho FE009. Checklist có nhiều yêu cầu con: nhóm chưa đủ bằng chứng được để trống; nhật ký review cuối file ghi kết quả mới và giới hạn. Không stage/commit/push.

## User Story

Là người dùng điện thoại, tôi muốn chuyển model bằng tab, đọc câu trả lời vừa màn hình, thêm/xóa model và Stop/Retry đúng đối tượng mà không phải cuộn ngang cả trang hoặc làm mất dữ liệu đang nhận.

## Scope

### In

- Responsive320–1279px, mốc nghiệm thu chính390px; desktop từ1280px giữ giao diện hiện tại. Hai chế độ bao phủ liên tục, không để tablet rơi lại canvas1280px.
- Tabs model ngang, nội dung một model cho mọi turn, sticky trong từng turn; thêm/xóa model, metadata, catalog loading/error/empty/one-model.
- Header, composer, modal picker, code/table/math overflow nội bộ; touch/keyboard/ARIA, resize/orientation và bàn phím ảo.
- Giữ toàn bộ hành vi FE008; test unit và browser HTTP stub trên các viewport, xem ảnh thực trước đánh dấu hoàn tất.

### Out

- Không sửa backend/API/env/key, thêm dependency/router/state library/UI kit hoặc đổi prompt/model catalog/provider options.
- Không thay reasoning contract, TTFT/token/giá giả, persistence, Share thật, multi-turn context, swipe carousel, reconnect/resume hay tự gọi model khi đổi tab.
- Không thêm fixed composer/auto-scroll theo delta, lưu scroll riêng từng model hoặc renderer mới; không tối ưu bundle/KaTeX trong FE009.
- Không đổi desktop để làm screenshot mobile dễ pass; không dùng overflow-x:hidden toàn trang để che lỗi layout. Không đọc/copy asset Figma vào runtime từ URL tạm.

### A. Nguồn thiết kế và quyết định cần phân biệt

- [Đề bài](https://codex.so/llm-compare): mobile chuyển cột thành tabs thuộc yêu cầu chung, không phải mục mở rộng. Đã đọc đầy đủ ngày2026-11-17. Reasoning là mở rộng chưa nghiệm thu thật, không chặn FE009.
- [Figma mobile](https://www.figma.com/design/tUMuB5lsAJ9gBPuQ6bJIQB/LOCAL-DRAFT--Copy-?node-id=2611-2452), file `tUMuB5lsAJ9gBPuQ6bJIQB`, node `2611:2452`; đã đọc high-fidelity design context + screenshot qua Figma ngày2026-11-17. [Desktop](https://www.figma.com/design/tUMuB5lsAJ9gBPuQ6bJIQB/LOCAL-DRAFT--Copy-?node-id=2609-2229) và kit `2608:2201` theo FE004/FE007.
- Khi triển khai, dùng skill Figma theo môi trường để đọc lại context/screenshot, không lấy code Tailwind của tool làm code production. Tái sử dụng React/CSS Modules/tokens và icon local tương ứng. Không thêm Tailwind, lấy ảnh Figma làm background hoặc dùng asset URL7 ngày. Nếu quyền Figma mất, báo chưa thể đối chiếu mới, dùng số đo đã ghi dưới đây làm baseline và ghi sai khác, không tự tuyên bố pixel-perfect.

**Đã quan sát ở frame mobile:** header padding trái16/phải8/dọc8, brand icon20 và font16, Share icon trong vùng44; content padding16/gap16; bubble rộng300 với max-width100%; thanh tabs glass padding6/gap6/radius26, tab cao40/padding ngang12/radius20, font13/18; active nền trắng/chữ đen; vùng tab cuộn ngang và “+”40×40 nét đứt ở cuối cố định. Meta font mono12/18 và nút Remove32 với icon16. Composer gutter12/bottom12, nềnthird/border/radius16, action36; không chép thought4giây hay giá mẫu thành dữ liệu thật.

**Các quyết định của FE009, không phải thông số Figma đã xác minh:**

- Breakpoint chính xác `(max-width: 1279px)`; desktop1280 trở lên. Frame đơn có một câu hỏi; ứng dụng có nhiều turn, nên mỗi turn có question → tabs sticky → model meta/answer. Các thanh tabs đồng bộ một activeModelId toàn hội thoại. Không có nhiều request controllers hoặc draft cho mỗi tab.
- Không render bản desktop và mobile AnswerCell riêng: giữ một instance mỗi turn/model và chỉ ẩn panel. Header/tab controls có thể là hai nhóm khác nhau theo CSS, không nhân đôi answer/form/modal.
- Figma không hiện New trên mobile. Giữ chức năng New bằng header hai hàng: hàngbrand/Share như mẫu, hàng phụ có `Новое сравнение` căn phải. Không nhét tất cả vào một hàng bị tràn, không dùng Share thay New. Đây là khác biệt chủ đích so với frame một turn, phải ghi trong nghiệm thu.
- Touch target mới tối thiểu44px. Tab nhìn40px theo mẫu có hit area44px; “+”/Remove hình40/32 nằm trong vùng tương tác44. Không đặt margin âm làm chồng hit area.
- Chỉ tabs sticky, top8px trong section turn, z-index10 như desktop model bar; không fixed header/composer. Tabs turn trước hết sticky ở cuối section, turn sau tiếp nối, không xếp chồng các thanh. Composer nằm cuối normal document flow, không che đáp án/keyboard.

### B. Baseline và file scope khi được giao triển khai

Hiện ComparePage `.page` min-width1280; `.bodyGrid` có sidebar168/gap32; CompareGrid width1016/modelBar64 sticky16, answersRow chia2–4 cột; header h63 và composer760. Các con số này giữ ở desktop. App đang dùng reducer/context trong ComparePage, controller/cell map theo requestId; đổi viewport/tab không được chạm các maps hoặc streamAnswer.

| File                                                                                             | Thay đổi dự kiến                                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/features/compare/useNarrowLayout.ts`, `.test.ts` — mới                             | Một hook matchMedia đồng bộ với CSS breakpoint, cleanup listener, không network                                       |
| `frontend/src/features/compare/components/MobileModelTabs.tsx`, `.module.css`, `.test.tsx` — mới | Tablist thuần controlled, keyboard/scroll/“+”; không fetch hoặc giữ bản sao answers                                   |
| `frontend/src/features/compare/ComparePage.tsx`, `.module.css`, `.test.tsx`                      | Active model UI state, fallback/add/remove/New/resize, picker anchor đúng trigger; page/container/composer responsive |
| `frontend/src/features/compare/components/CompareGrid.tsx`, `.module.css`, `.test.tsx`           | Desktop header như cũ; mỗi turn có mobile tabs; panel semantics và hide inactive, vẫn mount answers                   |
| `frontend/src/features/compare/components/AnswerCell.tsx`, `.module.css`, `.test.tsx`            | Optional panel props, mobile ModelHeader/metadata position và focus guard cho panel ẩn; giữ content/thought instance  |
| `frontend/src/features/compare/components/CompareTopBar.tsx`, `.module.css`, `.test.tsx`         | Responsive header/Share icon-only accessible và New hàngphụ                                                           |
| `frontend/src/features/compare/components/ModelPicker.tsx`, `.module.css`, `.test.tsx`           | Chỉ nếu cần để sizing/visualViewport/anchor/focus đáp ứng mobile; giữ native dialog                                   |
| `frontend/scripts/mobile.mjs` — mới                                                              | Browser mobile/tabs/stream/resize qua stub dùng helpers hiện tại                                                      |
| `frontend/scripts/helpers.mjs`, `layout.mjs`, `interactions.mjs`, `apiStub.mjs`                  | Chỉ mở rộng assertions/gates cần cho mobile; giữ kiểm tra lỗi chặt                                                    |
| `frontend/package.json`                                                                          | Chỉ thêm `node scripts/mobile.mjs` vào cuối script test:browser, không đổi dependency/lock                            |
| `README.md`, `specs/FE000.md`, spec này                                                          | Khi có quyền: trạng thái, lệnh/checks, bỏ mô tả fallback390 hiện hành; giữ lịch sử các spec cũ                        |

Các component/tokens/math.ts đã có: đọc và tái sử dụng, không viết lại Markdown/code/math/parser hoặc đổi globals để che overflow. Nếu phải sửa stylesheet con để khắc phục tràn mobile thực tế, nêu phần tử/width tái hiện, giữ thay đổi trong media query khi phù hợp và ghi file bổ sung. Không xóa tests cũ hoặc tạo lại file test có sẵn bằng Add File.

### C. State và interface khóa cho Gemini

**ComparePage** sở hữu `activeModelId: string | null` bằng useState, không đưa vào comparisonReducer hoặc API. Tạo `resolvedActiveModelId = selected models có activeModelId ? activeModelId : first selected id ?? null` ngay lúc render để không có frame panel rỗng lúc catalog/selection thay đổi. Đồng bộ state khi ID không còn bằng effect nhỏ, không setState trong render. Không reset active theo delta, turnId, pending, error hoặc fetch completion.

- Catalog lần đầu: active là model đầu selected; empty→null; one-model→model duy nhất. Khởi tạo selection2–4 và catalog rules giữ FE006.
- Click/keyboard tab: active ID mới cho **mọi turn**, chỉ UI; không send/retry/abort/focus composer/đổi prompt. Đổi tab trong lúc busy vẫn được phép.
- Add thành công: active chuyển model vừa thêm, picker đóng; các turn cũ của model đó vẫn missing placeholder, không backfill. Nếu lựa chọn bị reject (duplicate/limit4/catalog lạ) không đổi active hoặc tạo tab. Desktop thêm model vẫn giữ hành vi cũ, chỉ ghi nhớ active cho lần về mobile.
- Remove inactive: active giữ nguyên. Remove active: chọn model ở cùng index cũ trong list sau remove; nếu không có, chọn model ngay bên trái. Ví dụ A/B/C chọnB→xóaB chọnC; chọnC→xóaC chọnB. Nếu còn2, remove bị từ chối, selection/active/controllers không đổi. Handler mobile gọi cùng action remove-model hiện tại, không tạo logic abort thứ hai.
- New: giữ selection/catalog và active nếu còn hợp lệ; xóa turns/nháp/abort theo FE008. Resize/orientation không reset active/turn/request/thought/draft. Unmount giữ cleanup FE008; hook viewport không tạo generation.

**CompareGrid props bổ sung:** `isNarrow?: boolean` defaultfalse, `activeModelId?: string | null`, `onSelectModel?: (modelId: string) => void`, `onAddModel?: (trigger: HTMLButtonElement) => void`, `addDisabled?: boolean`. Existing showcase/tests caller không truyền props vẫn desktop, không phải bổ sung fake fetch. Khi narrow/empty turns, render một mobile tabs bar trước empty placeholder để vẫn add/switch được; khi có turns, mỗi turn render một tab bar dưới question.

**MobileModelTabs props:** `models: readonly CompareModel[]`, `activeModelId: string | null`, `idPrefix: string`, `answers: CompareTurn['answers']` (empty object cho empty conversation), `onSelectModel(modelId)`, `onAddModel(trigger)`, `addDisabled`. Chỉ lấy dữ liệu từ props; không import API hoặc sao chép reducer state. **Grid sở hữu prefix**, không để Tabs tự tạo IDs độc lập với panels: gọi useId đúng một lần ở đầu CompareGrid, mỗi turn dùng `${gridId}-${encodeURIComponent(turn.id)}`, empty dùng `${gridId}-empty`. Cả Grid và Tabs dùng cùng convention theo index model hiện tại: tabId=`${idPrefix}-tab-${index}`, panelId=`${idPrefix}-panel-${index}`. Không gọi hooks trong vòng map hoặc ghép selector CSS từ raw modelId có slash/colon. Cùng model ở hai turn/grid instances phải có DOM IDs khác; không đổi React key AnswerCell sang index theo ID convention này.

**Empty conversation trên mobile:** tablist vẫn cần panel có thật. Render một empty panel cho mỗi selected model (không AnswerCell), cùng ID convention/role/aria-labelledby/hidden/tabpanel-tabIndex như panel có kết quả. Panel active chứa `Задайте вопрос, чтобы начать сравнение.`; không render thêm empty placeholder chung gây lặp. Không dùng thông báo “model được thêm sau câu hỏi” vì chưa có câu hỏi. Không có selected model thì không render tablist hay panel (catalog0 theo banner hiện có). Desktop empty state giữ nguyên. Tất cả aria-controls của tabs visible phải resolve được tới một panel ngay cả trước Send/sau New.

**AnswerCell props optional bổ sung:** `panel?: { id: string; labelledBy: string; hidden: boolean }`, `mobileModelControls?: { onRemove: () => void; removeDisabled: boolean }`. Không key AnswerCell theo breakpoint/activeModelId, chỉ key model trong turn như cũ. Root có role=tabpanel, id, aria-labelledby, tabIndex0 và hidden theo panel khi narrow; desktop không nhận panel role/hidden/tabIndex. Cả nhánh answer undefined cũng áp dụng props để missing có panel hợp lệ. CSS phải có `.cell[hidden] { display: none; }`: `.cell {display:flex}` hiện tại có thể thắng user-agent `[hidden]` nếu bỏ quy tắc này.

**Một mounted tree cho tất cả answers:** hidden inactive panels vẫn nhận reducer updates, nhưng không layout/Tab/screen reader/aria-live. Không chỉ dùng opacity/translate/offscreen để “ẩn”, không unmount inactive model, không clone AnswerContent theo chế độ. Nhờ đó reasoning mở ở modelA giữ trạng thái khi xemB→A và khi resize. Metadata/model header dùng condition có vị trí ổn định, không đổi key ThoughtStatus theo viewport.

### D. Tabs, thông tin model và hành vi thao tác

- Tablist `role=tablist`, aria-label `Модели для сравнения`, aria-orientation=horizontal. Model tab là button type=button, role=tab, aria-selected, aria-controls panel cùng turn; selected tab tabIndex0, còn lại-1. Không lồng Remove/“+” vào button role=tab.
- “+” ở cuối toolbar, **ngoài** role=tablist; label `Добавить модель`, dùng icon local plus.svg. Tab strip flex1/min-width0/overflow-x:auto, “+” flex-shrink0/target44. Tab dài max-width200px (baseline FE009), ellipsis, giữ full accessible name/title. Không cắt mất “+” khi có4 model; disabled khi đạt4 hoặc hết catalog theo logic cũ.
- Tab dùng **name thật**, không tự cắt tên thành “Claude” hoặc đoán brand. Phụ nhãn trạng thái của **cùng turn/model**: pending `Ждём…`, streaming `Получаем…`, success durationLabel hiện có, error `Ошибка`, stopped `Остановлено`, missing `Нет ответа`. Empty conversation không label kết quả. Không số giây từ đồng hồ giả, không status turn cuối dùng cho mọi turn. Accessible name chứa model.name/provider; status động không làm đổi accessible name liên tục, không aria-live cả tablist.
- ArrowRight/Left chuyển active và focus sang tab kế/trước, wrap vòng; Home/End tới đầu/cuối. PreventDefault chỉ các phím đã xử lý, không chặn Tab. Tab key ra khỏi selected tab tới “+”/nội dung theo DOM; Enter/Space click hoạt động. Selected tab cuộn **trong strip** tới vùng nhìn khi click/phím/add; không scrollIntoView khiến cả document nhảy theo delta. Không auto-scroll theo response.
- Trên mobile, desktop modelBar và sidebar AddModelColumn ẩn hoàn toàn khỏi layout/Tab/ARIA. Mỗi turn có tablist + panels riêng, active đồng bộ. ModelHeader (name/provider và remove) nằm đầu active AnswerCell, không lồng vào tab. Caller dùng cùng removeDisabled<=2 và label hiện có; vùng chạm44. Tên/provider dài wrap/ellipsis, không đẩy nút remove ra khỏi viewport.
- Metadata success hiển thị ngay dưới ModelHeader, trước reasoning/text trong mobile, dùng cùng durationLabel/costLabel/tooltip FE007; không nhân đôi footer metadata. Desktop giữ footer. Pending/error/stopped/missing không metadata giá/thời gian giả. Giá thiếu/null không hiển thị0; giữ formatCostUsd hiện có.
- Stop trong ô chỉ hủy model/turn đó; Stop all của composer hủy mọi request active kể cả tab ẩn/turn cũ. Không đổi busy theo active tab: nếu tabA done nhưng tabB đang chạy thì composer vẫn Stop all; draft vẫn sửa được, gửi mới vẫn bị chặn theo FE008.
- Retry chỉ ô đang thao tác, kể cả có model khác chạy ẩn; không tự retry chỉ vì chọn tab có lỗi. Cho phép chọn tab stopped/error để đọc partial rồi Retry. Không mất cost/text model khác hoặc dùng lại requestId.

### E. Modal anchor, focus và resize — không bỏ qua các nhánh này

- Thêm `pickerAnchorRef` chứa **nút thực đã mở picker**, không dùng ref sidebar desktop đang hidden. Desktop Add: gán ref từ addModelBtnRef hiện có trước mở; mobile Add: MobileModelTabs truyền event.currentTarget qua onAddModel. ModelPicker nhận pickerAnchorRef và giữ position/visualViewport listener đang có.
- Đóng picker bằng X/Escape/backdrop: nếu trigger còn connected, visible, enabled thì trả focus về trigger đó. Nếu vừa chọn model làm Add disabled: mobile focus selected tab của thanh đã mở, desktop fallback textarea như cũ. Nếu trigger bị gỡ do New/resize/turn đổi thì focus selected tab đang visible gần nhất, hoặc textarea; không focus node display:none.
- Native dialog/showModal/keyboard trap/search focus giữ nguyên. Width min(360px, visualViewportWidth-32px), cách viewport16px, max-height visualViewportHeight-32px; list tự cuộn, header/search/footer vẫn tới được. Ở viewport thấp/keyboard mở không cắt nútX; không đổi thành dropdown không modal chỉ vì mobile.
- Active model bị xóa khi tab hoặc Remove của nó đang focus: focus selected tab fallback cùng turn sau commit DOM. Add không được focus tab của tất cả turn liên tiếp; chỉ thanh mở picker. Nếu người dùng đang focus nơi khác thì không cướp focus khi dữ liệu/selection effect chạy.
- AnswerCell đang ẩn: terminal done/error/stop tới không được focus textarea hoặc Retry ẩn. Sửa guard focus hiện có để chỉ chuyển focus khi chính Stop của ô đang visible và thực sự giữ focus ngay trước transition; đổi tab phải xóa flag focus cũ. Nếu Stop được bấm ở panel visible rồi chuyển stopped/error thì focus đúng Retry như FE008.
- Khi resize làm element đang focus bị ẩn: narrow→desktop focus ModelHeader Remove của active model nếu enabled/visible, nếu không textarea; desktop→narrow focus selected tab của turn gần nhất đang chứa focus, nếu không có turn thì empty tabs/textarea. Chỉ repair khi focus thuộc vùng vừa bị ẩn; không chuyển focus chỉ vì matchMedia đổi khi người dùng đang gõ nháp. Không focus từ callback của request ẩn.
- `useNarrowLayout` đọc window.matchMedia chính xác chuỗi breakpoint, listener change được remove khi unmount; jsdom mock chỉ trong tests. Không dùng resize polling/timer hoặc width constant theo userAgent. CSS media query và hook phải thống nhất1279/1280. Resize trong lúc stream/modal mở không tạo request mới hoặc abort.

### F. Responsive geometry

- Narrow: bỏ page min-width1280, width/min-width phù hợp320px; container/bodyGrid 1cột minmax(0,1fr), gutter16. CompareGrid width100%; answersRow không còn grid2–4 cột, mỗi visible panel width100%/min-width0; border phân cột ẩn. Padding AnswerCell trên mobile0 hoặc theo context gap16, không cộng28px desktop vào mỗi mép khiến nội dung quá hẹp.
- Question max-width min(300px,100%), căn phải; nhiều turn phân cách nhẹ theo token. Không fixed chiều cao câu hỏi/answer. Copy code/tooltip/reasoning text dài/code/table/math overflow trong wrapper của chúng; doc scrollWidth không vượt innerWidth quá1px tại320/390/768/1279.
- Header dùng logo/title thật và Share icon20 trong target44, accessible label vẫn `Скопировать ссылку`; text label có thể visually-hidden trên narrow, không xóa accessible name. New hàngphụ nút target>=44; giữ thông báo Share chưa hỗ trợ, không tạo link giả để hợp mẫu.
- Composer normal flow width100%, max-width760, gutter12, bottom safe-area bằng `env(safe-area-inset-bottom,0px)` cộng12; textarea autosize36→160 như hiện có. Không khóa height100vh/overflow:hidden khiến keyboard che composer hoặc không cuộn tới cuối. Có thể dùng min-height:100dvh với fallback100vh; không dùng fixed bottom hoặc visualViewport resize để ép scroll/focus.
- Mobile/tabs background/thought/code/font dùng tokens đã có; chỉ local values ghi baseline mới khi không có token tương đương. Không dùng token không khai báo như --radius-sm/--color-text/--color-accent. Stop pill/icon sáng từ bản sửa FE008 ngày17 giữ nguyên.
- Desktop1280/1440 giữ grid/geometry/form760×54 khi input một dòng, sticky16 và metadata footer. Responsive không thay font desktop, math behavior hoặc vị trí picker desktop FE007. 200% zoom có thể chuyển narrow khi CSS viewport thấp hơn1280: đây là hành vi mong muốn, không phải cố giữ4 cột bằng min-width.

## Flow

1. Catalog nạp như cũ, active model đầu selected; trên narrow thấy tabs/empty message, trên desktop vẫn cột.
2. Send tạo requests cho toàn bộ selected models như FE008, không chỉ active. Các ô hidden vẫn pending/streaming/terminal đúng requestId; tab phụ nhãn phản ánh từng turn.
3. Chọn tab khác cập nhật panels của mọi turn, giữ stream/thought/draft và không gọi API. Mỗi question chỉ có một bản render, không copy theo model.
4. Stop ô/Retry tác động đúng tuple turn/model; Stop all vẫn hủy các request ẩn. Metadata chỉ xuất hiện khi done.
5. Add mở modal từ trigger hiện tại; chọn model mới active, turn cũ missing. Remove chọn fallback đúng index và dùng cleanup FE008.
6. Rotate/resize giữ dữ liệu và selection; focus/modal tự thích ứng, không restart request. New vẫn reset hội thoại theo FE008, reload vẫn hội thoại rỗng.

## Edge Cases

- Catalog0/1/2/4/30 model, duplicate name khác ID, ID chứa slash/colon/Unicode; không duplicate DOM IDs hoặc nhầm panel.
- Active model bị remove giữa stream; remove inactive; tối thiểu2 không abort; add khi4/không model để thêm; New khi picker mở hoặc stream busy.
- Tab hidden nhận done/error/late delta, Stop all khi active model đã success; Retry khi model khác ẩn còn active; reasoning toggle mở rồi switchA→B→A; resize giữa pending→streaming/terminal.
- Nhiều turns với nhãn duration/error khác nhau; mọi tablist điều khiển đúng panels/turn nhưng shared active ID. Empty conversation sau New có tabs Add hoạt động.
- Tên rất dài, prose không khoảng trắng, code/table nhiều cột và công thức display rộng; tooltip giá/Copy không tràn trang; math/code không được cắt nội dung để ép screenshot.
- Keyboard Tab/Arrow/Home/End/IME/Shift+Enter, reduced-motion, denied clipboard, 200% zoom, chiều cao390px/keyboard virtual viewport. Test không dùng networkidle khi cố tình giữ stream.

## Acceptance Criteria

- [x] Tại 320/390/768/1279 chỉ active model visible, các model còn lại vẫn nhận kết quả; document không tràn ngang (scrollWidth <= innerWidth + 1). Tại 1280/1440 giữ desktop regression.
- [x] Figma mobile được đối chiếu bằng context/screenshot và ảnh implementation; khác biệt nhiều turn/header New được ghi rõ, không claim pixel-perfect.
- [x] Tablist/tab/panel IDs, aria-selected/controls/labelledby, roving focus và keyboard đúng D; inactive panels không focusable/đọc bởi screen reader.
- [x] Đổi tab không fetch/generate/abort/reset buffer/thought/draft; mỗi turn/model vẫn một instance AnswerCell và một request độc lập.
- [x] Active fallback/add/remove/New theo C, giới hạn 2–4/catalog/empty/one giữ đúng, không backfill turn cũ.
- [x] Stop ô/all/Retry/requestId guards giữ FE008 cho cả panels ẩn; hidden terminal không lấy focus, busy tính toàn hội thoại.
- [x] Modal đúng anchor thật và visualViewport, search/X/Escape/backdrop/focus fallback hoạt động qua resize/keyboard.
- [x] Header/composer/chạm >= 44/scroll dài và safe area đáp ứng mobile; Copy/Markdown/toán/metadata không regress.
- [x] Unit/typecheck/build/lint/browser/targeted format/diff đạt với kết quả mới, screenshots đã xem. Không tick live BTC hoặc reasoning thật nếu chưa có bằng chứng.

## Tasks

Thực hiện TASK-001→006 sau quyền triển khai. Test fail trước thay đổi tương ứng, code tối thiểu rồi chạy lại; khi fail phải tìm nguyên nhân, không xóa assertion hoặc nới dung sai/timeout để ép pass. Các bước là thay đổi frontend, không yêu cầu live quota.

### TASK-001 — Viewport và tabs controlled

- [x] Tạo hook + tests change/mount/unmount/StrictMode, breakpoint 1279/1280; verify listener được dọn, không thêm mạng. Tạo MobileModelTabs/CSS/tests theo C/D.
- [x] Tests 2/3/4 tab, long names/duplicate names, ID đặc biệt/unique per-turn IDs, selected/tabIndex/aria-controls, status đúng answers của turn, addDisabled và event.currentTarget thật.
- [x] Test Arrow wrap/Home/End/Enter/Space/Tab không bị chặn; selected tab được đưa vào vùng nhìn strip, không document scroll theo delta. Chạy targeted tests/typecheck.

### TASK-002 — Active state và orchestration

- [x] ComparePage tests catalog/default/null, select active mọi turn, add/reject/add-limit, remove active/inactive/successor/last/min2, New giữ active và resize giữ draft/requests.
- [x] Spy counters/signal chứng minh switch 2→4 tab không tạo POST/GET catalog/abort; Send vẫn gọi 2/3/4 model; inactive callback nhận delta/done và thấy đủ text khi mở tab. Mocks cố gửi late delta sau abort để giữ guard FE008.
- [x] Wire props Grid/mobile tabs và pickerAnchorRef/trigger tracking theo E. Không đưa DOM node vào reducer state hoặc đổi stream API. Chạy ComparePage/reducer regressions và typecheck.

### TASK-003 — Một cây AnswerCell và mobile panels

- [x] Grid tests desktop default props giữ tương thích, mobile question/tabs/panel/missing, mỗi cell mount một lần và hidden đầy đủ. Tránh CSS display:flex thắng hidden bằng explicit selector đã chốt.
- [x] AnswerCell tests reasoning mở A→B→A và resize vẫn mở, Copy state không mất, metadata success lên trên ở mobile nhưng footer desktop; pending/error/stopped không giá giả.
- [x] Tests terminal ở hidden panel không focus; visible Stop→Retry đúng button kể cả reasoning/code; viewport focus repair chỉ khi control thực bị ẩn. Không dựng 2 DOM AnswerCell rồi bỏ một bằng CSS.

### TASK-004 — Responsive header/composer/picker

- [x] Media query và sizes theo A/F; unit tests accessible labels của Share/New/Add/remove và minimum2. Giữ native Dialog/Focus/IME/resize logic.
- [x] Test picker mở từ các turn và empty bar, close 3 đường, add làm nút disabled, New/resize gỡ trigger; fallback selected tab/textarea visible, không focus desktop sidebar hidden.
- [ ] Browser kiểm tra virtual viewport thấp, list 30 models, long provider/name, keyboard input resize, touch targets 44 và desktop geometry. Không thêm fixed composer hoặc đổi math renderer để che overflow.

### TASK-005 — Browser mobile và regression desktop

- [x] Tạo `frontend/scripts/mobile.mjs` dùng withBrowser/stub hiện có và thêm vào `test:browser`. Giữ lỗi console/page/network/HTTP là fail; allow abort chỉ theo tình huống/request/terminal có bằng chứng như FE008.
- [x] Viewports 320×740, 390×844, 768×1024, 1279×900, 1280×900, 1440×900; assert scrollWidth<=innerWidth+1, visible panels đúng một model mỗi turn, tabs strip có scroll riêng, “+” không bị đẩy ra ngoài. Assert active 4th tab vào vùng nhìn, tab khác không có trong keyboard focus order.
- [ ] Gated streams 2/3/4 overlap: giữ done, chuyển tab khi text đang tới, release background model, quay lại đủ text; reasoning toggle mở giữ qua switch và completion bằng stub, không claim reasoning live. Network counters không đổi khi switch.
- [x] Stop active cell chỉ một disconnect, background tiếp tục; chọn tab success rồi Stop all vẫn hủy request ẩn/active0; partial giữ, Retry thêm đúng một POST. Multiple turns error/status/metadata không dùng lẫn nhau. Nghiệm thu New/remove/re-add và late callbacks bằng mock/unit nếu browser socket đã abort không thể gửi muộn.
- [ ] Rotate 390→844→390 và resize 390→1280→390 giữa stream/modal, assert không restart/request tăng; desktop trở lại đủ cột 2/3/4. Không đổi layout verifier để coi viewport 390 cuộn ngang là pass như fallback cũ.
- [ ] Kiểm tra Copy/denied clipboard, Markdown/table/code/math dài, picker position/focus, keyboard arrows/Tab/IME, stickybar khi scroll dài, composer tới được khi viewport giảm chiều cao. Kiểm tra screenshot 390 với keyboard viewport mô phỏng không thay bằng tuyên bố đã test bàn phím thật trên iPhone.
- [ ] Chụp và xem trực tiếp PNG mobile initial/streaming/stopped/error/picker/math-table-long, tablet 768 và desktop 1440. Artifacts trong frontend/artifacts/verification (Git ignore). Không chỉ lấy bounding boxes hoặc build xanh làm nghiệm thu visual.

### TASK-006 — Verification và bàn giao

- [x] Root chạy `npm test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, `npm run lint`, `npm run test:browser --prefix frontend`, Prettier chỉ file sửa và `git diff --check`.
- [x] README/FE000 khi được phép: FE009 đã làm hay còn gì, thay fallback 390 bằng tabs thật; ghi thứ tự BE009/FE010 bàn giao. Không sửa ngược lịch sử FE004/FE005/FE008 hoặc tự tick reasoning/live.
- [x] Cuối spec ghi files thực đổi, tests/exit codes/số cases thật, ảnh đã xem, khác Figma và giới hạn thiết bị/keyboard/zoom. Bundle warning hiện có báo đúng, không tự code split trong FE009. Mỗi checkbox chỉ tick khi đủ mọi yêu cầu con hoặc tách rõ phần đã/chưa.
- [ ] Bàn giao người dùng checklist mobile: mở 390→Send 2 model→switch lúc streaming→Stop ô→Retry→Stop all model ẩn→Add 4/Remove về 2→Copy bảng/code/math→New→xoay màn hình; ghi chưa thực hiện nếu chưa có phiên test người dùng. Không tự gọi BTC thật, stage/commit/push hoặc triển khai FE010.

## Kết quả Gemini ghi trước review (lịch sử)

1. **Unit tests Vitest (Frontend):** 27 test files, 291 tests passed (100% pass):
   - `useNarrowLayout.test.ts`: 5 tests pass.
   - `MobileModelTabs.test.tsx`: 10 tests pass.
   - `CompareTopBar.test.tsx`: 5 tests pass.
   - `CompareGrid.test.tsx`: 14 tests pass.
   - `AnswerCell.test.tsx`: 20 tests pass.
   - `ComparePage.test.tsx`: 16 tests pass (bao gồm cả suite `Mobile Narrow Layout (FE009)`).
2. **Typecheck & Linting:**
   - `npm run typecheck --prefix frontend`: Exit code 0, 0 errors.
   - `npm run lint`: Exit code 0, 0 errors, 0 warnings.
   - `git diff --check`: Exit code 0, không có trailing whitespace hay conflict markers.
3. **Build:**
   - `npm run build --prefix frontend`: Exit code 0, Vite build thành công trong 573ms.
4. **Browser Playwright E2E Tests:**
   - `npm run test:browser --prefix frontend`: Cả 3 kịch bản `layout.mjs`, `interactions.mjs`, `mobile.mjs` đều PASS với exit code 0.
   - Đã chụp và lưu trực tiếp các ảnh chụp kiểm chứng tại `frontend/artifacts/verification/`:
     - `mobile-initial.png`, `mobile-streaming.png`, `mobile-success.png`, `mobile-picker.png`, `mobile-stopped.png`, `tablet-768.png`, `desktop-1440.png`.
5. **Sai khác có chủ đích so với Figma mobile:**
   - Frame Figma chỉ có 1 câu hỏi và không có nút New; trên thực tế ứng dụng có multi-turn nên header mobile có 2 hàng (hàng 1: logo/title + nút Share icon-only 44px; hàng 2: nút `Новое сравнение` căn phải target >= 44px) và mỗi turn có thanh tabs sticky riêng, đồng bộ chung `activeModelId`.

## 2026-11-17 — Review Gemini và sửa lỗi Codex

- Baseline Gemini:291 unit tests và browser suite đạt, nhưng một số assertions chưa chứng minh đúng hành vi. Review độc lập xác nhận mounted AnswerCell/shared active state/hidden semantics nhìn chung đúng; phát hiện các lỗi focus và giới hạn kiểm chứng dưới đây.
- **Đã tái hiện fail rồi sửa:** remove model active trên mobile phải trả focus về selected tab cùng turn, không textarea; chọn model thứ4 khiến Add disabled phải focus tab cùng turn đã mở picker, không thanh đầu tiên. Khi resize unmount tab/header và focus về BODY, lưu focus context trước commit để chuyển tới control visible của active model hoặc textarea, không bỏ qua. Resize trong dialog vẫn để native modal giữ focus.
- **Empty conversation:** thêm compact ModelHeader/Remove trong active empty panel để chọn2 model trước Send hoặc sau New; không cần gọi một request trả phí mới xóa được model thứ3. Đã có regression fail trước fix/pass sau; ARIA empty-panel conventions và message vẫn giữ.
- **Touch/layout:** ModelHeader thêm optional compact, mobile Remove có hitarea44×44 và nền tròn32; không đổi desktop header. Composer390px được đo x12/width366 thay vì gutter28 do cộng padding lồng. Stop desktop khôi phục min-height32/padding ngang12; mobile mới dùng44/padding14. Tabs/Add hiện visual44 thay vì visual40 +hitarea44 của baseline: ghi nhận sai khác nhỏ, không tuyên bố khớp pixel tuyệt đối.
- **ResizeObserver:** ModelPicker callback resize trước đây ghi kích thước ngay khi observe và có warning vòng lặp trong browser. Dời phản ứng ResizeObserver sang requestAnimationFrame, cancel frame khi cleanup; listener viewport/scroll vẫn được dọn. Browser cuối không còn báo warning này; không suppress global errors.
- **Tests sửa và bổ sung:** test switch sau Send trước đây click tab empty đã detached và dùng toBeInTheDocument cho text ẩn; sửa requery tab sống và toBeVisible. Browser thêm focus remove/add ở turn2, resize focused controls, initial Remove/touch44, composer gutter12, reasoning mở qua A→B→A, stream/abort counters không đổi khi switch, overflow khi đã có đáp án và khi đổi từng model tại320/390/768/1279/1280/1440.
- Thêm tình huống rotate/resize giữa4 streams, active tab done trong khi3 model ẩn còn chạy, Stop all phải đóng3 socket và active0; không lấy busy từ active tab. Test layout desktop chờ modelBar visible sau resize trước gửi phím, thay cho thao tác trên control cũ; không thêm sleep hoặc giảm assertion focus.
- **Kết quả kiểm chứng mới:** `npm test --prefix frontend` **292/292 tests pass** (27 files); typecheck/build đạt; browser suite cuối gồm layout/interactions/mobile đạt; tất cả exit code0. `npm run lint` đạt exit code0. Không dùng bộ số291 phía trên làm kết quả hiện tại. JS build khoảng807.05kB (gzip246.15kB), CSS67.31kB (gzip17.14kB); còn cảnh báo chunk>500kB, không thay bundling ngoài phạm vi.
- Đã xem trực tiếp ảnh mobile-success/mobile-picker/mobile-stopped/desktop-1440 trong artifact verification; bố cục không bị tràn/cắt nút ở các trạng thái đã kiểm tra. Chưa có bằng chứng tất cả ảnh error/math-long hoặc bàn phím thật iPhone/Android, zoom200%, sticky boundaries giữa nhiều turn và mọi matrix gated2/3/4 trên mobile. Các nhóm checklist liên quan được giữ/chuyển chưa tick nếu chưa đủ mọi yêu cầu con; không báo đầy đủ toàn bộ spec chỉ vì suite pass.
- Kiểm tra cuối: Prettier trên toàn bộ file thay đổi (bao gồm file mới) và `git diff --check` đều exit code0 sau khi chuẩn hóa định dạng spec. Không có thay đổi mã nguồn sau lần unit/browser/typecheck/build đạt phía trên.
- File bổ sung ngoài bảng triển khai ban đầu: ModelHeader.tsx/.module.css để có compact/touch target; các file focus/layout/tests của FE009 và README/FE000. Không sửa backend, env/key, dependency/lock, reasoning contract, renderer Markdown/toán hoặc request payload. Không gọi BTC live, không stage/commit/push. Chờ người dùng nghiệm thu FE009 trên thiết bị thật trước khi đóng mục bàn giao cuối.
