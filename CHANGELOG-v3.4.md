# VN Pension Calculator v3.4

## Sửa lỗi tạo QR payOS

- Sửa lỗi cleanup trong `/api/orders`: không còn gọi `.catch()` trực tiếp trên Supabase query builder. Lỗi payOS thật không còn bị che thành HTTP 500 chung.
- Mỗi lỗi tạo đơn có `errorId` 8 ký tự để tra trong Vercel Logs.
- Hiển thị lỗi payOS cụ thể: thiếu cấu hình, sai Client ID/API Key, sai Checksum Key/signature, timeout, rate limit, URL trả về không hợp lệ.
- Trim khoảng trắng ở 3 khóa payOS lấy từ Environment Variables.
- Request tạo link thanh toán được tối giản theo API payOS: chỉ trường bắt buộc + `expiredAt`.
- Mã `orderCode` dùng số nguyên dương trong vùng signed 32-bit và tự thử lại nếu trùng khóa DB.
- Không để lỗi dọn đơn che mất lỗi gốc; đơn local đã tạo nhưng payOS thất bại sẽ được chuyển sang `cancelled` nếu có thể.
- Giao diện khóa nút chọn gói trong lúc đang tạo QR, hiển thị “Đang tạo mã QR…”, và kèm `Mã lỗi` khi thất bại.
- Trang Admin hiển thị trạng thái từng biến payOS và APP_URL; nút đăng ký webhook tiếp tục là phép kiểm tra kết nối thật với payOS.

## Kiểm thử

30/30 test PASS.
