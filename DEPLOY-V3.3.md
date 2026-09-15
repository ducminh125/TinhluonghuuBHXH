# Deploy v3.3 — thanh toán QR tự động bằng payOS

## 1. Cập nhật source và Redeploy

Đưa toàn bộ source v3.3 lên GitHub/Vercel rồi Redeploy.

## 2. Thêm Environment Variables trên Vercel

```env
APP_URL=https://tinhluonghuu-bhxh.vercel.app
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYMENT_BANK_NAME=VCB
PAYOS_PAYMENT_EXPIRY_MINUTES=30
```

Ba khóa payOS lấy tại **my.payos.vn → Kênh thanh toán → kênh của bạn**. Không đưa các khóa này vào frontend hoặc GitHub.

## 3. Migration Supabase v3.3 (khuyến nghị mạnh cho production)

Trong **Supabase Dashboard → SQL Editor**, chọn role `postgres/default` hoặc chạy `RESET ROLE;`, sau đó chạy:

`supabase/migration-v3.3.sql`

Migration chỉ thêm RPC `confirm_paid_order`; không xóa bảng/dữ liệu hiện có. Nếu chưa chạy, code vẫn có fallback server-side, nhưng production nên chạy để xác nhận đơn + cộng lượt trong một transaction.

## 4. Đăng ký webhook payOS

Sau khi deploy và đăng nhập Admin:

1. Mở `/admin`.
2. Khu vực **Đơn hàng chờ xác nhận → Thanh toán tự động payOS**.
3. Kiểm tra URL phải là:
   `https://tinhluonghuu-bhxh.vercel.app/api/payments/payos/webhook`
4. Bấm **Đăng ký / cập nhật Webhook**.
5. Nếu thành công, payOS đã xác thực endpoint và lưu webhook cho kênh thanh toán.

Có thể cấu hình cùng URL này trực tiếp tại my.payos.vn → Kênh thanh toán → Webhook URL.

## 5. Kiểm tra

Mở:

`https://tinhluonghuu-bhxh.vercel.app/api/health`

Cần thấy `paymentConfigured: true`.

Sau đó:

- đăng nhập tài khoản khách;
- Mua thêm lượt → chọn gói;
- QR phải hiện số tiền, tài khoản nhận và nội dung chuyển khoản;
- quét QR và thanh toán;
- sau khi payOS gửi webhook, trạng thái chuyển `Đã thanh toán` và số lượt tăng tự động.

## 6. Nguyên tắc an toàn

- Không cộng lượt dựa vào `returnUrl` của trình duyệt.
- Webhook phải có chữ ký HMAC hợp lệ.
- Phải khớp số tiền và mã đơn.
- Một đơn chỉ được cộng lượt một lần.
- Không commit `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` vào GitHub.
