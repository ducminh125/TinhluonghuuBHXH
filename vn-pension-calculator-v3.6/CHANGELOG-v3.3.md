# Changelog v3.3 — QR thanh toán + tự động cộng lượt

- Chọn gói tạo một đơn payOS riêng với `orderCode` duy nhất.
- Backend gọi payOS `POST /v2/payment-requests` và trả về QR động, số tiền, tài khoản nhận, tên người nhận, nội dung chuyển khoản và checkout URL.
- Thêm modal thanh toán QR ngay trên website; không yêu cầu khách tự nhập số tiền/nội dung.
- Frontend kiểm tra trạng thái thanh toán mỗi 3 giây khi modal đang mở.
- Thêm webhook `/api/payments/payos/webhook`; kiểm tra HMAC-SHA256 bằng `PAYOS_CHECKSUM_KEY` trước khi cập nhật đơn.
- Chỉ cộng lượt khi: chữ ký hợp lệ, đúng `orderCode`, đúng số tiền, đúng nội dung, đơn vẫn `pending`.
- Webhook/polling có tính idempotent: một đơn đã `paid` không được cộng lượt lần hai.
- Thêm đối soát trạng thái payOS ở `/api/orders/:id/status` để tự phục hồi nếu webhook đến chậm.
- Admin có nút “Đăng ký / cập nhật Webhook” để gọi API `confirm-webhook` của payOS.
- Thêm `supabase/migration-v3.3.sql` tạo RPC `confirm_paid_order` để đổi trạng thái + cộng lượt trong một transaction database.
- Vẫn giữ nút admin xác nhận thủ công làm phương án dự phòng.
