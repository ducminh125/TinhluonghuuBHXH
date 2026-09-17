# VN Social Insurance Benefits Calculator v3.14

Web thương mại hóa để **ước tính 4 nhóm quyền lợi**:
- lương hưu;
- BHXH một lần;
- trợ cấp thất nghiệp;
- chế độ thai sản.

Hệ thống dùng Supabase cho tài khoản/database, payOS cho VietQR + webhook thanh toán, và ShopAIKey chỉ cho hồ sơ ảnh/PDF cần model. Phép tính quyền lợi do engine quy tắc trong source thực hiện, không giao cho AI tự quyết định số tiền.

> Kết quả là tham khảo/mô phỏng. Kết quả chính thức phụ thuộc dữ liệu cơ quan BHXH, hồ sơ thực tế và văn bản có hiệu lực tại thời điểm giải quyết.




## Mới trong v3.14 — Privacy & Terms hoàn chỉnh

- Hoàn thiện `privacy.html` và `terms.html` để dùng production; bỏ toàn bộ placeholder/bản mẫu.
- Công khai Đơn vị cung cấp: **Đức Minh**; liên hệ **Đức Minh — 0383355188**.
- Bổ sung nội dung về dữ liệu cá nhân, file/ảnh & AI, nhà cung cấp bên thứ ba, lưu giữ dữ liệu, quyền người dùng, thanh toán, sự cố giao dịch, giới hạn trách nhiệm và giải quyết tranh chấp.
- Không thay đổi database, payOS, quota hoặc công thức tính.

## Mới trong v3.13 — sửa đọc ảnh, mặc định BHXH một lần, Google/Facebook OAuth

- Sửa lỗi nhánh cleanup của `/api/import` có thể che lỗi AI thật và làm frontend chỉ nhận `INTERNAL_ERROR`.
- Vision: Gemini 2.5 Flash → Gemini 2.5 Pro native fallback → fallback tổng quát; batch ảnh mặc định 2.
- Lý do BHXH một lần `Có thời gian đóng trước 01/07/2025, sau 12 tháng không tiếp tục đóng và chưa đủ 20 năm` được đưa lên đầu và chọn mặc định.
- Bổ sung Facebook OAuth bên cạnh Google cho người dùng và admin; provider chưa bật sẽ tự khóa nút.
- `/api/health` trả `version: 3.13.0`, `facebookAuthEnabled` và `socialAuthProviders`.
- Không có migration database mới.

Xem `SOCIAL-LOGIN-SETUP.md` để cấu hình Google/Facebook.

## Mới trong v3.12 — làm rõ điều kiện thai sản theo đúng trường hợp

- Không còn hiển thị 4 checkbox đặc biệt cùng lúc. Chỉ hiện dữ kiện liên quan đến **trường hợp thai sản đang chọn**.
- **Lao động nữ sinh con:** dùng một trường “Tình trạng trước khi sinh” với 3 lựa chọn loại trừ nhau: thông thường; phải nghỉ việc để dưỡng thai theo chỉ định; phải nghỉ việc để điều trị vô sinh. Engine tự áp dụng lần lượt điều kiện 6/12 tháng, 12 tháng trước đó + 3/12 tháng, hoặc 6/24 tháng.
- **Lao động nam có vợ sinh con:** chỉ hiện các dữ kiện ảnh hưởng trực tiếp đến kết quả: vợ sinh phải phẫu thuật; sinh con dưới 32 tuần tuổi; mẹ không đủ điều kiện hưởng thai sản. Hệ thống tự kiểm tra thời gian đóng của cha để tính trợ cấp một lần.
- Tách “vợ sinh phải phẫu thuật” và “sinh con dưới 32 tuần tuổi” để không áp dụng nhầm quy tắc 14 ngày của sinh đôi phải phẫu thuật cho trường hợp chỉ sinh non.
- Các trường số tháng đóng 12/24 tháng, tổng thời gian đã đóng, tuổi thai, số ngày nghỉ và khối tiền lương được **ẩn/hiện theo ngữ cảnh**, giảm dữ liệu thừa và tránh người dùng tick nhầm.
- Giữ tương thích với payload cũ (`pregnancyLeave`, `infertilityTreatment`, `fatherLumpEligible`, `surgeryOrUnder32`) để không làm gián đoạn các request cũ trong lúc trình duyệt còn cache.
- Không thay đổi database schema, payOS hoặc hệ thống lượt sử dụng.


## Mới trong v3.11 — kiểm tra điều kiện hưởng trước khi trừ lượt

- **BHXH một lần:** kiểm tra điều kiện theo từng lý do trước khi tính. Trường hợp có thời gian đóng trước 01/07/2025, ngừng tham gia đủ 12 tháng chỉ được tính khi tổng thời gian đóng **chưa đủ 20 năm**. Các lý do khác như ra nước ngoài định cư hoặc bệnh/suy giảm thuộc diện luật định được kiểm tra theo điều kiện riêng, không áp dụng máy móc ngưỡng 20 năm.
- **Đủ tuổi nhưng xin BHXH một lần:** kiểm tra ngày sinh/giới tính và yêu cầu thời gian đóng **chưa đủ 15 năm** theo Luật BHXH 2024.
- **Trợ cấp thất nghiệp:** bổ sung kiểm tra đang đóng BHTN, chấm dứt việc làm đúng pháp luật, đủ 12 tháng trong cửa sổ 24/36 tháng, nộp hồ sơ trong 03 tháng và không thuộc trường hợp loại trừ sau 10 ngày làm việc.
- **Thai sản:** khóa điều kiện cho trường hợp sinh con, dưỡng thai, điều trị vô sinh, cha nghỉ khi vợ sinh, khám thai, thai nghén và biện pháp tránh thai. Giao diện mô tả rõ 4 trường hợp đặc biệt.
- **Không trừ lượt khi không đủ điều kiện:** backend trả `422 BENEFIT_NOT_ELIGIBLE` / `PENSION_NOT_ELIGIBLE` trước khi gọi `consumeCredit`. Giao diện chỉ thông báo lý do, không hiển thị số tiền và không tạo nút lưu lịch sử.
- Không thay đổi database schema, payOS hoặc Environment Variables.


## Mới trong v3.10 — bộ lọc quản trị chi tiết

- **Đơn hàng:** có tra cứu chung và lọc riêng theo mã thanh toán, tài khoản, gói, khoảng số tiền, khoảng ngày và trạng thái.
- **Hiệu năng đọc hồ sơ:** có tra cứu chung và lọc theo tài khoản, parser/kiểu xử lý, model, khoảng thời gian xử lý, khoảng ngày và trạng thái.
- Kết quả sau lọc tiếp tục phân trang **10 bản ghi/trang** ở backend.
- Tra cứu tài khoản hỗ trợ email, tên hoặc mã tài khoản.
- Không thay đổi database schema, công thức, quota hay thanh toán.

## Mới trong v3.9 — hoàn thiện UI/UX

- Giao diện công cụ được thiết kế lại theo hướng thân thiện, chuyên nghiệp, ít chữ và rõ thứ tự thao tác hơn.
- 4 chế độ được đưa vào thanh chọn rõ ràng; trên mobile chuyển sang cuộn ngang để tiết kiệm không gian.
- Phần nhập hồ sơ tự động được tinh gọn; hướng dẫn chi tiết chuyển vào mục mở rộng khi người dùng cần.
- Sidebar pháp lý dài được thay bằng hướng dẫn 3 bước và cơ sở tính dạng thu gọn.
- Chuẩn hóa card, form, button, trạng thái focus, popup, thanh toán và khu vực tài khoản theo cùng hệ thống thị giác.
- Các thông báo dành cho người dùng cuối không còn nhắc các thuật ngữ hạ tầng như Supabase/Vercel/backend.
- Không thay đổi công thức, quota, lịch sử, payOS hay database schema.

## Mới trong v3.8

- **Google OAuth an toàn hơn:** backend kiểm tra trạng thái Google Provider từ Supabase trước khi cho phép bấm đăng nhập. Nếu Google chưa được bật, nút Google bị vô hiệu hóa thay vì chuyển người dùng tới lỗi JSON `Unsupported provider`.
- **Tài khoản của tôi gọn hơn:** bỏ nút “Mua thêm lượt” trong popup; lịch sử và đơn hàng nằm trong hai khung cuộn, mỗi khung chỉ chiếm khoảng 05 dòng trên màn hình. Nút mua lượt ở header vẫn giữ nguyên.
- **Admin phân trang thật ở server:** tài khoản, đơn hàng và log đọc hồ sơ đều tải 10 bản ghi/trang. Tài khoản có ô tra cứu theo email, mã tài khoản hoặc tên.
- `/api/health` và `/api/config` trả thêm trạng thái `googleAuthEnabled` để kiểm tra nhanh cấu hình Google.

> Lưu ý: code chỉ có thể **phát hiện** Google Provider đang bật/tắt. Để đăng nhập Google hoạt động thật, bạn vẫn phải bật Google trong Supabase Dashboard và nhập Google Client ID/Client Secret.

## 1. Các tab tính v3.7

### Lương hưu
Giữ toàn bộ engine v3.6: tuổi nghỉ hưu, quá trình đóng, phụ cấp tính đóng, mức bình quân, tỷ lệ hưởng, dự báo đến nghỉ hưu và trường hợp nghỉ trước tuổi.

### BHXH một lần
Dùng **chính quá trình đóng BHXH đã nhập/đọc file**. Công thức chính:
- trước 2014: 1,5 tháng mức bình quân/năm;
- từ 2014: 2 tháng mức bình quân/năm;
- tháng lẻ trước 2014 chuyển sang giai đoạn từ 2014 nếu có cả hai giai đoạn;
- dưới 1 năm: cần tổng tiền đã đóng thực tế, tối đa 2 tháng mức bình quân.

Nếu có thời gian BHXH tự nguyện, công cụ cảnh báo phần hỗ trợ của ngân sách cần được loại khỏi mức hưởng, trừ trường hợp pháp luật cho phép.

### Trợ cấp thất nghiệp
Tab này mô hình hóa Luật Việc làm 2025 **cho trường hợp từ 01/01/2026**:
- 60% bình quân tiền lương đóng BHTN 6 tháng gần nhất;
- tối đa 5 lần lương tối thiểu vùng;
- 12–36 tháng đóng = 3 tháng hưởng; cứ thêm đủ 12 tháng = +1 tháng; tối đa 12 tháng.

### Thai sản
Hỗ trợ các trường hợp phổ biến:
- lao động nữ sinh con;
- lao động nam có vợ sinh con;
- khám thai;
- sảy thai/phá thai/thai chết/thai ngoài tử cung;
- đặt dụng cụ tránh thai;
- triệt sản;
- trợ cấp thai sản BHXH tự nguyện khi sinh con.

Các trường hợp mang thai hộ, nhận con nuôi và hồ sơ đặc biệt chưa được tự động hóa toàn bộ; cần đối chiếu hồ sơ thực tế.

## 2. Đồng bộ lượt sử dụng

Tên hiển thị thương mại:
- **Lượt nhập thủ công** → cột DB `direct_credits`;
- **Lượt nhập bằng file/ảnh tự động** → `file_credits`;
- **Lượt lưu lịch sử** → `history_credits`.

Quy tắc:
1. Phép tính thủ công hợp lệ của bất kỳ tab nào → trừ 1 lượt nhập thủ công.
2. File/ảnh chỉ trừ 1 lượt khi đã đọc được ít nhất một giai đoạn hợp lệ; lỗi trước đó không mất lượt.
3. Dữ liệu quá trình đã đọc bằng file/ảnh có thể dùng tiếp cho lương hưu và BHXH một lần mà không trừ thêm lượt thủ công.
4. Mỗi lần người dùng chủ động lưu kết quả → trừ 1 lượt lưu lịch sử.

Tài khoản mới vẫn mặc định `3 / 0 / 3` như schema hiện tại.

## 3. Lịch sử

`calculation_history` được dùng chung cho cả 4 chế độ. Không thêm cột mới: loại kết quả được lưu trong `input_json.benefitType` và `result_json.benefitType` để tương thích database v3.6.

Người dùng có thể `Tra cứu` lại từng bản lưu, xem các chỉ tiêu chính và xóa bản lịch sử của chính mình.

## 4. Admin

`/admin` hỗ trợ:
- xem tài khoản, số lượt, khóa/mở tài khoản;
- cộng lượt thủ công;
- **thêm/sửa/bật-tắt/xóa gói**;
- xem đơn hàng;
- xác nhận thanh toán thủ công khi cần;
- **hủy đơn đang chờ**;
- với payOS: đối soát trước khi hủy để không hủy nhầm đơn đã trả tiền;
- theo dõi parser/model/thời gian đọc hồ sơ.

Khi xóa một gói, đơn hàng cũ vẫn được giữ nhờ snapshot tên gói, số tiền và số lượt trong bảng `orders`.

## 5. Thanh toán payOS

Luồng:

```text
Chọn gói
→ tạo đơn pending
→ payOS tạo VietQR động
→ QR hiển thị ngay trong web
→ ngân hàng ghi nhận tiền
→ payOS webhook
→ xác minh chữ ký + số tiền + đơn
→ pending → paid
→ tự cộng lượt
```

Webhook/polling đều dùng cơ chế idempotent để không cộng lượt hai lần.

## 6. Đọc hồ sơ

- Excel BHXH có cấu trúc → parser trực tiếp, không dùng AI.
- Ảnh/PDF scan → Gemini Flash tuyến nhanh.
- Ảnh/PDF scan: Gemini 2.5 Flash → Gemini 2.5 Pro native vision fallback → fallback tổng quát.
- File lỗi/timeout không làm mất lượt; nếu lỗi kỹ thuật xảy ra sau charge thì backend hoàn lượt.

Mặc định:

```env
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_VISION_FALLBACK_MODEL=gemini-2.5-pro
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
```

## 7. Environment Variables

```env
SHOPAIKEY_API_KEY=...
SHOPAIKEY_BASE_URL=https://api.shopaikey.com/v1
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_VISION_FALLBACK_MODEL=gemini-2.5-pro
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
AI_FAST_TIMEOUT_MS=45000
AI_VISION_FALLBACK_TIMEOUT_MS=35000
AI_FALLBACK_TIMEOUT_MS=45000
AI_IMAGE_BATCH_SIZE=2
AI_BATCH_CONCURRENCY=2

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

ADMIN_EMAILS=admin@example.com
APP_URL=https://tinhluonghuu-bhxh.vercel.app

PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYOS_PAYMENT_EXPIRY_MINUTES=30
PAYOS_TIMEOUT_MS=12000
```

Secret keys chỉ đặt phía server/Vercel; không commit GitHub và không đưa vào HTML/JS frontend.

## 8. Database

Nếu nâng cấp từ v3.6 đang chạy bình thường thì **v3.7 không bắt buộc chạy SQL migration mới**.

Bản cài mới có thể dùng `supabase/schema.sql`; các migration cũ được giữ để tham chiếu/nâng cấp tuần tự.

## 9. Chạy local

Node.js 20+:

```bash
npm install
cp .env.example .env
npm start
```

- Công cụ: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`
- Health: `http://localhost:3000/api/health`

## 10. Deploy

Khuyến nghị:
- GitHub: source control;
- Vercel/Render/Fly: Node backend;
- Supabase: Auth + Postgres;
- payOS: QR/webhook;
- ShopAIKey: AI gateway.

Xem `DEPLOY-V3.13.md`.

## 11. Kiểm thử

```bash
npm test
```

Bản đóng gói v3.11: **72/72 test PASS**.

## 12. File chính

```text
index.html
admin.html
styles.css
js/
  account.js
  admin.js
  app.js
  benefits.js
  benefits-ui.js
  contributions.js
  pension.js
  rules.js
  salary-scales.js
server/
  index.js
  payos.js
  parsers.js
  shopaikey.js
  structured-bhxh.js
  supabase.js
supabase/
tests/
```
