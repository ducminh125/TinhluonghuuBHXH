# CHANGELOG v3.10

## Quản trị: bộ lọc và tra cứu chi tiết

### Đơn hàng chờ xác nhận
- Thêm ô **Tra cứu chung**.
- Thêm bộ lọc riêng theo từng trường đang quản lý:
  - mã thanh toán;
  - tài khoản/email hoặc mã tài khoản;
  - tên gói;
  - khoảng số tiền;
  - khoảng ngày tạo;
  - trạng thái đơn.
- Giữ phân trang 10 bản ghi/trang sau khi áp dụng bộ lọc.
- Có nút **Tra cứu**, **Xóa lọc**, **Làm mới**.
- Tra cứu chung có thể khớp mã thanh toán, tài khoản, gói, trạng thái và số tiền.

### Hiệu năng đọc hồ sơ
- Thêm ô **Tra cứu chung**.
- Thêm bộ lọc riêng theo:
  - tài khoản/email hoặc mã tài khoản;
  - kiểu xử lý/parser;
  - model;
  - khoảng thời gian xử lý (giây);
  - khoảng ngày;
  - trạng thái xử lý.
- Giữ phân trang 10 bản ghi/trang sau lọc.
- Có nút **Tra cứu**, **Xóa lọc**, **Làm mới**.

### Backend
- `/api/admin/orders` nhận thêm các query parameter: `q`, `code`, `user`, `plan`, `amountMin`, `amountMax`, `dateFrom`, `dateTo`, `status`.
- `/api/admin/imports` nhận thêm: `q`, `user`, `parser`, `model`, `latencyMinSeconds`, `latencyMaxSeconds`, `dateFrom`, `dateTo`, `status`.
- Tra cứu tài khoản trong hai API hỗ trợ email/tên/mã tài khoản thông qua Supabase Auth Admin.
- Bộ lọc và phân trang được xử lý phía server, không tải toàn bộ dữ liệu xuống trình duyệt.

Không thay đổi database schema, công thức quyền lợi, quota, payOS hoặc dữ liệu hiện có.
