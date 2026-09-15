# v3.4.1

## Sửa lỗi tạo QR payOS

- Sửa lỗi runtime `expiredAt is not defined` tại `POST /api/orders`.
- Nguyên nhân: route khai báo biến `expiresAt` nhưng truyền shorthand `expiredAt` sang `createPayosPayment`.
- Thống nhất tên nội bộ là `expiredAt`, đúng tên trường API payOS.
- Response cho frontend vẫn trả khóa `expiresAt` để giữ tương thích giao diện.
- Thêm regression test cho route tạo đơn để ngăn lỗi tên biến tái xuất hiện.
- Không cần migration Supabase mới.
