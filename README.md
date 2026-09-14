# VN Pension Calculator v2.4

Web ước tính lương hưu Việt Nam theo Luật Bảo hiểm xã hội 2024. Dữ liệu hồ sơ có thể được nhập trực tiếp hoặc trích xuất từ ảnh/PDF/Word/Excel; phép tính lương hưu được thực hiện bởi engine quy tắc trong source code.

> Công cụ dùng để tham khảo, kiểm tra và mô phỏng. Kết quả chính thức phụ thuộc dữ liệu cơ quan BHXH ghi nhận và văn bản có hiệu lực tại thời điểm giải quyết chế độ.

## 1. Chức năng chính

- Tự xác định **tháng dự kiến nghỉ hưu** từ ngày sinh + giới tính theo lộ trình tuổi nghỉ hưu.
- Không bắt người dùng chọn một loại BHXH chung ở đầu form; chế độ được xác định theo **từng giai đoạn đóng**.
- Nhập quá trình đóng theo `Từ tháng → Đến tháng`, bằng **hệ số** hoặc **VND/tháng**. Giao diện dùng định dạng Việt Nam: ngày `dd/mm/yyyy`, tháng `mm/yyyy`.
- Tính mức bình quân từ lịch sử đóng thay vì yêu cầu người dùng tự nhập mức bình quân.
- Cho phép nhập các khoản **phụ cấp/khoản bổ sung thuộc căn cứ đóng BHXH** trước khi tính bình quân.
- Import đồng thời nhiều **JPG / PNG / WEBP / PDF / Word / Excel / CSV / TXT**.
- Sau khi đọc file, các giai đoạn đủ dữ liệu được **tự động điền ngay vào quá trình đóng**. Bảng **“Dữ liệu nhận diện được / Dữ liệu còn thiếu”** chỉ xuất hiện khi còn thông tin chưa rõ, trường bắt buộc bị thiếu hoặc có xung đột cần người dùng xác nhận.
- Tự lọc phần thời gian bị trùng do nhiều ảnh chụp có vùng gối nhau.
- Nếu cùng một tháng xuất hiện hai giá trị khác nhau, hệ thống **không tự chọn số mới** mà giữ bản đọc trước và cảnh báo tháng cần đối chiếu.
- Tùy chọn **tự bổ sung quá trình đóng đến tháng nghỉ hưu**:
  - mức đóng bằng VND: giữ mức lương/thu nhập hiện tại;
  - lương Nhà nước theo hệ số: tự nhận diện tháng bắt đầu bậc hiện tại, chu kỳ 24/36/60 tháng, mức tăng hệ số và hệ số tối đa từ lịch sử đổi hệ số + thang hệ số tích hợp; người dùng chỉ cần hiệu chỉnh khi hồ sơ có trường hợp đặc thù.
- Kết quả tương lai chỉ có một ghi chú ngắn **“Kết quả đang tạm tính”** ở cuối phần kết quả.

## 2. Cơ sở pháp lý được mô hình hóa

Các rule chính hiện đặt trong `js/rules.js`, `js/contributions.js` và `js/pension.js`:

- Luật Bảo hiểm xã hội số **41/2024/QH15**, hiệu lực từ 01/07/2025;
- Nghị định **135/2020/NĐ-CP** về tuổi nghỉ hưu;
- Nghị định **158/2025/NĐ-CP** quy định chi tiết về BHXH bắt buộc;
- Nghị định **204/2004/NĐ-CP** và các sửa đổi còn hiệu lực (trong đó có Nghị định **07/2026/NĐ-CP**) làm cơ sở cho các thang hệ số lương phổ biến dùng ở phần nhận diện dự báo;
- Thông tư **12/2025/TT-BNV** và các quy định hướng dẫn có liên quan;
- Thông tư **08/2013/TT-BNV**, được sửa đổi bởi Thông tư **03/2021/TT-BNV**, dùng làm cơ sở cho cấu hình chu kỳ nâng bậc thường xuyên;
- Nghị định **161/2026/NĐ-CP**: mức lương cơ sở 2.530.000 đồng/tháng từ 01/07/2026;
- bộ hệ số điều chỉnh tiền lương/thu nhập đã đóng BHXH năm 2025 và năm 2026 đang tích hợp trong source.

### Khoảng thời gian bình quân của nhóm lương Nhà nước

Theo mốc bắt đầu tham gia BHXH bắt buộc, engine đang mô hình hóa:

| Bắt đầu tham gia | Khoảng lương Nhà nước dùng tính bình quân |
|---|---:|
| Trước 1995 | 60 tháng |
| 1995–2000 | 72 tháng |
| 2001–2006 | 96 tháng |
| 2007–2015 | 120 tháng |
| 2016–2019 | 180 tháng |
| 2020–2024 | 240 tháng |
| Từ 2025 | Toàn bộ thời gian |

Với lịch sử hỗn hợp, engine giữ riêng logic lương Nhà nước, lương do người sử dụng lao động quyết định và BHXH tự nguyện trước khi tổng hợp mức bình quân.

## 3. Phụ cấp tính đóng BHXH

### 3.1. Tiền lương do Nhà nước quy định, nhập bằng hệ số

Mỗi giai đoạn có thể nhập riêng:

- hệ số lương chính;
- hệ số phụ cấp chức vụ;
- tỷ lệ phụ cấp thâm niên vượt khung;
- tỷ lệ phụ cấp thâm niên nghề;
- hệ số chênh lệch bảo lưu.

Engine quy đổi thành tổng hệ số làm căn cứ đóng theo cấu trúc:

```text
TNVK = hệ số lương × % TNVK
Thâm niên nghề = (hệ số lương + PC chức vụ + TNVK quy hệ số) × % thâm niên nghề
Tổng hệ số đóng = hệ số lương + PC chức vụ + TNVK + thâm niên nghề + chênh lệch bảo lưu
```

Nếu hồ sơ đã ghi **tổng tiền lương làm căn cứ đóng BHXH bằng VND**, hãy nhập tổng đó ở cột lương và để phụ cấp riêng bằng 0 để tránh cộng hai lần.

### 3.2. Tiền lương do người sử dụng lao động quyết định

Có thể nhập:

- tiền lương công việc/chức danh;
- tổng phụ cấp và khoản bổ sung ổn định **thuộc căn cứ đóng BHXH**.

Engine cộng hai phần này trước khi áp dụng hệ số điều chỉnh và tính bình quân.

Không nên nhập các khoản chỉ phụ thuộc biến động năng suất/kết quả làm việc nếu chúng không thuộc căn cứ đóng BHXH của hồ sơ.

## 4. Import nhiều ảnh/tệp và chống trùng

Phần import được đặt ngay trong **mục 2 - Quá trình đóng BHXH** để người dùng có thể chọn nhập tay hoặc nhập từ file. Frontend cho phép chọn tối đa 20 tệp trong một lần import. Backend đọc toàn bộ nguồn trong cùng một request để có ngữ cảnh giữa các ảnh.

### Trường dữ liệu nên có trong file gửi kèm

Tối thiểu để tạo được một giai đoạn đóng hợp lệ, hồ sơ cần thể hiện:

- từ tháng/năm và đến tháng/năm;
- loại tiền lương/thu nhập hoặc dấu hiệu đủ để xác định nhóm lương Nhà nước, lương do người sử dụng lao động quyết định hay BHXH tự nguyện;
- mức lương đóng bằng **hệ số** hoặc **VND/tháng**;
- nếu hồ sơ tách riêng phụ cấp thuộc căn cứ đóng thì cần thể hiện tên/mức phụ cấp.

Nên có thêm, nếu tài liệu thể hiện:

- ngày sinh, giới tính;
- phụ cấp chức vụ, thâm niên vượt khung, thâm niên nghề, chênh lệch bảo lưu;
- phụ cấp/khoản bổ sung ổn định thuộc căn cứ đóng đối với lương doanh nghiệp;
- ngạch, bậc, chức danh và đơn vị công tác để phục vụ kiểm tra và dự báo nâng bậc;
- tiêu đề cột trên mỗi ảnh/bảng. Với nhiều ảnh chụp liên tiếp, nên giữ một phần giao nhau giữa hai ảnh để hệ thống ghép và lọc trùng.

Nếu hồ sơ đã ghi **tổng tiền lương làm căn cứ đóng BHXH**, hệ thống dùng tổng đó và không cộng phụ cấp lần nữa. Nếu hồ sơ tách lương chính và phụ cấp, hai phần được lưu riêng rồi cộng trước khi tính bình quân.

Sau bước trích xuất, hệ thống xử lý theo cơ chế **tự động điền trước – chỉ hỏi khi chưa rõ**:

- các dòng đủ **từ tháng, đến tháng, chế độ và mức đóng/hệ số** được tự động đưa vào quá trình đóng ngay sau khi đọc xong;
- dữ liệu được ghép với phần người dùng đã nhập và chạy qua `dedupeImportedPeriods()` để loại phần tháng trùng;
- bảng **“Dữ liệu nhận diện được / Dữ liệu còn thiếu”** chỉ xuất hiện khi có dòng thiếu trường bắt buộc, dữ liệu giữa các ảnh/tệp xung đột, hoặc thông tin cá nhân đọc được khác với dữ liệu đang nhập;
- các dòng chưa đủ dữ liệu không được tự động chèn vào phép tính cho đến khi người dùng bổ sung/đối chiếu.

Trong lúc đọc, giao diện hiển thị trạng thái xử lý theo từng bước và số giây đã chạy để tránh hiểu nhầm ứng dụng bị treo. Thanh tiến trình là dạng **đang hoạt động** chứ không giả lập phần trăm hoàn thành.

Sau đó dữ liệu hợp lệ được xử lý như sau:

1. Mỗi giai đoạn được mở rộng theo từng tháng.
2. Cùng tháng + cùng chế độ + cùng lương/phụ cấp → coi là trùng và chỉ giữ một bản.
3. Cùng tháng nhưng khác lương/phụ cấp → đánh dấu xung đột, giữ bản xuất hiện trước và cảnh báo người dùng đối chiếu.
4. Các tháng liên tiếp có dữ liệu giống nhau được nén lại thành một giai đoạn.

Nhờ vậy ảnh 1 kết thúc ở 06/2024 và ảnh 2 chụp lặp lại 05–06/2024 trước khi tiếp tục từ 07/2024 sẽ không làm tăng sai số tháng đóng.

## 5. Tự bổ sung quá trình đóng đến nghỉ hưu

Bật lựa chọn **“Tự bổ sung quá trình đóng đến tháng nghỉ hưu”** để tạo dữ liệu giả định từ tháng ngay sau giai đoạn thực tế cuối cùng.

### Mức đóng bằng VND

Web giữ nguyên:

- tiền lương/thu nhập hiện tại;
- phụ cấp/khoản bổ sung tính đóng hiện tại (nếu có).

Mức này được kéo dài đến tháng nghỉ hưu.

### Lương Nhà nước theo hệ số

Web dùng `inferStateSalaryProgression()` để tự xác định từ lịch sử hệ số:

- **tháng bắt đầu hưởng bậc hiện tại**: tháng đầu tiên của giai đoạn liên tục có hệ số hiện tại;
- **chu kỳ xét nâng bậc**: ưu tiên khoảng cách thực tế giữa các lần đổi hệ số nếu khớp 24/36/60 tháng, nếu chưa đủ lịch sử thì dùng chu kỳ của thang lương nhận diện được;
- **mức tăng hệ số mỗi bậc**: chênh lệch sang bậc kế tiếp trong thang hệ số;
- **hệ số tối đa của ngạch**: bậc cuối của thang hệ số nhận diện được.

Các thang A3.1, A3.2, A2.1, A2.2, A1, A0, B, C... được tách trong `js/salary-scales.js`. Nếu một hệ số xuất hiện ở nhiều thang và lịch sử không đủ phân biệt, engine **không ép chọn** mà chỉ tự điền phần có thể xác định chắc chắn và cảnh báo kiểm tra. Chu kỳ 60/36/24 tháng được mô hình hóa theo Thông tư 08/2013/TT-BNV (được sửa đổi, bổ sung).

Các mốc thay đổi **mức lương cơ sở** có trong `BASE_SALARY_LEVELS` được áp dụng tự động khi quy đổi từng tháng. Nếu tương lai có bảng lương mới, hệ số mới hoặc quy định mới chưa có trong repo, kết quả phải được cập nhật lại.

### Xử lý dữ liệu lương Nhà nước rất cũ

Engine chọn đúng cửa sổ 5/6/8/10/15/20 năm (hoặc toàn bộ thời gian) **trước khi quy đổi giá trị từng tháng**. Vì vậy một tháng VND rất cũ nằm ngoài cửa sổ dùng tính bình quân không còn làm toàn bộ phép tính dừng.

Nếu một tháng **trước 01/04/1993** thực sự nằm trong cửa sổ tính bình quân và hồ sơ chỉ có số tiền VND, engine không tự chia cho một mức lương cơ sở giả định. Trường hợp này cần bổ sung hệ số/ngạch bậc hoặc dữ liệu chuyển xếp tiền lương lịch sử để quy đổi chính xác.

## 6. Kết quả đang tạm tính

Thông báo tạm tính được rút gọn và đặt **cuối cùng** trong phần kết quả. Kết quả được đánh dấu tạm tính khi có một trong các tình huống như:

- có tháng tương lai do người dùng chọn tự bổ sung;
- năm hưởng nằm sau bộ hệ số điều chỉnh mới nhất đã tích hợp;
- mức lương cơ sở/mức tham chiếu tương lai chưa có văn bản mới trong bộ rule hiện tại.

## 7. Kết nối AI để đọc hồ sơ

API key chỉ nằm ở backend; tuyệt đối không đưa key vào trình duyệt hoặc commit GitHub.

```env
SHOPAIKEY_API_KEY=your-api-key
SHOPAIKEY_BASE_URL=https://api.shopaikey.com/v1
SHOPAIKEY_MODEL=gpt-5.6-terra
PORT=3000
```

Các biến trên giữ nguyên theo gateway API đang sử dụng, nhưng giao diện người dùng không hiển thị tên gateway/model.

Model chỉ trả dữ liệu cấu trúc, ví dụ:

```json
{
  "person": {"birthDate":"1969-05-20", "sex":"female"},
  "periods": [
    {
      "from":"2024-07",
      "to":"2025-06",
      "regime":"state",
      "valueType":"coefficient",
      "coefficient":4.98,
      "positionAllowanceCoeff":0.3,
      "seniorityBeyondPercent":0,
      "professionalSeniorityPercent":10,
      "reservedDifferenceCoeff":0,
      "allowanceVnd":0,
      "note":"Nguồn: ảnh quá trình đóng"
    }
  ],
  "warnings":[]
}
```

AI **không quyết định lương hưu cuối cùng**. Dữ liệu sau import vẫn được người dùng xem lại, sau đó engine JavaScript mới tính.

## 8. Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
cp .env.example .env
# điền API key trong .env
npm start
```

Mở `http://localhost:3000`.

Kiểm tra backend: `GET /api/health`.

## 9. Deploy từ GitHub

Có thể đưa toàn bộ repo lên GitHub và deploy full-stack lên Vercel/Node hosting.

Cần thiết lập biến môi trường trên nền tảng deploy:

- `SHOPAIKEY_API_KEY`
- `SHOPAIKEY_BASE_URL`
- `SHOPAIKEY_MODEL`

Không commit `.env`.

> GitHub Pages thuần tĩnh vẫn chạy được giao diện và tính toán nhập tay, nhưng không nên gọi API AI trực tiếp từ browser vì sẽ làm lộ API key.

## 10. Cấu trúc repo

```text
vn-pension-calculator-v2/
├── index.html
├── styles.css
├── js/
│   ├── rules.js
│   ├── pension.js
│   ├── contributions.js
│   ├── salary-scales.js
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

## 11. Kiểm thử

```bash
npm test
```

Bộ test bao gồm:

- tuổi nghỉ hưu và tỷ lệ hưởng;
- giảm trừ nghỉ trước tuổi;
- làm tròn tháng lẻ;
- phát hiện tháng đóng trùng;
- lọc trùng từ nhiều ảnh;
- cảnh báo dữ liệu chồng lấn nhưng khác giá trị;
- lương Nhà nước trước/sau 2016;
- phụ cấp tính đóng của lương Nhà nước;
- phụ cấp/khoản bổ sung của lương doanh nghiệp;
- lịch sử đóng hỗn hợp;
- BHXH tự nguyện;
- giữ mức VND hiện tại đến nghỉ hưu;
- tự nhận diện thang lương, bậc hiện tại, chu kỳ và mức tăng hệ số;
- hồi quy lỗi lương Nhà nước VND rất cũ nằm ngoài cửa sổ bình quân;
- mô phỏng nâng hệ số theo chu kỳ tự nhận diện/đã hiệu chỉnh;
- đánh dấu tạm tính khi dùng dữ liệu tương lai.

## 12. Khuyến nghị trước khi dùng nghiệp vụ chính thức

- Đối chiếu tối thiểu 20–50 hồ sơ đã có quyết định hưởng thực tế.
- Bổ sung thêm bảng lương/ngạch/bậc chuyên ngành ngoài các thang phổ biến đã tích hợp để tăng khả năng tự nhận diện.
- Cập nhật mức lương cơ sở, mức tham chiếu và hệ số điều chỉnh ngay khi có văn bản mới.
- Nếu lưu hồ sơ cá nhân lên server, cần bổ sung xác thực, mã hóa, thời hạn lưu và chính sách dữ liệu. Bản hiện tại không lưu hồ sơ vào database.
