# Deploy v3.12

## 1. Không cần thay database
Không có migration Supabase mới. Không thay đổi payOS, webhook hoặc Environment Variables.

## 2. Deploy
1. Đưa toàn bộ source v3.12 lên repository hiện dùng cho Vercel.
2. Redeploy Production.
3. Mở cửa sổ ẩn danh hoặc Ctrl + F5 để tránh cache `benefits-ui.js` cũ.
4. Kiểm tra `/api/health` phải trả `version: "3.12.0"`.

## 3. Test nhanh tab Thai sản
### Lao động nữ sinh con
- Chọn “Không thuộc trường hợp đặc biệt”: phải hiện ô 12 tháng, ẩn 24 tháng và tổng thời gian đã đóng.
- Chọn “Phải nghỉ việc để dưỡng thai theo chỉ định”: hiện 12 tháng + tổng thời gian đã đóng; 3/12 và tổng >=12 là ngưỡng kiểm tra.
- Chọn “Phải nghỉ việc để điều trị vô sinh”: chỉ hiện ô 24 tháng; ngưỡng 6/24.

### Lao động nam có vợ sinh con
- Chỉ khi chọn trường hợp này mới hiện: vợ sinh phải phẫu thuật; sinh con dưới 32 tuần; mẹ không đủ điều kiện hưởng thai sản.
- Một con, không đặc biệt: 5 ngày.
- Một con, phẫu thuật hoặc dưới 32 tuần: 7 ngày.
- Sinh đôi, không phẫu thuật: 10 ngày.
- Sinh đôi, phẫu thuật: 14 ngày.
- Nếu chọn “mẹ không đủ điều kiện”: hệ thống hiện ô số tháng đóng trong 12 tháng của cha và chỉ cộng trợ cấp một lần khi đủ 6 tháng.

## 4. Kiểm thử source
`npm test` hiện có 80/80 test PASS.
