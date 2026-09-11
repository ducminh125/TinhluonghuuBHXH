# VN Pension Calculator v2

Web ước tính lương hưu Việt Nam theo Luật Bảo hiểm xã hội 2024, có khả năng:

- tự xác định **tháng đủ tuổi nghỉ hưu** từ ngày sinh + giới tính;
- nhập **chi tiết quá trình đóng BHXH theo từng giai đoạn**;
- chấp nhận tiền lương Nhà nước nhập bằng **hệ số** hoặc **VND/tháng**;
- tự tính mức bình quân tiền lương/thu nhập làm căn cứ tính lương hưu;
- hỗ trợ lịch sử có lương Nhà nước, lương do NSDLĐ quyết định và BHXH tự nguyện trong cùng một hồ sơ;
- nhập nhanh dữ liệu từ **PDF / Word / Excel / CSV / TXT** bằng ShopAIKey;
- PDF scan có ít lớp chữ được render thành ảnh để gửi model vision;
- AI chỉ trích xuất dữ liệu; **engine JavaScript cố định** mới tính lương hưu.

> Đây là công cụ tham khảo/kiểm tra sơ bộ. Kết quả chính thức phụ thuộc dữ liệu được cơ quan BHXH ghi nhận và quy định có hiệu lực tại thời điểm giải quyết.

## 1. Các thay đổi so với v1

### Bỏ lựa chọn “BHXH bắt buộc / BHXH tự nguyện” ở đầu form

Bản v2 không bắt người dùng phân loại toàn bộ hồ sơ bằng một lựa chọn chung. Mỗi dòng lịch sử đóng có trường **Chế độ tiền lương/thu nhập**:

- `state`: tiền lương do Nhà nước quy định;
- `employer`: tiền lương do người sử dụng lao động quyết định;
- `voluntary`: thu nhập làm căn cứ đóng BHXH tự nguyện;
- `unknown`: AI chưa xác định được — người dùng phải kiểm tra trước khi tính.

### Tự tính tháng dự kiến nghỉ hưu

Sau khi có `Ngày sinh` + `Giới tính`, frontend gọi `statutoryRetirementAttainmentMonth()` và tự điền:

- **Tháng dự kiến nghỉ hưu**: tháng đủ tuổi theo lộ trình Nghị định 135/2020/NĐ-CP;
- **Tháng bắt đầu hưởng**: tháng liền kề sau tháng nghỉ hưu.

Ở điều kiện lao động bình thường, ô tháng nghỉ hưu không cho sửa thủ công. Trường hợp nghỉ hưu đặc thù được đặt trong phần nâng cao và có ô tháng nghỉ thực tế riêng.

### Tính mức bình quân từ lịch sử đóng

Người dùng không còn nhập tay “mức bình quân”. Mỗi giai đoạn gồm:

| Trường | Ý nghĩa |
|---|---|
| Từ tháng | `YYYY-MM` |
| Đến tháng | `YYYY-MM`, tính cả tháng cuối |
| Chế độ | Nhà nước / NSDLĐ / tự nguyện |
| Cách nhập | Hệ số hoặc VND |
| Giá trị | Hệ số hoặc mức đóng/tháng |
| Ghi chú | Đơn vị, chức danh, nguồn dữ liệu... |

Nếu mức đóng thay đổi, tách thành dòng mới. Engine phát hiện tháng bị trùng để tránh cộng thời gian hai lần.

## 2. Cơ sở pháp lý được mô hình hóa

Bản v2 tổ chức rule theo các nhóm chính:

- Luật BHXH số 41/2024/QH15, hiệu lực từ 01/07/2025;
- Nghị định 158/2025/NĐ-CP;
- Thông tư 12/2025/TT-BNV;
- Nghị định 135/2020/NĐ-CP về tuổi nghỉ hưu;
- hệ số điều chỉnh tiền lương/thu nhập năm 2025;
- hệ số điều chỉnh tiền lương/thu nhập năm 2026 theo Công văn 340/BHXH-CSXH ngày 03/02/2026;
- mức tham chiếu/lương cơ sở đang tích hợp: 2.340.000 đồng và từ 01/07/2026 là 2.530.000 đồng.

### Khoảng thời gian bình quân của nhóm lương Nhà nước

Theo thời điểm bắt đầu tham gia BHXH bắt buộc, engine dùng:

- trước 1995: 60 tháng;
- 1995–2000: 72 tháng;
- 2001–2006: 96 tháng;
- 2007–2015: 120 tháng;
- 2016–2019: 180 tháng;
- 2020–2024: 240 tháng;
- từ 2025: toàn bộ thời gian.

Với lịch sử hỗn hợp lương Nhà nước + lương doanh nghiệp, engine tính phần Nhà nước theo cửa sổ nói trên và phần doanh nghiệp trên toàn bộ thời gian đã điều chỉnh.

### Hệ số năm tương lai

Repo chỉ tích hợp các hệ số đã xác định cho 2025 và 2026. Nếu tháng hưởng thuộc **2027 trở đi**, engine dùng dữ liệu mới nhất chỉ để mô phỏng và bắt buộc gắn cảnh báo **TẠM TÍNH**. Không tự bịa hệ số tương lai.

## 3. Lưu ý về dữ liệu “hệ số”

Đối với lương do Nhà nước quy định:

- nếu nhập `coefficient`, giá trị phải là **hệ số dùng làm căn cứ đóng BHXH** của giai đoạn đó;
- nếu hồ sơ chỉ có VND, engine có thể quy đổi trong các giai đoạn đã có dữ liệu mức lương cơ sở lịch sử;
- hồ sơ rất cũ, hồ sơ quân đội/công an, phụ cấp đặc thù, khoản cố định không tỷ lệ theo lương cơ sở hoặc trường hợp chuyển đổi bảng lương cần đối chiếu thêm — web không được coi là thay thế quyết định của cơ quan BHXH.

## 4. ShopAIKey + GPT-5.6 Terra

ShopAIKey cung cấp endpoint tương thích OpenAI. Repo gọi API ở **backend**, không gọi trực tiếp từ trình duyệt.

Biến môi trường:

```env
SHOPAIKEY_API_KEY=sk-your-shopaikey-key
SHOPAIKEY_BASE_URL=https://api.shopaikey.com/v1
SHOPAIKEY_MODEL=gpt-5.6-terra
PORT=3000
```

`SHOPAIKEY_MODEL` để cấu hình thay vì hard-code sâu trong source. Mặc định theo yêu cầu hiện tại là `gpt-5.6-terra`. Nếu tài khoản/gateway ShopAIKey trả lỗi model không tồn tại, đổi biến này sang đúng Model ID ShopAIKey đang cấp cho tài khoản.

### AI trả về gì?

Backend yêu cầu model trả JSON:

```json
{
  "person": {
    "birthDate": "1969-05-20",
    "sex": "female"
  },
  "periods": [
    {
      "from": "2018-07",
      "to": "2019-06",
      "regime": "state",
      "valueType": "coefficient",
      "coefficient": 4.98,
      "amountVnd": null,
      "note": "Nguồn: bảng quá trình đóng"
    }
  ],
  "warnings": []
}
```

AI **không được trả lương hưu cuối cùng**. Các dòng JSON được đưa lại vào form để người dùng kiểm tra; `js/contributions.js` và `js/pension.js` mới thực hiện phép tính.

## 5. Bảo mật

Không bao giờ đưa `SHOPAIKEY_API_KEY` vào:

- `index.html`;
- `js/app.js`;
- GitHub commit;
- biến JavaScript có thể xem bằng DevTools.

`.env` đã nằm trong `.gitignore`.

Vì vậy, **GitHub Pages thuần tĩnh chỉ chạy được phần nhập tay/tính toán**, không thể chạy an toàn chức năng AI. Để dùng import AI, chạy Node server hoặc deploy full-stack.

## 6. Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
cp .env.example .env
# sửa SHOPAIKEY_API_KEY trong .env
npm start
```

Mở:

```text
http://localhost:3000
```

Kiểm tra backend:

```text
GET /api/health
```

## 7. Deploy Vercel

Repo có `vercel.json` để route request qua Node entrypoint `server/index.js`.

Sau khi import GitHub repo vào Vercel, cấu hình Environment Variables:

- `SHOPAIKEY_API_KEY`
- `SHOPAIKEY_BASE_URL=https://api.shopaikey.com/v1`
- `SHOPAIKEY_MODEL=gpt-5.6-terra`

Không commit `.env`.

## 8. Cấu trúc repo

```text
vn-pension-calculator-v2/
├── index.html
├── styles.css
├── js/
│   ├── rules.js
│   ├── pension.js
│   ├── contributions.js
│   └── app.js
├── server/
│   ├── index.js
│   ├── parsers.js
│   └── shopaikey.js
├── tests/
│   ├── pension.test.js
│   └── contributions.test.js
├── .github/workflows/test.yml
├── .env.example
├── .gitignore
├── vercel.json
└── package.json
```

## 9. Kiểm thử

```bash
npm test
```

Các test hiện kiểm tra:

- quy tắc làm tròn tháng lẻ;
- tỷ lệ lương hưu nam/nữ;
- giảm trừ nghỉ trước tuổi;
- tháng đủ tuổi nghỉ hưu theo lộ trình;
- mở rộng khoảng đóng theo tháng và phát hiện trùng;
- hệ số điều chỉnh tiền lương doanh nghiệp;
- lương Nhà nước nhập bằng hệ số trước/sau 2016;
- công thức lịch sử hỗn hợp;
- kết hợp BHXH tự nguyện;
- không tự suy đoán hệ số của năm tương lai;
- mức tham chiếu trong trường hợp chuyển tiếp được chọn.

## 10. Những phần cần tiếp tục nếu dùng cho nghiệp vụ thật

1. Bổ sung đầy đủ bảng/mốc quy đổi tiền lương Nhà nước cho hồ sơ rất cũ và các bảng lương chuyên ngành.
2. Lập bộ test đối chiếu với ít nhất 20–50 hồ sơ đã có quyết định hưởng lương hưu thực tế.
3. Bổ sung màn hình xem chi tiết từng tháng sau điều chỉnh để cán bộ có thể audit từng con số.
4. Cập nhật hệ số điều chỉnh và mức tham chiếu mỗi khi có văn bản mới.
5. Nếu lưu hồ sơ cá nhân trên server, phải bổ sung xác thực, mã hóa, thời hạn lưu và chính sách dữ liệu; bản hiện tại không lưu hồ sơ vào database.
