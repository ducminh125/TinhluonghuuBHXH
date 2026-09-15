# Triển khai VN Social Insurance Benefits Calculator v3.7

Bản v3.7 được thiết kế để nâng cấp trực tiếp từ v3.6.

## Cách đơn giản nhất
1. Thay source GitHub/Vercel bằng toàn bộ source v3.7.
2. Giữ nguyên Environment Variables đang dùng cho Supabase, ShopAIKey và payOS.
3. Vercel → **Deployments** → deployment mới → chờ trạng thái `Ready`.
4. Mở `https://tinhluonghuu-bhxh.vercel.app/api/health`.
5. Kiểm tra có `"ok": true` và `"version": "3.7.0"`.
6. Mở web ở cửa sổ ẩn danh hoặc nhấn `Ctrl + F5`.

## Không cần chạy thêm SQL
Nếu v3.6 của bạn hiện đã:
- đăng nhập được;
- hiển thị ví lượt;
- mua gói/payOS hoạt động;
- lưu và tra cứu lịch sử được;

thì v3.7 **không yêu cầu migration Supabase mới**.

## Kiểm tra Admin
Vào `/admin`:
- Gói đăng ký: thử tạo 1 gói test → sửa → xóa.
- Đơn đang `pending`: phải có cả `Xác nhận đã thanh toán` và `Hủy thanh toán`.
- Chỉ hủy đơn test chưa chuyển tiền. Nếu tiền đã vào payOS, server sẽ từ chối hủy và đối soát thành `paid`.

## Kiểm tra 4 tab tính
### 1. Lương hưu
Kiểm tra như v3.6.

### 2. BHXH một lần
- Nhập/đọc quá trình đóng ở tab Lương hưu.
- Chuyển sang `BHXH một lần`.
- Nhập tháng giải quyết + lý do.
- Nếu tổng thời gian < 12 tháng, nhập thêm tổng tiền BHXH thực tế đã đóng để ra số tiền chính xác theo giới hạn luật.

### 3. Trợ cấp thất nghiệp
- Chỉ dùng tab này cho tháng cuối đóng BHTN từ 01/2026 trở đi.
- Nhập tổng tháng BHTN chưa sử dụng, vùng và 6 tháng lương đóng BHTN gần nhất.

### 4. Thai sản
- Chọn BHXH bắt buộc/tự nguyện.
- Chọn trường hợp.
- Với lao động nữ sinh con thuộc BHXH bắt buộc, nhập đủ 6 tháng tiền lương đóng gần nhất.

## Kiểm tra lượt
Tài khoản → xem số dư trước và sau:
- Một phép tính thủ công hợp lệ: `Lượt nhập thủ công` giảm 1.
- Một lần đọc file/ảnh thành công: `Lượt nhập bằng file/ảnh tự động` giảm 1.
- Tính lương hưu/BHXH một lần lại trên dữ liệu file đã đọc: không giảm thêm lượt thủ công.
- Bấm `Lưu kết quả vào lịch sử`: `Lượt lưu lịch sử` giảm 1.

## Kiểm tra lịch sử
Tài khoản → `Lịch sử đã lưu` → `Tra cứu`.
Kết quả phải mở được chi tiết tương ứng cho lương hưu, BHXH một lần, thất nghiệp hoặc thai sản.

## Lưu ý pháp lý
Công cụ chỉ là mô phỏng. Trước khi mở bán rộng, cần rà soát văn bản mới, đặc biệt:
- hệ số điều chỉnh tiền lương/thu nhập theo năm giải quyết;
- mức tham chiếu;
- mức lương tối thiểu vùng;
- hướng dẫn thi hành Luật Việc làm 2025 và Luật BHXH 2024.
