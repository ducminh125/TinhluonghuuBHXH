# VN Pension Calculator v3.5

## Sửa QR thanh toán payOS

- Sửa khung QR trắng trên production: không còn phụ thuộc thư viện QR từ CDN để biến chuỗi `qrCode` của payOS thành ảnh.
- Backend tạo `qrImageUrl` bằng VietQR Quick Link từ đúng dữ liệu payOS trả về: BIN ngân hàng, tài khoản nhận, số tiền, nội dung và tên chủ tài khoản.
- Frontend hiển thị ảnh VietQR trực tiếp trong modal ngay sau khi chọn gói.
- Nếu ảnh VietQR không tải được, giao diện hiển thị hướng dẫn chuyển khoản thủ công và vẫn giữ link payOS làm phương án dự phòng.

## Giao diện thanh toán mới

- Bố cục 2 cột giống màn hình thanh toán VietQR phổ biến.
- QR lớn ở bên trái; thông tin ngân hàng ở bên phải.
- Có nút sao chép riêng cho số tài khoản, số tiền và nội dung chuyển khoản.
- Hiển thị tên ngân hàng đầy đủ cho các BIN phổ biến, gồm BIDV, Vietcombank, VietinBank, Agribank, MB, Techcombank, ACB, VPBank, Sacombank, TPBank, VIB, SHB, MSB và HDBank.
- Link mở checkout payOS được chuyển thành phương án dự phòng, không còn là thao tác bắt buộc.
- Cơ chế polling + webhook tự xác nhận thanh toán và cộng lượt giữ nguyên.

## Database / môi trường

Không cần chạy migration Supabase mới và không cần đổi key payOS khi nâng từ v3.4.1 lên v3.5.
