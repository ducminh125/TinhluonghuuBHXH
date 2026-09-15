# Deploy v3.5 - QR hiển thị trực tiếp

## 1. Không cần chạy SQL mới

Nếu v3.4.1 đang tạo được đơn payOS thì v3.5 không thay đổi schema database.

## 2. Deploy source

Đẩy toàn bộ source v3.5 lên GitHub/Vercel và Redeploy Production.

Các biến môi trường payOS giữ nguyên:

```env
APP_URL=https://tinhluonghuu-bhxh.vercel.app
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
PAYOS_PAYMENT_EXPIRY_MINUTES=30
PAYOS_TIMEOUT_MS=12000
```

## 3. Kiểm tra

1. Đăng nhập tài khoản khách.
2. Chọn `Mua thêm lượt`.
3. Chọn một gói.
4. Modal thanh toán phải tự xuất hiện QR VietQR ngay trong website.
5. Kiểm tra số tài khoản, số tiền và nội dung khớp với dữ liệu payOS.
6. Quét QR bằng ứng dụng ngân hàng thử nghiệm.
7. Khi thanh toán thành công, trạng thái phải đổi sang `Đã thanh toán` và ví lượt được cập nhật.

## 4. Nếu QR không hiện

Mở DevTools > Network và kiểm tra request tới `img.vietqr.io`. Giao diện sẽ không bị trắng hoàn toàn: nó tự hiện khung fallback và vẫn cho phép mở checkout payOS dự phòng.
