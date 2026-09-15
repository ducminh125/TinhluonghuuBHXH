# Deploy v3.6

Bản v3.6 không yêu cầu migration Supabase mới.

1. Deploy toàn bộ source v3.6 lên Vercel.
2. Không thay đổi các biến Supabase/payOS hiện có.
3. Sau deploy, Ctrl+F5 hoặc mở cửa sổ ẩn danh.
4. Kiểm tra: Mua thêm lượt → Chọn gói → popup QR nằm gọn trong nền và có trạng thái chờ xác nhận.
5. Kiểm tra: Tài khoản của tôi → Lịch sử đã lưu → Tra cứu → xem dữ liệu/kết quả/giai đoạn đóng.

Lưu ý: API GET /api/history/:id chỉ trả bản lưu thuộc chính user đang đăng nhập.
