# Deploy v3.11

v3.11 sửa **điều kiện hưởng và thứ tự trừ lượt**. Không thay đổi database schema, payOS hay Environment Variables.

## Cập nhật
1. Đưa toàn bộ source v3.11 lên repository đang deploy Vercel.
2. Redeploy Production.
3. Nhấn `Ctrl + F5` hoặc mở cửa sổ ẩn danh.
4. Mở `/api/health` và kiểm tra `version: "3.11.0"`.

## Kiểm thử bắt buộc sau deploy
### BHXH một lần
- Chọn lý do “đóng trước 01/07/2025, sau 12 tháng...” với quá trình từ đủ 20 năm trở lên → phải báo **chưa đủ điều kiện**, không hiện tiền, số lượt thủ công không đổi.
- Cùng quá trình trên nhưng chọn “Ra nước ngoài để định cư” + xác nhận đã chấm dứt tham gia → không được chặn chỉ vì trên 20 năm.
- Chọn “Đủ tuổi hưởng lương hưu...” nhưng thời gian đóng từ đủ 15 năm → phải báo chưa đủ điều kiện theo lý do này.

### Trợ cấp thất nghiệp
- Bỏ chọn từng điều kiện (đang đóng, chấm dứt hợp pháp, nộp 3 tháng, điều kiện 10 ngày) → chỉ báo lý do, không trừ lượt.
- Hợp đồng từ 01 đến dưới 12 tháng phải hiển thị/áp dụng cửa sổ 36 tháng.

### Thai sản
- Nữ sinh con thường dưới 6/12 tháng → không tính và không trừ lượt.
- Dưỡng thai: tổng trước đó dưới 12 tháng hoặc dưới 3/12 tháng → không tính.
- Điều trị vô sinh dưới 6/24 tháng → không tính.
- Cha nghỉ khi vợ sinh nhưng không xác nhận đang tham gia BHXH bắt buộc → không tính tiền nghỉ.
- Chọn “vợ sinh phẫu thuật/con dưới 32 tuần” với 1 con → nếu đủ điều kiện, số ngày nghỉ của cha là 7 ngày làm việc.
- Cha nhận trợ cấp một lần do mẹ không đủ điều kiện: cần đủ 6/12 tháng.

### Lương hưu
- Nhập dưới 15 năm trong trường hợp thông thường → server trả thông báo chưa đủ điều kiện, không trừ lượt và không cho lưu lịch sử.

## Database
Không chạy migration mới nếu v3.10 đang hoạt động bình thường.
