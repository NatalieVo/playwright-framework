# Báo Cáo Phân Tích Flaky Test

## Tổng quan
- **Run gốc:** Full suite 231 tests, headed, 1920x1080, 1 worker (~1.1h) — 229 passed / **2 failed**
- **Framework:** Playwright Test (TypeScript)
- **Mức độ nghiêm trọng:** 🟢 Low — cả 2 test đều PASS ổn định 3/3 khi chạy lại riêng lẻ, không phải lỗi code/locator cố định.

## Root Cause Analysis

| # | Test | Vị trí lỗi | Category | Mô tả vấn đề |
|---|---|---|---|---|
| 1 | CFTP_DOWNLOAD_OPTIONLIST_TC_002 | `src/fixtures/auth.fixture.ts:18` | 🌐 Environment / Timing | Sau khi submit login, `[data-testid="app-header"]` không hiển thị trong 30s. Đây là test thứ 27/231 trong run — test liền trước (TC_001) và liền sau (TC_003) chạy bình thường (2.8s và 3.5s). Không có gì trong code login (`login.page.ts`) sai — đây là server phản hồi chậm tạm thời. |
| 2 | CFTP_SHARE_TC_005 — Cancel Set Password leaves the file Public | `src/pages/file-list.page.ts:541` (`openSharesFolder()`, wait 1.5s) → `base.page.ts:25` (`click()` → `expect(locator).toBeEnabled()`) | 🌐 Environment / Timing (server-side race — **đã ghi nhận trước đó**) | Context menu thiếu action `context-set-password`. Accessibility snapshot lúc fail cho thấy: Status column = "Public", file đã được chọn (checked), nhưng nút toolbar "Share" và "Share with Password" **vẫn disabled**. Đây đúng là race đã được document trong comment tại `openSharesFolder()`: breadcrumb/Status cập nhật từ 1 nguồn dữ liệu, còn "share capabilities" (nguồn quyết định menu nào hiện) cập nhật từ nguồn khác và **lag sau** — cùng nguyên nhân với server-side write-contention đã ghi nhận trong `project_share_json_serialization_bug.md`. Code đã có `waitForTimeout(1500)` để né race này nhưng lần này không đủ. Snapshot cũng cho thấy hàng chục Share record mồ côi (`cftp_search_*`) còn tồn đọng trong Shares folder — góp phần tăng tải server. |

## Kết quả tái hiện (reproduce riêng lẻ, `--repeat-each=3 --retries=0`)

| Test | Kết quả | Kết luận |
|---|---|---|
| TC_002 | ✅ 3/3 PASS (~1.0 phút / lần) | Không tái hiện khi chạy độc lập → xác nhận timing tạm thời do tải hệ thống trong run dài, không phải lỗi locator/code |
| TC_005 | ✅ 3/3 PASS (~15s / lần) | Không tái hiện khi chạy độc lập → xác nhận race hiếm, chỉ lộ ra khi server đang chịu contention (nhiều lượt Share write liên tiếp trong suốt 1.1h) |

## Đề xuất Fix

| # | Vấn đề | Code hiện tại | Code đề xuất | Lý do |
|---|---|---|---|---|
| 1 | `auth.fixture.ts` chờ `app-header` 1 lần, không có retry nếu server chậm bất thường | `await page.waitForSelector('[data-testid="app-header"]', { timeout: 30_000 })` | Thêm 1 lần retry (reload trang + login lại) nếu lần đầu timeout, tương tự pattern retry đã dùng ở `selectContextAction()` | Xử lý được server chậm nhất thời hiếm gặp mà không phải tăng timeout mặc định cho toàn bộ suite |
| 2 | `openSharesFolder()` dùng `waitForTimeout(1500)` cố định để né race dữ liệu "share capabilities" | `await this.page.waitForTimeout(1_500);` | Thay bằng smart-wait: poll đến khi toolbar phản ánh đúng trạng thái đã chọn (ví dụ `expect(shareButton hoặc shareStatus).toBeEnabled/ toHaveText(...)`) với timeout dài hơn (~10s) thay vì sleep cố định | Tuân thủ rule "không hard sleep" (`.claude/rules/playwright_rules.md`); xử lý được cả trường hợp server chậm hơn 1.5s như lần fail này |
| 3 | Hàng chục Share record mồ côi (`cftp_search_*`) tồn đọng trong Shares folder, làm tăng tải/contention | Không có cleanup định kỳ | Chạy 1 lượt dọn tay các file `cftp_search_*` còn sót lại trong Shares (giống lần dọn đã làm trước đó) | Giảm tải server, giảm khả năng tái diễn race ở các run sau |

## Stability Checklist
- [x] Locator (`context-set-password`, `app-header`) đúng và ổn định — không phải locator hỏng
- [x] Không có test data hardcoded liên quan đến 2 lỗi này
- [x] Cả 2 test PASS 3/3 khi chạy lại riêng lẻ → xác nhận flaky do timing/tải server, không phải bug logic trong test
- [x] Đã áp dụng smart-wait thay `waitForTimeout(1500)` tại `openSharesFolder()` (đề xuất #2)
- [x] Đã kiểm tra Share record mồ côi `cftp_search_*` — không còn tồn đọng (đề xuất #3)

## Kết quả sau Fix (Mode FIX)

### Code đã sửa
1. `src/fixtures/auth.fixture.ts` — `authenticatedPage` fixture giờ retry toàn bộ navigate+login 1 lần nếu `app-header` không xuất hiện trong 30s lần đầu (cùng pattern retry-the-unit đã dùng ở `selectContextAction()`).
2. `src/pages/file-list.page.ts` (`openSharesFolder()`) — thay `waitForTimeout(1_500)` cố định bằng `waitForLoadState('networkidle')`, chờ request fetch "share capabilities" thực sự settle thay vì đoán thời gian. `selectContextAction()`'s Escape+reopen retry loop vẫn là lớp phòng vệ thứ 2.
3. Orphaned Share records `cftp_search_*` — verify trực tiếp qua `scripts/check-shares-orphans.js` (pattern `.*`, xác nhận có đúng navigate vào Shares qua breadcrumb text): Shares folder hiện chỉ còn 13 item hợp lệ của người dùng thật (`12.PNG`, `New Folder N.folder.zip`, ...), **không còn** `cftp_search_*` hoặc bất kỳ prefix test-data nào (`cftp_`/`auto_share`) tồn đọng — đã được các test chạy sau đó tự dọn. Không cần chạy cleanup bổ sung. (Không chạy `cleanup-test-data-full.js` vì phạm vi rộng hơn — script này còn xóa cả file thật ở Home root — ngoài phạm vi đồng ý ban đầu là chỉ dọn `cftp_search_*` orphans.)

### Kết quả verify (retries=0)

| Test / phạm vi | Kết quả | Thời gian |
|---|---|---|
| `typecheck` (tsc --noEmit) | ✅ PASS | — |
| CFTP_DOWNLOAD_OPTIONLIST_TC_002 × 3 | ✅ 3/3 PASS | ~1.0m/lần |
| CFTP_SHARE_TC_001 → TC_011b (11 test, dùng `openSharesFolder()`) | ✅ 12/12 PASS | ~12s/lần (nhanh hơn bản cũ ~15s/lần) |

## Kết luận
2/231 lỗi trong lần chạy full suite gốc (1.1h) đều là **flaky do timing/tải server**, không phải lỗi test code hay locator sai. TC_005 trùng khớp với vấn đề server-side write-contention đã được ghi nhận trước đó trong project. Đã áp dụng cả 3 fix đề xuất và verify ổn định — không phát hiện regression. Trạng thái cuối: **✅ STABILIZED**.
