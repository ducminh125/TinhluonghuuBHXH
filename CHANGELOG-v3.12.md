# CHANGELOG v3.12

## Thai sản: bỏ lựa chọn gây hiểu nhầm, chỉ hiện dữ kiện có tác động

### Lao động nữ sinh con
- Bỏ 2 checkbox độc lập “dưỡng thai” và “điều trị vô sinh”.
- Thay bằng một lựa chọn **Tình trạng trước khi sinh** để bảo đảm chỉ áp dụng một nhóm điều kiện:
  - thông thường: đủ 06 tháng đóng trong 12 tháng trước sinh;
  - phải nghỉ việc để dưỡng thai theo chỉ định: đã đóng từ đủ 12 tháng trước đó và đủ 03 tháng trong 12 tháng trước sinh;
  - phải nghỉ việc để điều trị vô sinh: đủ 06 tháng trong 24 tháng trước sinh.
- Các ô số tháng liên quan tự ẩn/hiện theo lựa chọn.

### Lao động nam có vợ sinh con
- Tách dữ kiện “vợ sinh phải phẫu thuật” và “sinh con dưới 32 tuần tuổi”.
- Một con: phẫu thuật hoặc dưới 32 tuần → 07 ngày; thông thường → 05 ngày.
- Sinh đôi trở lên: dùng quy tắc nhiều con; chỉ trường hợp **phẫu thuật** mới chuyển sang mốc 14 ngày cho sinh đôi.
- Đổi checkbox “cha đủ điều kiện nhận trợ cấp một lần” thành dữ kiện thực tế **“Mẹ không đủ điều kiện hưởng chế độ thai sản khi sinh con”**. Hệ thống tự kiểm tra cha đủ 06 tháng đóng trong 12 tháng trước sinh trước khi cộng trợ cấp một lần.
- Nếu cha vẫn đủ điều kiện nghỉ khi vợ sinh nhưng chưa đủ 06/12 tháng cho trợ cấp một lần, hệ thống vẫn tính phần nghỉ và ghi rõ vì sao chưa cộng trợ cấp một lần.

### UI
- Chỉ hiện các lựa chọn đặc biệt khi đúng loại hồ sơ.
- Ẩn tuổi thai, số ngày nghỉ, 12/24 tháng, tổng thời gian đóng và bảng lương khi không cần cho phép tính đang chọn.

### Tương thích
- Backend engine vẫn chấp nhận tên trường v3.11 để tránh lỗi với trình duyệt còn cache bản cũ.
- Không cần migration Supabase.
