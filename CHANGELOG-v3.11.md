# CHANGELOG v3.11

## 1. Sửa điều kiện hưởng BHXH một lần
- Không còn tính BHXH một lần chỉ dựa trên quá trình đóng.
- Kiểm tra điều kiện theo từng lý do trước khi tính tiền.
- Trường hợp **có thời gian đóng trước 01/07/2025, sau 12 tháng không tiếp tục tham gia**:
  - phải có thời gian đóng trước 01/07/2025;
  - xác nhận đã chấm dứt tham gia;
  - xác nhận đủ 12 tháng không thuộc BHXH bắt buộc và không tham gia BHXH tự nguyện;
  - tổng thời gian đóng phải **chưa đủ 20 năm**.
- Trường hợp **đủ tuổi hưởng lương hưu**: kiểm tra tuổi theo ngày sinh/giới tính và thời gian đóng phải **chưa đủ 15 năm**.
- Trường hợp định cư ở nước ngoài hoặc bệnh/suy giảm thuộc diện luật định được kiểm tra riêng; không áp dụng sai ngưỡng 20 năm cho mọi lý do.

## 2. Rà soát điều kiện các chế độ khác
### Lương hưu
- Kết quả `eligible=false` được chặn ở server trước khi trừ lượt.
- Chưa đủ tuổi/thời gian đóng/trường hợp đặc thù: chỉ thông báo lý do.

### Trợ cấp thất nghiệp
Bổ sung kiểm tra đầy đủ trước khi tính:
- đang đóng BHTN khi chấm dứt việc làm;
- chấm dứt việc làm đúng pháp luật và không nghỉ khi đã đủ điều kiện hưởng lương hưu;
- từ đủ 12 tháng đóng trong 24 tháng trước nghỉ; hợp đồng từ 01 đến dưới 12 tháng xét trong 36 tháng;
- hồ sơ nộp trong 03 tháng;
- không thuộc trường hợp loại trừ trong 10 ngày làm việc sau khi nộp đủ hồ sơ;
- tổng thời gian BHTN chưa sử dụng phải đủ để phát sinh lần hưởng.

### Thai sản
- Nữ sinh con thông thường: đủ 06 tháng trong 12 tháng trước sinh.
- Nghỉ dưỡng thai theo chỉ định: đã đóng từ đủ 12 tháng trước đó và đủ 03 tháng trong 12 tháng trước sinh.
- Điều trị vô sinh: đủ 06 tháng trong 24 tháng trước sinh.
- Cha nghỉ khi vợ sinh: phải đang tham gia BHXH bắt buộc tại thời điểm vợ sinh.
- Vợ sinh phẫu thuật/con dưới 32 tuần: áp dụng nhóm ngày nghỉ đặc biệt.
- Cha nhận trợ cấp một lần khi mẹ không đủ điều kiện: kiểm tra đủ 06 tháng trong 12 tháng trước sinh.
- Khám thai, thai nghén và biện pháp tránh thai được bổ sung kiểm tra tình trạng tham gia; biện pháp tránh thai còn yêu cầu thực hiện tại cơ sở khám chữa bệnh.

## 3. Không trừ lượt khi không đủ điều kiện
- `/api/benefits/calculate` trả `422 BENEFIT_NOT_ELIGIBLE`, `charged:false` trước khi `consumeCredit`.
- `/api/calculate` trả `422 PENSION_NOT_ELIGIBLE`, `charged:false` trước khi `consumeCredit`.
- Frontend hiển thị **“Chưa đủ điều kiện hưởng. Lượt tính không bị trừ.”** và danh sách lý do.
- Không hiển thị mức hưởng, không tạo nút lưu lịch sử cho kết quả không đủ điều kiện.
- Dữ liệu đầu vào không hợp lệ cũng được trả về trước bước trừ lượt.

## 4. Kỹ thuật
- Version: `3.11.0`.
- Không cần migration Supabase mới.
- Không thay đổi payOS/webhook hoặc Environment Variables.
- Test suite: 72/72 PASS tại thời điểm đóng gói.
