# Deploy v3.14

Bản v3.14 chỉ hoàn thiện nội dung và giao diện của trang Privacy/Terms, không thay đổi database hoặc cấu hình thanh toán.

## Triển khai

1. Thay source production bằng toàn bộ source v3.14.
2. Deploy lại trên Vercel.
3. Không cần chạy SQL migration.
4. Không cần thay Environment Variables.
5. Mở cửa sổ ẩn danh hoặc Ctrl + F5.

## Kiểm tra

- `/privacy` phải hiển thị `Chính sách bảo mật`, không còn chữ `bản mẫu` hoặc placeholder.
- `/terms` phải hiển thị `Điều khoản sử dụng`, không còn chữ `bản mẫu` hoặc placeholder.
- Cả hai trang phải hiển thị:
  - `Đơn vị cung cấp: Đức Minh`
  - `Người liên hệ: Đức Minh`
  - `Điện thoại: 0383355188`
- `/api/health` phải trả `version: 3.14.0`.
