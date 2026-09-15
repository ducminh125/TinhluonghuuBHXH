# VN Pension Calculator v3.5 — VietQR hiển thị trực tiếp + tự động xác nhận thanh toán

Bản v3.5 gồm luồng thương mại hoàn chỉnh: **chọn gói → tạo QR VietQR động → thanh toán → webhook xác minh → tự cộng lượt**. QR do payOS tạo theo từng đơn, chứa sẵn số tiền, tài khoản nhận và nội dung chuyển khoản.

## Thanh toán v3.5

### Biến môi trường

```env
APP_URL=https://tinhluonghuu-bhxh.vercel.app
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYMENT_BANK_NAME=VCB
PAYOS_PAYMENT_EXPIRY_MINUTES=30
```

### Luồng

```text
Khách chọn gói
→ backend tạo order pending
→ gọi payOS tạo payment request
→ frontend hiển thị QR + số tiền + tài khoản + mã thanh toán
→ ngân hàng ghi nhận chuyển khoản
→ payOS gọi /api/payments/payos/webhook
→ backend kiểm tra HMAC + orderCode + amount + description
→ confirm_paid_order đổi pending → paid và cộng lượt
→ frontend tự tải lại ví/lịch sử đơn
```

Webhook không tin vào `returnUrl`; return URL chỉ phục vụ giao diện. Xác nhận dịch vụ dựa trên webhook đã kiểm tra chữ ký. Khi trang QR còn mở, frontend cũng polling `/api/orders/:id/status` để đối soát trạng thái với payOS nếu webhook đến chậm.

### Migration production

Nếu database chưa có RPC thanh toán tự động, chạy `supabase/migration-v3.3.sql` để thêm `confirm_paid_order`, giúp cập nhật đơn và cộng lượt trong cùng transaction. Code có fallback tương thích schema cũ, nhưng production nên chạy migration.

### Admin

Tại `/admin`, khu vực đơn hàng có nút **Đăng ký / cập nhật Webhook**. Nút này gọi payOS `confirm-webhook` và cấu hình URL:

```text
https://tinhluonghuu-bhxh.vercel.app/api/payments/payos/webhook
```

Xem `DEPLOY-V3.3.md` để triển khai từng bước.

---


Web ước tính lương hưu Việt Nam theo Luật BHXH 2024, có hệ thống tài khoản, hạn mức sử dụng, lịch sử, gói trả phí và trang quản trị. Người dùng có thể nhập quá trình đóng trực tiếp hoặc nhập từ ảnh/PDF/Word/Excel. Phép tính cuối cùng được thực hiện bởi **engine quy tắc trong source code**, không giao cho mô hình AI tự quyết định số tiền lương hưu.

> Đây là công cụ tham khảo/mô phỏng. Kết quả chính thức phụ thuộc dữ liệu cơ quan BHXH và văn bản có hiệu lực tại thời điểm giải quyết chế độ.

## Cập nhật từ v3.1 lên v3.2

Bản v3.2 **không bắt buộc chạy thêm SQL** nếu database v3.1.2 hiện tại đã có các bảng/hàm cơ bản (`wallets`, `import_jobs`, `consume_credit`, `refund_credit`). Chỉ cần cập nhật source và Redeploy Vercel.

Các thay đổi chính:

1. **Không trừ lượt hồ sơ khi vừa bấm đọc.** Server chỉ trừ 01 lượt sau khi đã nhận diện được ít nhất một giai đoạn BHXH hợp lệ. Lỗi parser/AI/timeout trước thời điểm đó không làm giảm số lượt.
2. Nếu lỗi kỹ thuật xảy ra sau khi đã trừ lượt, backend tự gọi hoàn 01 lượt và frontend tải lại số dư ngay.
3. Lỗi upload của `multer` được trả về JSON rõ ràng thay vì HTML `HTTP 500`.
4. Trên Vercel, `/api/config` trả giới hạn upload trực tiếp khoảng 4 MB để trình duyệt chặn trước những request chắc chắn vượt giới hạn 4,5 MB của Vercel Functions; request bị chặn trước không trừ lượt.
5. Model ảnh/PDF mặc định đổi sang `gemini-2.5-flash`, là model được tài liệu ShopAIKey nêu rõ cho Gemini native/vision; fallback vẫn là `gpt-5.6-luna`.
6. Mỗi lỗi import có `errorId` để tra trong Vercel Logs.

File `supabase/migration-v3.2.sql` là **tùy chọn tăng cứng**: thêm cơ chế charge/refund idempotent theo từng `import_job`. Nếu bạn chưa muốn thao tác SQL thêm, code vẫn tự tương thích với `consume_credit` / `refund_credit` của v3.1.2.

### Cập nhật bắt buộc từ v3.0/v3.1 cũ nếu database chưa hoàn chỉnh

- Supabase phải có schema v3.1.2 (các bảng `profiles`, `wallets`, `plans`, `orders`, `usage_events`, `calculation_history`, `import_jobs`, `admin_audit_logs`).
- Vercel cần `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SHOPAIKEY_API_KEY`, `ADMIN_EMAILS`.
- Authentication dùng Email/Google; Phone đã bỏ.


## v3.5 - VietQR hiển thị trực tiếp

Khi khách chọn gói, website hiển thị ngay mã VietQR trong modal cùng số tài khoản, số tiền và nội dung chuyển khoản. Ảnh QR được dựng từ dữ liệu payment request do payOS trả về; checkout payOS chỉ còn là link dự phòng. Không cần migration database mới khi nâng từ v3.4.1.


## 1. Điểm mới của v3

### Tài khoản và hạn mức

Tài khoản mới được cấp mặc định:

- **03 lượt tính bằng Nhập trực tiếp quá trình đóng**;
- **00 lượt Nhập từ ảnh hoặc file hồ sơ**;
- **03 lượt lưu lịch sử**.

Ba loại lượt được lưu ở `wallets` và trừ **phía server**. Không dùng localStorage hay biến JavaScript trên trình duyệt để quyết định quyền sử dụng.

Đăng nhập hỗ trợ:

- Email + mật khẩu;
- Google/Gmail qua OAuth;


### Gói dịch vụ

Admin có thể tạo/sửa giá và số lượt cho từng gói mà không sửa source. Schema có sẵn ba **gói mẫu để tham khảo**, có thể chỉnh hoặc tắt trước khi mở bán:

| Gói mẫu | Giá mẫu | Trực tiếp | Hồ sơ | Lưu lịch sử |
|---|---:|---:|---:|---:|
| Gói Trực tiếp 10 | 29.000đ | 10 | 0 | 10 |
| Gói Hồ sơ 5 | 49.000đ | 0 | 5 | 5 |
| Combo 99K | 99.000đ | 20 | 10 | 20 |

**Giá trên chỉ là giá seed kỹ thuật**, không phải khuyến nghị kinh doanh. Hãy điều chỉnh theo chi phí AI, phí thanh toán, thuế, hỗ trợ khách hàng và biên lợi nhuận thực tế.

### Admin

Trang `/admin` gồm:

- tổng số tài khoản;
- đơn hàng chờ duyệt;
- doanh thu các đơn đã duyệt;
- thời gian xử lý hồ sơ trung bình;
- danh sách tài khoản + số lượt còn lại;
- cộng lượt thủ công;
- tạm khóa/mở khóa tài khoản;
- tạo/sửa/bật/tắt gói;
- duyệt chuyển khoản và tự cộng lượt;
- log các lần import: parser/model/thời gian/trạng thái.

Mọi API admin kiểm tra `role = admin` ở server. Secret/service-role key không được đưa ra trình duyệt.

## 2. Chiến lược đọc hồ sơ nhanh

Không nên gửi mọi file sang một model lớn.

Luồng v3:

```text
File người dùng
   ↓
Có cấu trúc đọc trực tiếp được?
   ├─ Excel mẫu BHXH chuẩn → parser XLSX cục bộ → JSON
   └─ Ảnh / PDF scan / hồ sơ khó
          ↓
     Gemini Flash (tuyến nhanh)
          ↓ lỗi / JSON không hợp lệ / timeout
     GPT-5.6 Luna (fallback)
          ↓
     Chuẩn hóa + lọc trùng + cảnh báo phần chưa rõ
          ↓
     Engine tính lương hưu
```

### Vì sao thay đổi này quan trọng

Với file Excel BHXH dạng bảng có các cột như `Từ tháng`, `Đến tháng`, `Mức đóng`, phụ cấp..., backend đọc trực tiếp bằng parser. Không cần upload toàn bộ bảng sang AI nên tránh phần lớn độ trễ 120 giây.

`server/structured-bhxh.js` hiện nhận diện bảng BHXH dạng Mẫu 07/SBH phổ biến, đồng thời bỏ dòng chỉ ghi BHTN để tránh cộng trùng quá trình hưu trí.

### Model mặc định

```env
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
```

- `gemini-2.5-flash`: tuyến ưu tiên cho ảnh/PDF scan vì mục tiêu của dòng Flash là tốc độ/multimodal;
- `gpt-5.6-luna`: fallback theo chuẩn OpenAI-compatible, nhẹ và rẻ hơn Terra theo bảng giá gateway tại thời điểm xây dựng;
- `gpt-5.6-terra`: không dùng mặc định; có thể cấu hình làm tuyến escalation riêng nếu sau này cần xử lý hồ sơ rất khó.

Không nên cam kết một số giây cố định cho AI vì độ trễ còn phụ thuộc số trang, kích thước ảnh, channel/provider và tải hệ thống. Admin dashboard lưu `latency_ms` để benchmark trên dữ liệu thật rồi quyết định route. Với ảnh/PDF scan, backend mặc định chia vision thành batch 4 ảnh và xử lý tối đa 2 batch song song (`AI_IMAGE_BATCH_SIZE`, `AI_BATCH_CONCURRENCY`), sau đó gộp/lọc trùng lại; tránh một request quá lớn phải chờ lâu.

## 3. Luồng quota

### Nhập trực tiếp

1. Người dùng nhập dữ liệu.
2. Server kiểm tra và tính.
3. Chỉ khi phép tính hợp lệ mới trừ **01 direct credit**.

### Nhập hồ sơ

1. Người dùng tải file.
2. Server tạo `import_job` nhưng **chưa trừ lượt**.
3. Parser/AI đọc, chuẩn hóa và kiểm tra dữ liệu.
4. Nếu không có giai đoạn hợp lệ hoặc có lỗi parser/AI/timeout → import thất bại và **không trừ lượt**.
5. Khi đã có ít nhất một giai đoạn hợp lệ → server mới trừ **01 file credit**.
6. Nếu một lỗi kỹ thuật hiếm xảy ra sau bước trừ lượt nhưng trước khi trả kết quả → backend tự hoàn **01 file credit**; frontend refresh số dư và thông báo rõ đã hoàn.
7. Một `import_job` thành công được dùng cho một phép tính hồ sơ; reload cùng input có thể trả cached result, không trừ thêm.

### Lưu lịch sử

Mỗi lần bấm lưu kết quả → trừ **01 history credit**. RPC `save_calculation_history` thực hiện trừ credit + lưu lịch sử trong cùng giao dịch database.

## 4. Database

Chạy file:

```text
supabase/schema.sql
```

Các bảng chính:

- `profiles`: role/status;
- `wallets`: 3 ví lượt;
- `plans`: gói dịch vụ;
- `orders`: đơn thanh toán;
- `usage_events`: sổ biến động credit;
- `calculation_history`: lịch sử người dùng chủ động lưu;
- `import_jobs`: hiệu năng và trạng thái import;
- `admin_audit_logs`: log thao tác admin.

RLS được bật; các bảng nghiệp vụ không mở trực tiếp cho browser. Backend dùng server credential để thực hiện nghiệp vụ sau khi xác thực JWT người dùng.

### Tạo admin

Không có form “đăng ký admin” riêng. Thêm email quản trị vào Vercel Environment Variable:

```env
ADMIN_EMAILS=your-admin@gmail.com
```

Sau đó đăng ký/đăng nhập email hoặc Google bình thường. Ở request đầu tiên, server tự nâng `profiles.role` thành `admin`. Có thể khai báo nhiều email, phân cách bằng dấu phẩy.

## 5. Cấu hình Supabase Auth

### Email

Email/password dùng trực tiếp Supabase Auth. Nên bật xác minh email khi chạy production. Khi đăng ký, frontend đặt `emailRedirectTo` về `/auth/confirmed`; trang này hiển thị “Đăng ký thành công” và giữ phiên đăng nhập nếu Supabase trả session qua URL.

### Google/Gmail

Trong Supabase Dashboard:

1. Authentication → Providers → Google;
2. tạo OAuth Client trong Google Cloud;
3. điền Client ID/Secret;
4. thêm domain production và redirect URL theo hướng dẫn Supabase.

Frontend gọi `signInWithOAuth({ provider: 'google' })`.

## 6. Cấu hình môi trường

Sao chép `.env.example` thành `.env`:

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
ADMIN_EMAILS=your-admin@gmail.com

PAYMENT_BANK_NAME=VCB
PAYMENT_BANK_ACCOUNT=...
PAYMENT_ACCOUNT_NAME=...
PORT=3000
```

`SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` và `SHOPAIKEY_API_KEY` **chỉ đặt ở server/Vercel Environment Variables**, tuyệt đối không commit GitHub hoặc render vào HTML.

## 7. Thanh toán

Bản v3 triển khai MVP an toàn để có thể thử thương mại ngay:

```text
Khách chọn gói
→ tạo mã đơn hàng
→ hiển thị thông tin chuyển khoản
→ admin kiểm tra tiền
→ bấm “Xác nhận đã thanh toán”
→ RPC approve_order
→ tự cộng credit
```

Khi có tài khoản merchant, có thể thay bước admin duyệt bằng webhook của PayOS/VNPay/MoMo. Khi triển khai webhook cần:

- xác minh chữ ký từ nhà cung cấp;
- idempotency theo mã giao dịch;
- không cộng credit hai lần;
- lưu raw event/audit;
- xử lý hoàn tiền/chargeback nếu nhà cung cấp hỗ trợ.

## 8. Quyền riêng tư và dữ liệu hồ sơ

Hồ sơ BHXH chứa dữ liệu cá nhân và thu nhập. Bản v3 theo hướng tối thiểu hóa dữ liệu:

- file upload chỉ được xử lý trong request, **không lưu bản gốc vào database**;
- `import_jobs` chỉ lưu metadata kỹ thuật, không lưu file;
- kết quả chỉ được lưu vào `calculation_history` khi người dùng chủ động bấm **Lưu lịch sử**;
- người dùng có thể xóa lịch sử;
- production nên bổ sung trang Điều khoản sử dụng, Chính sách bảo mật và cơ chế yêu cầu xóa tài khoản/dữ liệu;
- cần cấu hình log production để **không ghi raw hồ sơ, access token hoặc API key**.

## 9. Các lớp chống lạm dụng cần bật trước khi mở bán rộng

Repo đã có kiểm tra quota server-side, nhưng production nên bổ sung:

1. rate limit theo IP + user cho `/api/import`, `/api/calculate`, login và tạo đơn;
2. CAPTCHA/rate limit cho đăng ký, đăng nhập và các endpoint nhạy cảm;
3. giới hạn MIME/file signature, không chỉ extension;
4. malware scan nếu sau này lưu file;
5. timeout + circuit breaker cho AI provider;
6. daily cost ceiling/cảnh báo chi phí;
7. sao lưu database và theo dõi lỗi;
8. payment webhook chính thức nếu muốn tự động hóa doanh thu;
9. trang privacy/terms/consent;
10. chính sách lưu/xóa lịch sử theo thời hạn.

## 10. Công thức BHXH

Các rule chính nằm trong:

- `js/rules.js`;
- `js/contributions.js`;
- `js/pension.js`;
- `js/salary-scales.js`.

Cơ sở pháp lý được mô hình hóa gồm Luật BHXH 41/2024/QH15, Nghị định 135/2020/NĐ-CP, Nghị định 158/2025/NĐ-CP, các bảng lương/hệ số liên quan và các văn bản cập nhật mức lương cơ sở/hệ số điều chỉnh đã tích hợp trong source.

Lưu ý: cần rà soát văn bản mới trước khi thương mại hóa chính thức và cập nhật rule khi pháp luật thay đổi.

## 11. Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
cp .env.example .env
npm start
```

Mở:

- Công cụ: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`
- Health: `http://localhost:3000/api/health`

Nếu chưa cấu hình Supabase, phần engine frontend vẫn có thể dùng cho development, nhưng tài khoản/quota/import thương mại sẽ chưa hoạt động đầy đủ.

## 12. Deploy

Khuyến nghị:

- GitHub: source control;
- Vercel/Render/Fly.io: Node backend;
- Supabase: Auth + Postgres;
- ShopAIKey: AI gateway cho các file thực sự cần model.

Không dùng GitHub Pages thuần tĩnh cho bản thương mại vì cần giữ secret key và thực thi quota ở backend.

## 13. Cấu trúc repo

```text
vn-pension-calculator-v3/
├── index.html
├── admin.html
├── styles.css
├── js/
│   ├── account.js
│   ├── admin.js
│   ├── app.js
│   ├── contributions.js
│   ├── pension.js
│   ├── rules.js
│   └── salary-scales.js
├── server/
│   ├── index.js
│   ├── parsers.js
│   ├── structured-bhxh.js
│   ├── shopaikey.js
│   └── supabase.js
├── supabase/
│   └── schema.sql
├── tests/
├── .env.example
├── package.json
└── vercel.json
```

## 14. Tài liệu kỹ thuật tham khảo

- ShopAIKey model/pricing: https://shopaikey.com/en/models
- ShopAIKey: https://shopaikey.com/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase admin users: https://supabase.com/docs/reference/javascript/auth-admin-listusers


## Sửa lỗi payOS v3.4

Nếu chọn gói nhưng không tạo được QR, bản v3.4 trả lỗi payOS cụ thể và `errorId` thay cho HTTP 500 chung. Kiểm tra `/api/health`, sau đó đăng nhập `/admin` và bấm **Đăng ký / cập nhật Webhook** để kiểm tra kết nối thật. Xem `DEPLOY-V3.4.md`.


## Hotfix v3.4.1

Sửa lỗi `expiredAt is not defined` khi tạo QR payOS. Không cần migration SQL hoặc thay đổi biến môi trường; chỉ cần redeploy source.
