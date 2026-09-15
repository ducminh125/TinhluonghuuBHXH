# VN Social Insurance Benefits Calculator v3.7

Web thương mại hóa để **ước tính 4 nhóm quyền lợi**:
- lương hưu;
- BHXH một lần;
- trợ cấp thất nghiệp;
- chế độ thai sản.

Hệ thống dùng Supabase cho tài khoản/database, payOS cho VietQR + webhook thanh toán, và ShopAIKey chỉ cho hồ sơ ảnh/PDF cần model. Phép tính quyền lợi do engine quy tắc trong source thực hiện, không giao cho AI tự quyết định số tiền.

> Kết quả là tham khảo/mô phỏng. Kết quả chính thức phụ thuộc dữ liệu cơ quan BHXH, hồ sơ thực tế và văn bản có hiệu lực tại thời điểm giải quyết.

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
- Fallback → GPT-5.6 Luna.
- File lỗi/timeout không làm mất lượt; nếu lỗi kỹ thuật xảy ra sau charge thì backend hoàn lượt.

Mặc định:

```env
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
```

## 7. Environment Variables

```env
SHOPAIKEY_API_KEY=...
SHOPAIKEY_BASE_URL=https://api.shopaikey.com/v1
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
AI_FAST_TIMEOUT_MS=45000
AI_FALLBACK_TIMEOUT_MS=45000
AI_IMAGE_BATCH_SIZE=4
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

Xem `DEPLOY-V3.7.md`.

## 11. Kiểm thử

```bash
npm test
```

Bản đóng gói v3.7: **50/50 test PASS**.

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
