# CHANGELOG v3.7

## Quản trị
- `Gói đăng ký`: giữ chức năng thêm/sửa/bật-tắt và bổ sung **Xóa** gói cũ.
- Khi xóa gói, `orders.plan_id` của các đơn lịch sử được đưa về `NULL`; tên gói, số tiền và số lượt snapshot trong đơn vẫn được giữ để đối soát.
- `Đơn hàng chờ xác nhận`: bổ sung **Hủy thanh toán**.
- Với đơn payOS, trước khi hủy server đối soát trạng thái. Nếu payOS đã báo `PAID`, hệ thống không hủy mà xác nhận tiền và cộng lượt; nếu chưa thanh toán thì hủy QR/link payOS rồi chuyển đơn local sang `cancelled`.

## Các chế độ mới
Trang chính có 4 tab:
1. **Lương hưu** — giữ engine hiện có.
2. **BHXH một lần** — sử dụng trực tiếp quá trình đóng BHXH đã nhập/đọc file.
3. **Trợ cấp thất nghiệp** — công thức Luật Việc làm 2025 áp dụng từ 01/01/2026.
4. **Chế độ thai sản** — các trường hợp phổ biến của BHXH bắt buộc và trợ cấp thai sản BHXH tự nguyện.

## Đồng bộ lượt sử dụng
- Phép tính hợp lệ bằng dữ liệu **thủ công**: trừ 01 `direct_credits` (UI: **Lượt nhập thủ công**).
- Đọc file/ảnh thành công: trừ 01 `file_credits` (UI: **Lượt nhập bằng file/ảnh tự động**).
- Cùng dữ liệu quá trình đã đọc từ file/ảnh có thể dùng để tính lương hưu và BHXH một lần mà không trừ thêm lượt thủ công.
- Lưu một kết quả bất kỳ: trừ 01 `history_credits` (UI: **Lượt lưu lịch sử**).
- Ví lượt được cập nhật lại ngay sau khi tính/lưu.

## Lịch sử
Lịch sử dùng chung cho cả 4 loại kết quả. `benefitType` được lưu trong JSON để tương thích schema hiện tại; không cần thêm cột database.
- Lương hưu: giữ chi tiết cũ.
- BHXH một lần: số tiền, mức bình quân, tổng thời gian, quy đổi trước/từ 2014, điều kiện, toàn bộ quá trình đóng.
- Thất nghiệp: mức/tháng, số tháng hưởng, tổng ước tính, bình quân 6 tháng, vùng và trần.
- Thai sản: loại tham gia, trường hợp, mức tháng/ngày, thời gian, trợ cấp một lần và tổng ước tính.

## Công thức mới
### BHXH một lần
- Trước 2014: 1,5 tháng mức bình quân cho mỗi năm.
- Từ 2014: 2 tháng mức bình quân cho mỗi năm.
- Có cả hai giai đoạn: tháng lẻ trước 2014 chuyển sang giai đoạn từ 2014.
- Dưới 1 năm: bằng số tiền thực tế đã đóng nhưng tối đa 2 tháng mức bình quân; công cụ yêu cầu nhập số tiền đã đóng để không tự bịa số.
- Có BHXH tự nguyện: cảnh báo cần loại phần ngân sách hỗ trợ, trừ trường hợp pháp luật cho phép.

### Trợ cấp thất nghiệp
- Tab v3.7 áp dụng sự kiện từ 01/01/2026.
- Mức tháng: 60% bình quân 6 tháng đóng BHTN gần nhất.
- Trần: 5 lần lương tối thiểu vùng tại tháng cuối đóng BHTN.
- 12–36 tháng đóng: 3 tháng hưởng; mỗi 12 tháng thêm: +1 tháng; tối đa 12 tháng.

### Thai sản
- Bắt buộc: mức tháng bằng 100% bình quân tiền lương đóng BHXH gần nhất theo Luật BHXH 2024; sinh con dùng đủ 6 mức lương gần nhất.
- Trợ cấp một lần khi sinh: 2 lần mức tham chiếu/con khi đủ điều kiện.
- Khám thai/nam khi vợ sinh: mức ngày = mức tháng / 24.
- Sảy thai/đình chỉ thai nghén và biện pháp tránh thai: mức ngày = mức tháng / 30, giới hạn ngày theo luật.
- BHXH tự nguyện: 2.000.000 đồng/con khi đủ điều kiện; nếu cả cha và mẹ đều đủ điều kiện tự nguyện thì chỉ một người hưởng cho cùng lần sinh.

## Tương thích database
v3.7 **không bắt buộc migration SQL mới** nếu v3.6 đang chạy bình thường. Các bảng và RPC hiện tại được tái sử dụng.

## Kiểm thử
- 50/50 test Node PASS tại thời điểm đóng gói v3.7.
- Bao gồm test mới cho BHXH một lần, BHTN, thai sản, admin xóa gói/hủy đơn, đồng bộ credit và lịch sử nhiều loại chế độ.
