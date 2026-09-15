# Deploy v3.10

v3.10 chỉ bổ sung bộ lọc/tra cứu cho trang quản trị. **Không cần chạy SQL migration mới và không cần đổi Environment Variables.**

## Cập nhật
1. Đưa source v3.10 lên repository đang deploy Vercel.
2. Redeploy Production.
3. Mở `/admin` và đăng nhập tài khoản quản trị.
4. Kiểm tra mục **Đơn hàng chờ xác nhận**:
   - thử lọc trạng thái `Chờ thanh toán`;
   - thử tra cứu theo mã thanh toán;
   - thử tìm email tài khoản;
   - thử khoảng tiền và khoảng ngày;
   - kiểm tra phân trang vẫn 10 dòng/trang.
5. Kiểm tra mục **Hiệu năng đọc hồ sơ**:
   - thử tìm email;
   - lọc `Thành công`/`Lỗi`;
   - lọc model hoặc parser;
   - thử khoảng thời gian xử lý;
   - kiểm tra phân trang 10 dòng/trang.
6. Nhấn `Ctrl + F5` nếu trình duyệt còn giữ JS/CSS cũ.

## Không thay đổi
- Supabase schema;
- payOS/webhook;
- key môi trường;
- quota;
- công thức BHXH;
- dữ liệu tài khoản, đơn hàng và lịch sử.
