# Changelog v3.2

## Sửa lỗi nhập hồ sơ

- Không trừ lượt hồ sơ trước khi parser/AI đọc thành công.
- Chỉ trừ 01 lượt sau khi có ít nhất một giai đoạn BHXH hợp lệ.
- Nếu lỗi xảy ra sau khi đã trừ, tự hoàn lại 01 lượt.
- Frontend refresh số dư ngay khi import lỗi, tránh hiển thị nhầm là đã mất lượt.
- Response lỗi import luôn ưu tiên JSON có `code`, `error`, `errorId`, `charged`, `refunded`, `wallet`.
- Bắt riêng lỗi Multer/file size, không còn để lỗi upload rơi vào Express HTML 500.
- Chặn trước request lớn hơn giới hạn direct upload của Vercel; request chưa gửi không bị trừ lượt.
- Nếu AI không nhận diện được giai đoạn hợp lệ, trả `NO_IMPORTABLE_DATA` và không tính lượt.

## AI

- Model mặc định cho ảnh/PDF: `gemini-2.5-flash`.
- Fallback: `gpt-5.6-luna`.

## Database

- Không bắt buộc migration mới nếu schema v3.1.2 đã hoạt động.
- `supabase/migration-v3.2.sql` là migration tăng cứng tùy chọn, thêm charge/refund idempotent theo `import_job`.
