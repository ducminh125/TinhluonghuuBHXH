# Hướng dẫn deploy v3.8 — dành cho người không chuyên

Nếu v3.7 đang chạy ổn, **v3.8 không cần chạy thêm SQL Supabase**. Chỉ cần cập nhật source và cấu hình Google nếu muốn dùng nút Google.

## 1. Deploy source v3.8

1. Giải nén `vn-pension-calculator-v3.8.zip`.
2. Đưa toàn bộ source lên repository GitHub đang nối với Vercel.
3. Vào Vercel → project `tinhluonghuu-bhxh` → Deployments.
4. Chờ bản Production mới deploy xong.
5. Mở website bằng cửa sổ ẩn danh hoặc nhấn `Ctrl + F5`.

## 2. Sửa lỗi Google “Unsupported provider”

Lỗi này có nghĩa **Google Provider chưa được bật trong Supabase Auth**. v3.8 sẽ chặn nút Google nếu phát hiện Provider đang tắt, nhưng để Google login hoạt động thật bạn phải cấu hình một lần trong Supabase/Google.

### Bước A — mở Google Provider trong Supabase

Vào Supabase Dashboard → đúng project → **Authentication → Providers → Google**.

Giữ trang này mở vì Supabase hiển thị **Callback URL** cần đưa sang Google Cloud. Callback thường có dạng:

```text
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

Hãy dùng **đúng URL Supabase hiển thị trên trang Google Provider**, không tự đoán PROJECT_REF.

### Bước B — tạo OAuth Web Client ở Google

Trong Google Cloud / Google Auth Platform:

1. Tạo OAuth Client ID loại **Web application**.
2. Authorized JavaScript origins thêm:

```text
https://tinhluonghuu-bhxh.vercel.app
```

3. Authorized redirect URIs thêm **Callback URL lấy từ Supabase ở Bước A**.
4. Lưu lại `Client ID` và `Client Secret`.

### Bước C — bật Google ở Supabase

Quay lại Supabase → Authentication → Providers → Google:

1. Bật **Enable Sign in with Google**.
2. Dán Google `Client ID`.
3. Dán Google `Client Secret`.
4. Save.

### Bước D — URL Configuration

Supabase → Authentication → URL Configuration:

```text
Site URL:
https://tinhluonghuu-bhxh.vercel.app
```

Redirect URLs nên có:

```text
https://tinhluonghuu-bhxh.vercel.app/**
```

### Bước E — kiểm tra

Mở:

```text
https://tinhluonghuu-bhxh.vercel.app/api/health
```

Khi cấu hình đúng, cần thấy:

```json
"googleAuthEnabled": true
```

Sau đó mở popup đăng nhập; nút **Tiếp tục bằng Google** sẽ tự được bật.

> Không cần thêm Google Client ID/Secret vào Vercel. Hai giá trị này được lưu trong Supabase Google Provider.

## 3. Kiểm tra popup “Tài khoản của tôi”

1. Đăng nhập.
2. Bấm vào tài khoản ở header.
3. Không còn nút “Mua thêm lượt” trong popup.
4. “Lịch sử đã lưu” và “Đơn hàng gần đây” chỉ chiếm khoảng 05 dòng; cuộn trong khung để xem thêm.
5. Nút **Mua thêm lượt** ở header vẫn hoạt động bình thường.

## 4. Kiểm tra Admin

Mở:

```text
https://tinhluonghuu-bhxh.vercel.app/admin
```

- **Tài khoản đăng ký:** 10 tài khoản/trang, có ô Tra cứu.
- Có thể tìm bằng email, UUID/mã tài khoản hoặc tên.
- **Đơn hàng:** 10 đơn/trang, dùng Trước/Sau để chuyển trang.
- **Hiệu năng đọc hồ sơ:** 10 log/trang, có cột tài khoản.

## 5. Không cần migration database

v3.8 chỉ thay luồng Auth/UI/API phân trang. Nếu v3.7 đang chạy bình thường thì không cần chạy file SQL mới.

## 6. Kiểm thử bản đóng gói

```bash
npm test
```

Kết quả bản v3.8: **53/53 PASS**.
