# FE007 - Thời gian · chi phí và sửa hộp thêm model (phần bổ sung)

## Goal

Hiển thị đúng mẫu **thời gian · chi phí**, không có số token; đồng thời sửa hộp thêm model theo ảnh người dùng. Phần hộp chọn model là **phạm vi bổ sung theo yêu cầu ngày 2026-11-14**, không phải lỗi cần sửa trong backend.

**Trạng thái:** đã triển khai và nghiệm thu local ngày 2026-11-14; chưa chạy live chi phí với BTC. Pattern: [F000](F000-pattern.md). Agent thực hiện code/review/sửa sau này: **Codex (agent hiện tại)**. Turn này chỉ tạo hai spec BE007/FE007, không sửa code hoặc roadmap. Tuân thủ AGENTS.md; khi được giao code, đọc FE006/source và [BE007](BE007-response-cost.md), áp dụng TDD/verification/karpathy/ponytail, không tạo plan kiến trúc khác hoặc dependency.

**Thứ tự:** BE007 trước để chốt costUsd, FE007 sau để nghiệm thu toàn luồng local. Phần modal có thể phát triển/test độc lập, nhưng không vì vậy đổi contract giá. Không yêu cầu người dùng cung cấp lại key/model thật để test.

## User Story

Là người dùng, tôi muốn nhìn thời gian và chi phí của câu trả lời như thiết kế, và thêm model bằng hộp tìm kiếm đúng mẫu, để giao diện nhất quán mà không có thông số thừa.

## Scope

### In — Phần chính: thời gian · chi phí

- Nhận `costUsd` do BE007 tính, format thành USD với dấu phẩy thập phân như ảnh mẫu `1,8 с · $0,0016`.
- Cost là ước tính chuẩn, có giải thích qua title/accessible label; không thêm hàng dữ liệu hoặc số token. Không tính giá lại ở frontend.
- Dữ liệu thiếu/invalid không mất câu trả lời, không fake cost0; mỗi response/Retry có giá riêng, không cộng tổng hội thoại.

### In — PHẦN BỔ SUNG: sửa hộp thêm model theo ảnh

- Ảnh người dùng ngày 2026-11-14 là tham chiếu trực quan: panel tối dưới vùng Add, title trái, nút X tròn phải, search có kính lúp, từng hàng model name/provider bên trái và dấu cộng bên phải, nền nổi bật khi hover/focus, footer nhắc tối đa4 model.
- Sửa vị trí/kích thước/spacing/typography/trạng thái của ModelPicker; giữ native modal semantics, keyboard/Escape, search và giới hạn model của FE006.
- Dùng catalog thật, không đổi tên/ID thành GPT-4o/Gemini/DeepSeek từ ảnh. Tên trong ảnh chỉ là ví dụ thiết kế.

### Out

- Không số token, usage, bảng giá hoặc quota UI; không biểu đồ/tổng chi phí/currency selector hay màn hình settings.
- Không backend/source proxy, env/SDK/dependency, streaming/Stop/reasoning, mobile redesign, persistence/Share thật.
- Không chỉnh toàn bộ design system hoặc đổi panel thành thư viện popover mới; không sao chép toàn ảnh làm bitmap, không làm menu chỉ bằng CSS mất keyboard/modal behavior.

### Tham chiếu thiết kế và mức chính xác

- Ảnh metadata người dùng: chỉ `1,8 с · $0,0016`, không có token hoặc tiền tố ≈ trong dòng hiển thị.
- Ảnh picker gửi cùng yêu cầu: tệp đính kèm `codex-clipboard-ac09bb95-ed00-4fb6-ac72-0cd0a4aa18f4.png`. Vị trí tạm thời tại thời điểm soạn: `C:/Users/phamd/AppData/Local/Temp/codex-clipboard-ac09bb95-ed00-4fb6-ac72-0cd0a4aa18f4.png`; không hardcode đường dẫn này vào code/test.
- Figma đang dùng trong dự án: file `tUMuB5lsAJ9gBPuQ6bJIQB`, kit `2608:2201`, desktop `2609:2229`. Khi triển khai, đọc design context cho picker nếu có quyền truy cập, theo skill Figma tương ứng; số đo xác minh từ Figma ưu tiên số ước lượng dưới đây, ghi rõ sai khác trong spec, không tự đổi nội dung/hành vi đã chốt.
- Ảnh là crop có thể đã zoom; không coi kích thước pixel của file đính kèm là CSS px chính xác. Các số dưới là baseline triển khai khi chỉ có ảnh, không tuyên bố đo từ Figma: panel rộng360px, padding14px, radius18px, header title16px/semibold, nút X36px, search44px, row56px (name16px, provider14px), footer12px. Dùng token hiện có gần nhất, giá trị cục bộ khi không có token phù hợp. Khi thay baseline bằng số Figma cần ghi nguồn/đối chiếu, không tạo token global dự phòng.

### Contract dữ liệu và format — không tự thiết kế lại

- `comparisonApi.ts`: `GenerateResponse` thêm `costUsd?: number | null`. Core modelId/text/duration vẫn validate FE006. Nếu cost absent/null → không label; nếu own number hữu hạn >=0 → giữ; nếu string/object/negative/NaN/Infinity → bỏ cost, giữ core response. Không cast cost rồi gọi toFixed. Field dư usage/pricing vẫn bỏ qua; không đưa chúng vào state.
- `ResultAnswer` success giữ `costLabel?: string` hiện có, không thêm field token. Page format cost từ từng response rồi gán optional costLabel, không lấy giá hiện tại trong ModelPicker hoặc catalog để tính lại lịch sử.
- Thêm helper pure `frontend/src/features/compare/formatCost.ts` với `formatCostUsd(value: number | null | undefined): string | undefined`. Không fetch/mutate, không nhận model/token.

| costUsd                | Label                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| undefined/null/invalid | undefined, chỉ thời gian, không dấu · thừa                                                                  |
| 0                      | `$0,0000`                                                                                                   |
| 0.0016                 | `$0,0016`                                                                                                   |
| >0 và <0.0001          | `< $0,0001` để không giả chi phí bằng0                                                                      |
| >=0.0001               | `$` + `toLocaleString('ru-RU', { useGrouping: false, minimumFractionDigits: 4, maximumFractionDigits: 4 })` |

- Không format tiền bằng Intl style currency đặt USD ra sau. Backend không round, frontend round tại display. `durationLabel` giữ FE006 (giây, tối đa2 chữ số thập phân), không tính từ thời gian browser chờ.
- AnswerCell dùng separator `·` chỉ nếu có costLabel; span chi phí có title và aria-label thông báo ước tính, ví dụ `Оценочная стоимость: $0,0016. Стандартные тарифы; кэш и специальные тарифы не учтены.` Không đổi visible label thành một dòng giải thích dài; không đưa tooltip token count lên UI. Fixture showcase costLabel cũ vẫn hoạt động.
- Pending/error không có cost/thời gian giả. Retry cập nhật đúng ô bằng response mới, New/remove/late response vẫn bị FE006 requestId guard chặn.

### PHẦN BỔ SUNG — Thiết kế và hành vi picker đã chốt

| Vùng              | Kết quả cần đạt                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container         | Panel tối, border mờ, radius/shadow theo token; không centered dialog420px với backdrop đen/blur như hiện tại                                                                               |
| Anchor            | Desktop canh cạnh phải panel với cạnh phải nút Add; top dưới label Add12px; margin viewport tối thiểu16px, clamp/flip khi thiếu chỗ                                                         |
| Header            | `Добавить модель` trái, nút X tròn phải; nút X accessible name `Закрыть`, không nút text `Закрыть` nhìn thấy như hiện tại                                                                   |
| Search            | Kính lúp trái; placeholder `Найти модель`; label ẩn `Поиск модели` giữ cho accessibility/tests; search name/provider như FE006                                                              |
| Rows              | Model name và provider hai dòng; dấu cộng bên phải. Normal nền panel, hover/focus-visible nền nổi bật như hàng đầu ảnh; không tất cả row đều là card nền xám                                |
| Footer            | Luôn hiện `В сравнении может быть до 4 моделей` dưới list, không cuộn cùng list                                                                                                             |
| Selected/disabled | Model đã chọn không bị xóa khỏi catalog, giữ disabled và có accessible description `Уже добавлена`; không badge/pill thừa làm lệch mẫu. Dấu cộng muted; ở4 model mọi row chưa chọn disabled |
| Empty/filter      | `Модели не найдены.` trong list; header/search/footer vẫn giữ                                                                                                                               |

- Giữ `<dialog>` + showModal, aria-labelledby, focus search khi mở, Tab/Shift+Tab bị native modal giới hạn, Escape/X đóng. Backdrop trong suốt, không blur/tối toàn trang để nền giống ảnh; background vẫn inert khi mở. Không đổi thành nonmodal hoặc cho phép click xuyên nền. Click backdrop đóng chỉ khi event thật sự ở ngoài bounding rect panel, không đóng khi click padding/search/row.
- Thêm optional `anchorRef?: RefObject<HTMLButtonElement | null>` vào ModelPicker; ComparePage truyền addModelBtnRef. Showcase/test thiếu anchorRef vẫn hiển thị modal giữa viewport, không cần sửa showcase chỉ để truyền ref.
- Tính vị trí khi mở và resize/scroll: lấy button rect để canh right, label span hiện có của Add để lấy bottom (fallback button.top nếu không có span). Ưu tiên panel top = label.bottom+12; nếu vượt viewport thì clamp top/max-height, flip lên trên khi có đủ chỗ. Fixed positioning/native top layer, margin0; đọc panel actual height sau layout. Không dùng bottom của toàn bộ nút Add đang kéo dài theo grid. Dọn listeners/observer/rAF khi unmount; không cập nhật state vòng lặp resize.
- Panel width min(360px, viewportWidth-32px) theo baseline hoặc số Figma đã xác minh; list tự cuộn khi catalog dài, header/search/footer không bị cắt. Long names wrap/ellipsis hợp lý, dấu cộng/X không co mất. Kiểm tra1280/1440, zoom200% và viewport thấp; không mở rộng FE009 mobile scope.
- Icon X/search/plus nhúng SVG inline đơn giản theo asset có sẵn để tránh lỗi ảnh khi offline như vừa sửa AnswerError; aria-hidden/focusable=false. Không thay shared IconButton/TextInput API chỉ phục vụ picker: có thể dùng TextInput với wrapper/icon hoặc input local có label rõ; giữ style cục bộ trong CSS module. Không duplicate SVG id giữa rows.
- Chọn model hợp lệ đóng panel và trả focus: Add nếu enabled, ngược lại textarea khi đạt4; giữ fallback FE006 vừa review. Không mở lại picker khi response ô khác cập nhật. Add tiếp tục disabled khi đủ4, không đổi yêu cầu để phục vụ test cũ.

### File scope khi được giao code

| File                                                                                   | Thay đổi                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `frontend/src/features/compare/comparisonApi.ts`, `.test.ts`                           | Optional costUsd, core/abort regression                             |
| `frontend/src/features/compare/formatCost.ts`, `.test.ts` — mới                        | Helper label và boundary tests                                      |
| `frontend/src/features/compare/ComparePage.tsx`, `.test.tsx`                           | Gán costLabel, anchorRef picker, request/race/focus regression      |
| `frontend/src/features/compare/components/AnswerCell.tsx`, `.test.tsx`                 | Dòng metadata + accessible estimate; giữ inline error icons         |
| `frontend/src/features/compare/components/ModelPicker.tsx`, `.test.tsx`, `.module.css` | PHẦN BỔ SUNG picker theo ảnh, anchoring/modal/search/icon/footer    |
| `frontend/scripts/apiStub.mjs`                                                         | Data cost null/0/float cho từng response, giữ counters/barrier      |
| `frontend/scripts/interactions.mjs`, `layout.mjs`                                      | Metadata/picker geometry/keyboard/offline regressions và screenshot |
| `README.md`, `frontend/README.md`, `specs/FE000.md`, spec này                          | Hướng dẫn, ghi phần bổ sung và kết quả nghiệm thu                   |

Không sửa backend, `.env*`, package/lockfile, global tokens, shared UI APIs hoặc fixture cũ. `types.ts` không cần đổi vì costLabel đã optional; reducer không cần biết token/cost calculation. Nếu phát hiện consumer bắt buộc sửa ngoài bảng, báo lỗi cụ thể trước mở rộng. Không xóa regression FE006, thay harness thành warn-only hoặc hardcode model trong runtime.

## Flow

1. BE007 trả response có costUsd/null; frontend validate core và normalize cost độc lập.
2. Page format label rồi resolve vào đúng ô/requestId. AnswerCell hiện đúng thời gian · giá, hoặc chỉ thời gian nếu unavailable.
3. Add mở picker theo anchor; search/filter → chọn model chưa chọn nếu dưới4 → đóng và trả focus đúng.
4. Catalog dài/empty/selected được render như thiết kế và vẫn keyboard-accessible. Tương tác picker không gọi generation hoặc refresh catalog.
5. Retry/New/remove giữ behavior FE006; không tổng hợp giá hay đổi model để có metadata.

## Edge Cases

- Backend cũ chưa có costUsd; null/0/tiny/large/invalid cost; locale không thêm grouping hoặc ký tự tiền tệ sai vị trí.
- Tiền đang chờ hoặc lỗi không lấy lại giá ô cũ; response đến sau New/remove/re-add không khôi phục giá cũ.
- Cost valid nhưng core response invalid vẫn API error. Core valid cost invalid vẫn success không giá.
- Panel mở khi scroll/resize/zoom; cột Add cao theo hội thoại không được kéo dialog xuống cuối trang.
- Đủ4 model, Add disabled: không viết browser test click Add để mở; test guard4 tại component trực tiếp hoặc mở ở3 rồi cập nhật props khi cần. Chọn model thứ4 phải focus textarea.
- Offline sau load: icon trong picker/error không request ảnh mới. Close/Escape luôn hoạt động; không dùng model/network error để làm hỏng search.
- StrictMode và response generation trong lúc picker mở không reset search/cướp focus. Keyboard focus-visible khác hover nhưng đều có nền rõ.

## Acceptance Criteria

- [x] Dòng metadata đúng mẫu thời gian · USD, không token count/usage/giá giả hoặc separator thừa.
- [x] Missing/null/invalid/zero/tiny cost theo bảng, tooltip/accessible label giải thích ước tính mà không thay đổi bố cục.
- [x] Dữ liệu cost không gây regression API core/abort/Retry/requestId guard; không tính tiền tại frontend.
- [x] PHẦN BỔ SUNG: picker theo ảnh với X tròn, search icon/placeholder, name/provider/+ và footer; không giữ badge/text Close/backdrop tối cũ.
- [x] Anchoring desktop đúng label Add, giới hạn viewport/scroll/list; baseline hoặc số Figma được ghi rõ, không claim pixel-perfect từ crop zoom.
- [x] Native modal/keyboard/Escape/X/backdrop/focus đúng, selected/limit4/empty/search giữ invariants; không phát sinh request khi mở/chọn picker.
- [x] SVG inline vẫn hiện offline; không regress Copy/IME/error icons và regression FE006.
- [x] Unit/typecheck/build/lint/browser/targeted format/diff đạt, screenshot desktop được xem và sai khác ghi rõ. Live chỉ khi người dùng cho phép riêng.

## Tasks

Triển khai sau BE007 theo TASK-001→004. Agent thực thi là Codex, không bàn giao cho Gemini theo spec này. TDD trước đổi behavior, test local/stub không cần key; báo số kiểm tra thực tế.

### TASK-001 — Metadata

- [x] API tests cost absent/null/0/positive/string/negative/nonfinite, core invalid vẫn fail; body abort FE006 vẫn pass. Implement optional field, không đọc usage/token.
- [x] Helper tests format 0,0.0016,0.00001,0.0001,1.23456,undefined/null/invalid; giữ cost0 thật và tiny khác0. Implement pure helper.
- [x] Page/AnswerCell test `1,8 с · $0,0016`, costnull chỉ `1,8 с`, zero có label, không text token/usage; accessible estimate. Retry sai thứ tự chỉ đổi đúng ô, New/late response không thêm giá cũ.

### TASK-002 — PHẦN BỔ SUNG: ModelPicker

- [x] Đối chiếu ảnh/Figma trước viết CSS; ghi rõ số đo xác minh và baseline. Unit regressions X accessible, search placeholder/label, footer, provider/+ và selected/limit4 guard; không API call khi chọn.
- [x] Implement local markup/style, inline icons và anchorRef; giữ native dialog lifecycle ổn định, listener cleanup; không đụng global UI APIs.
- [x] Unit/page test Escape/X/chọn thứ4 trả focus fallback, no-results, search by provider, catalog dài, props cập nhật khi dialog mở không mất focus/query.

### TASK-003 — Browser/visual QA

- [x] Stub cost khác nhau theo model, giá0/null/positive/tiny; test browser đúng text/số lần request, không token count. Dùng existing harness/barrier/expected-error matching, không blanket ignore console/HTTP.
- [x] Chụp picker ở1440/1280: panel anchor/viewport, X/search/hover/focus/footer; test list dài scroll, viewport thấp và zoom200%. Kiểm tra keyboard Tab/Shift+Tab/Escape, click outside vs padding, chọn thứ4, nội dung cập nhật nền không reset search.
- [x] Mở app trước, chuyển Offline rồi mở picker: icon vẫn hiện; không gọi BTC. Giữ regression inline AnswerError/Retry sau online và main-page geometry2/3/4, Copy/IME/reduced motion của FE006.
- [x] Xem trực tiếp PNG trong artifacts/verification; so ảnh người dùng/Figma nếu có, ghi sai khác hoặc giới hạn. Không ép height/pixel chỉ để test pass; không thêm PNG vào repo.

### TASK-004 — Verification/bàn giao

- [x] Frontend npm test, npm run typecheck, npm run build, npm run test:browser; root npm run lint, targeted Prettier và git diff --check. Chạy backend suite nếu contract BE007 vừa đổi chung phiên; không gọi live trong CI.
- [x] README/FE000 ghi không token UI, cost ước tính chuẩn, modal là phần bổ sung; cập nhật trạng thái gọn, không xóa lịch sử FE006. Spec này ghi tests/exit codes, screenshot/số đo đã xem, cảnh báo bundle và giới hạn estimate.
- [x] Live end-to-end không bắt buộc trong phần local: chỉ chạy request thật theo quyền người dùng cấp riêng. Không chứng minh cost đúng hóa đơn bằng output stub hoặc một lần gọi model.

### 2026-11-14 — Triển khai Codex và nghiệm thu local

- API normalize costUsd độc lập core; formatter pure xử lý missing/null/invalid/0/tiny/float theo bảng. Page dùng cost từng response, AnswerCell chỉ thời gian · giá với title/aria estimate; không UI token hoặc tự tính phí.
- PHẦN BỔ SUNG picker: dùng native dialog anchor cạnh phải Add, top dưới label12px, baseline360px/padding14/radius18; X tròn/search/+ inline, footer riêng, selected description ẩn thay badge. Backdrop trong suốt vẫn inert, Escape/X/click ngoài đóng; padding trong panel không đóng. Resize/scroll/visualViewport được dọn và clamp để list dài cuộn.
- Figma đã đọc context/screenshot desktop2609:2229 và kit2608:2201, metadata page1805:1587; chưa tìm được popup tương ứng ảnh người dùng trong context truy cập được. Dùng ảnh tham chiếu và baseline của spec; không tuyên bố số đo popup là trích từ Figma hoặc khớp pixel tuyệt đối. Icon dùng đúng SVG có sẵn, inline theo yêu cầu offline.
- TDD metadata: test cost API/AnswerCell/formatter đã fail trước implementation, sau sửa pass. Picker regression placeholder/footer/icon và focus/query props cập nhật đã có test; giữ regression FE006. Không cam kết mọi bước đã có log TDD độc lập.
- Verification cuối frontend: **23 files,197/197 tests pass**; typecheck/build exit0; root lint, targeted Prettier và git diff --check đạt. JS bundle514,93kB/gzip158,34kB còn warning >500kB.
- Browser layout/interactions đạt qua proxy Vite+HTTP stub local: metadata0/null/float, geometry2/3/4, Copy/IME, modal keyboard/focus/backdrop/padding, anchor right, list30 model ở viewport1280x360, visualViewport zoom2x bằng CDP và inline icon khi Offline. Đây là emulation zoom/pinch, không phải chứng minh mọi cấu hình browser zoom hệ điều hành.
- Đã xem ảnh picker hover, picker offline và layout metadata trong artifacts/verification. Panel tối, hàng hover, X/search/footer và dòng giá hiển thị ổn; catalog thật có thể khác tên demo trong ảnh. Không thêm screenshot vào Git.
- Chưa chạy live generation hoặc chứng minh estimate bằng hóa đơn. Checkbox live ở task cuối xác nhận tuân thủ giới hạn và báo cáo local, không có nghĩa đã gọi BTC. Không sửa production backend/env/package/lockfile, không stage/commit/push.
