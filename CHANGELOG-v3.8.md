# CHANGELOG v3.8

## Đăng nhập Google

- Thêm kiểm tra công khai `GET /auth/v1/settings` của Supabase để xác định `external.google` có thực sự được bật hay chưa.
- `/api/config` trả `googleAuthEnabled` và `googleAuthChecked`.
- `/api/health` trả `googleAuthEnabled`.
- Nếu Google Provider chưa bật, nút đăng nhập Google ở trang người dùng và Admin bị vô hiệu hóa; không còn chuyển sang trang lỗi JSON `Unsupported provider`.
- Nếu Provider đã bật, luồng `signInWithOAuth({ provider: "google" })` hoạt động như trước.

## Popup “Tài khoản của tôi”

- Bỏ nút “Mua thêm lượt” bên trong popup. Nút mua lượt ở header vẫn giữ nguyên.
- “Lịch sử đã lưu” và “Đơn hàng gần đây” chuyển thành khung cuộn riêng.
- Mỗi khung có chiều cao khoảng 05 dòng; có thể cuộn để xem thêm.
- Tải tối đa 30 bản lịch sử gần đây cho khung tra cứu.

## Trang quản trị

- Danh sách tài khoản: 10 tài khoản/trang.
- Thêm tra cứu tài khoản theo email, UUID/mã tài khoản, số điện thoại nếu có, hoặc tên trong metadata.
- Đơn hàng: 10 đơn/trang.
- Hiệu năng đọc hồ sơ: 10 log/trang, hiển thị thêm tài khoản thực hiện.
- Phân trang được thực hiện từ backend, không tải toàn bộ dữ liệu rồi cắt ở trình duyệt.

## API/Admin

- `/api/admin/users?page=1&perPage=10&q=...`
- `/api/admin/orders?page=1&perPage=10`
- `/api/admin/imports?page=1&perPage=10`

## Kiểm thử

- Thêm test hồi quy cho Google provider preflight, popup tài khoản và phân trang Admin.
- Tổng: **53/53 test PASS**.
