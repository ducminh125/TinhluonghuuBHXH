# Deploy v3.4 — sửa lỗi “Máy chủ gặp lỗi khi xử lý yêu cầu” khi chọn gói

## 1. Cập nhật source và Redeploy

Đẩy toàn bộ source v3.4 lên GitHub/Vercel và Redeploy Production.

Không cần migration database mới nếu v3.1.2 đã tạo đủ `plans`, `orders`, `wallets`.

## 2. Kiểm tra Environment Variables trên Vercel

Vào Project → Settings → Environment Variables. Ở môi trường Production cần có:

```env
APP_URL=https://tinhluonghuu-bhxh.vercel.app
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYOS_PAYMENT_EXPIRY_MINUTES=30
PAYOS_TIMEOUT_MS=12000
```

Ba khóa payOS phải được lấy từ **cùng một Kênh thanh toán** trên my.payos.vn. Không thêm dấu ngoặc kép vào giá trị.

Sau khi sửa biến môi trường phải Redeploy.

## 3. Kiểm tra health

Mở:

`https://tinhluonghuu-bhxh.vercel.app/api/health`

Cần có:

```json
{"ok":true,"paymentConfigured":true}
```

`paymentConfigured=true` chỉ xác nhận server đã nhận đủ 3 biến; nó chưa chứng minh các khóa đúng.

## 4. Kiểm tra kết nối thật

Đăng nhập tài khoản Admin → `/admin` → mục payOS.

- Dòng trạng thái phải báo Client ID/API Key/Checksum Key đều có.
- APP_URL phải là `https://tinhluonghuu-bhxh.vercel.app`.
- Bấm **Đăng ký / cập nhật Webhook**.

Nếu thao tác này thành công, server đã kết nối được với kênh payOS và webhook URL cũng được payOS chấp nhận.

## 5. Thử mua gói

Đăng nhập tài khoản khách → Mua thêm lượt → Chọn gói.

Nếu lỗi, v3.4 sẽ hiển thị lỗi cụ thể và một `Mã lỗi`, ví dụ:

`payOS từ chối thông tin kết nối... · Mã lỗi: a1b2c3d4`

Vào Vercel → Logs và tìm `a1b2c3d4` để xem đúng request lỗi.

### Ý nghĩa lỗi thường gặp

- `PAYOS_NOT_CONFIGURED`: Vercel thiếu một trong 3 biến payOS hoặc chưa Redeploy.
- `PAYOS_AUTH_FAILED`: Client ID/API Key sai hoặc lấy khác Kênh thanh toán.
- `PAYOS_SIGNATURE_REJECTED`: Checksum Key không đúng với Client ID/API Key.
- `PAYOS_INVALID_RETURN_URL`: APP_URL sai, có ký tự thừa hoặc không phải http/https.
- `PAYOS_TIMEOUT`: payOS không phản hồi trong thời gian cấu hình.
- `PAYOS_RATE_LIMIT`: gửi yêu cầu quá nhanh; thử lại sau.

## 6. Điều kiện phía payOS

Tài khoản payOS phải đã xác thực và có một Kênh thanh toán hoạt động. Các khóa dùng trên Vercel phải thuộc chính Kênh đó.
