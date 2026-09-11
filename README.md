# VN Pension Calculator — Tính lương hưu theo Luật BHXH 2024

Web tĩnh (HTML/CSS/JavaScript) để ước tính lương hưu tại Việt Nam theo **Luật Bảo hiểm xã hội số 41/2024/QH15**, áp dụng cho chế độ mới từ **01/07/2025**. Repo không cần backend và có thể triển khai miễn phí bằng GitHub Pages.

> **Lưu ý:** Đây là công cụ tham khảo, không thay thế kết quả giải quyết chế độ của cơ quan BHXH. Bản v1 yêu cầu người dùng nhập **mức bình quân tiền lương/thu nhập làm căn cứ tính lương hưu đã được xác định và điều chỉnh đúng quy định**.

## Tính năng

- BHXH bắt buộc và BHXH tự nguyện.
- Tỷ lệ lương hưu nam/nữ theo Luật BHXH 2024.
- Làm tròn tháng lẻ đóng BHXH: 1–6 tháng = 0,5 năm; 7–11 tháng = 1 năm.
- Tự xác định tháng đạt tuổi nghỉ hưu theo lộ trình Nghị định 135/2020/NĐ-CP.
- Mốc tuổi thấp hơn 05/10 năm được tính theo **lộ trình riêng theo năm**, không trừ cơ học 60/120 tháng từ ngày nghỉ hưu bình thường.
- Kiểm tra một số nhóm nghỉ sớm theo Điều 64 và Điều 65.
- Giảm tỷ lệ do nghỉ hưu trước tuổi khi suy giảm khả năng lao động.
- Tùy chọn áp dụng mức lương hưu tối thiểu bằng mức tham chiếu cho đúng nhóm đủ điều kiện theo Nghị định 158/2025/NĐ-CP.
- Unit test cho công thức cốt lõi và các mốc tuổi nghỉ hưu mẫu.

## Cơ sở pháp lý đã mã hóa

### 1. Điều kiện và tỷ lệ hưởng

Theo Điều 64 Luật BHXH 2024, nhiều nhóm người lao động tham gia BHXH bắt buộc được hưởng lương hưu khi nghỉ việc, có **từ đủ 15 năm đóng BHXH** và đáp ứng điều kiện tuổi/nghề tương ứng.

Theo Điều 66:

- **Nữ:** 15 năm = 45%; sau đó mỗi năm +2%; tối đa 75%.
- **Nam:** 20 năm = 45%; sau đó mỗi năm +2%; tối đa 75%.
- **Nam từ đủ 15 đến dưới 20 năm:** 15 năm = 40%; sau đó mỗi năm +1%.
- Trường hợp đủ điều kiện theo Điều 65 (suy giảm khả năng lao động), cứ mỗi năm nghỉ trước tuổi giảm 2%; lẻ dưới 6 tháng không giảm, từ đủ 6 đến dưới 12 tháng giảm 1%.

Theo khoản 6 Điều 5: khi tính mức hưởng, thời gian đóng có tháng lẻ **01–06 tháng = 0,5 năm; 07–11 tháng = 1 năm**.

### 2. Tuổi nghỉ hưu bình thường

Theo Điều 169 Bộ luật Lao động 2019 và Nghị định 135/2020/NĐ-CP:

- Năm 2026: nam 61 tuổi 6 tháng; nữ 57 tuổi.
- Năm 2027: nam 61 tuổi 9 tháng; nữ 57 tuổi 4 tháng.
- Nam đạt 62 tuổi từ năm 2028.
- Nữ tăng 4 tháng/năm và đạt 60 tuổi từ năm 2035.

### 3. Mức bình quân tiền lương

Điều 72 Luật BHXH 2024 quy định cách xác định mức bình quân tùy chế độ tiền lương và thời điểm bắt đầu tham gia. Ví dụ, người có toàn bộ thời gian theo tiền lương do người sử dụng lao động quyết định tính bình quân của toàn bộ thời gian; nhóm lương Nhà nước có số năm bình quân khác nhau theo thời điểm bắt đầu tham gia.

Bản v1 **không tự tái dựng mức bình quân từ lịch sử đóng** vì cần hệ số điều chỉnh tiền lương/thu nhập theo từng thời kỳ. Đây là phần nên làm ở v2 bằng bảng lịch sử từng tháng.

### 4. Mức tham chiếu

Theo khoản 13 Điều 141 Luật BHXH 2024, khi chưa bãi bỏ mức lương cơ sở thì mức tham chiếu bằng mức lương cơ sở. Từ **01/07/2026**, mức lương cơ sở/mức tham chiếu là **2.530.000 đồng/tháng** theo Nghị định 161/2026/NĐ-CP và thông tin hướng dẫn của BHXH Việt Nam.

Tùy chọn “mức tối thiểu bằng mức tham chiếu” trong giao diện chỉ được bật nếu người sử dụng đã xác định mình thuộc đúng nhóm được bảo đảm tại Điều 13 Nghị định 158/2025/NĐ-CP.

## Nguồn tham khảo

- Luật BHXH 41/2024/QH15: https://xaydungchinhsach.chinhphu.vn/toan-van-luat-so-41-2024-qh15-bao-hiem-xa-hoi-119240723163650489.htm
- Nghị định 158/2025/NĐ-CP: https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm
- Thông tư 12/2025/TT-BNV: https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm
- Tra cứu tuổi nghỉ hưu: https://xaydungchinhsach.chinhphu.vn/tra-cuu-tuoi-nghi-huu-thoi-diem-nghi-huu-cua-nguoi-lao-dong-theo-nam-sinh-119241029170451525.htm
- BHXH Việt Nam về mức tham chiếu từ 01/07/2026: https://baohiemxahoi.gov.vn/tintuc/Pages/linh-vuc-bao-hiem-xa-hoi.aspx?CateID=168&itemID=26585

## Chạy local

Vì JavaScript dùng ES modules, hãy chạy bằng web server thay vì double-click file `index.html`:

```bash
npx serve .
```

Hoặc:

```bash
python -m http.server 8080
```

Sau đó mở `http://localhost:8080`.

## Chạy test

```bash
npm test
```

## Deploy GitHub Pages

1. Tạo repo mới trên GitHub, ví dụ `vn-pension-calculator`.
2. Upload toàn bộ thư mục này lên branch `main`.
3. Vào **Settings → Pages**.
4. Ở **Build and deployment**, chọn **GitHub Actions**.
5. Workflow `.github/workflows/pages.yml` sẽ tự deploy sau mỗi lần push lên `main`.

## Phạm vi chưa hỗ trợ trong v1

- Tự tính mức bình quân từ toàn bộ lịch sử đóng BHXH và hệ số điều chỉnh từng năm.
- Các chế độ đặc thù của lực lượng vũ trang.
- Nhiễm HIV/AIDS do tai nạn rủi ro nghề nghiệp.
- Điều ước quốc tế khi thời gian đóng ở Việt Nam dưới 15 năm.
- Một số quy định chuyển tiếp/hồ sơ chờ hưu trước đây.
- Tự tính trợ cấp một lần khi thời gian đóng vượt 30 năm (nữ) hoặc 35 năm (nam), đặc biệt phần đóng sau tuổi nghỉ hưu.

## Kiến trúc

```text
vn-pension-calculator/
├─ index.html
├─ styles.css
├─ js/
│  ├─ rules.js       # dữ liệu pháp lý có thể cập nhật
│  ├─ pension.js     # engine tính toán thuần hàm
│  └─ app.js         # UI / form / render kết quả
├─ tests/
│  └─ pension.test.js
├─ .github/workflows/pages.yml
├─ package.json
└─ README.md
```

Thiết kế này cố ý tách `rules.js` khỏi `pension.js` để khi lương cơ sở/mức tham chiếu hoặc lộ trình luật thay đổi, có thể cập nhật cấu hình mà không sửa toàn bộ giao diện.
