# CHANGELOG v3.13

## 1. Sửa lỗi đọc ảnh bị che thành HTTP 500

- Sửa nhánh lỗi `/api/import`: không còn gọi `.catch()` trực tiếp trên Supabase query builder khi đánh dấu `import_jobs` thất bại.
- Nếu bước ghi log thất bại, lỗi đó chỉ được ghi vào server log và không che mất lỗi AI gốc.
- Mã lỗi import rút gọn 8 ký tự để dễ tra trong Vercel Logs.
- Phân loại rõ lỗi upstream AI/network thành `AI_EXTRACTION_FAILED` thay vì rơi vào `INTERNAL_ERROR` chung.
- Không trừ lượt nếu ảnh không trích xuất được dữ liệu hợp lệ; nếu lỗi xảy ra sau charge hiếm gặp, cơ chế refund vẫn giữ nguyên.

## 2. Tăng độ bền cho ảnh/PDF scan

- Tuyến chính: `gemini-2.5-flash` native Gemini.
- Nếu có ảnh và tuyến chính lỗi/malformed JSON: thử `SHOPAIKEY_VISION_FALLBACK_MODEL`, mặc định `gemini-2.5-pro` bằng native Gemini vision.
- Sau đó mới dùng fallback tổng quát `SHOPAIKEY_FALLBACK_MODEL`.
- Giảm batch ảnh mặc định từ 4 xuống 2 và chặn tối đa 3 ảnh/batch để giảm payload/timeout.
- Lỗi xác thực 401/403 dừng ngay, tránh gọi thêm model với cùng API key sai.

## 3. BHXH một lần

- Chuyển lý do `Có thời gian đóng trước 01/07/2025, sau 12 tháng không tiếp tục đóng và chưa đủ 20 năm` lên đầu và đặt làm lựa chọn mặc định.
- Không thay đổi engine điều kiện đã bổ sung ở v3.11.

## 4. Đăng nhập mạng xã hội

- Giữ Google OAuth.
- Bổ sung Facebook OAuth cho trang người dùng và trang quản trị.
- Backend đọc trạng thái Google/Facebook từ Supabase `/auth/v1/settings`; provider chưa bật sẽ bị khóa tại giao diện thay vì dẫn tới lỗi `Unsupported provider`.
- `/api/config` và `/api/health` trả thêm `facebookAuthEnabled` và `socialAuthProviders`.
- Social login người dùng trở về chính xác `/`; admin trở về `/admin`, giúp cấu hình Redirect URLs ở Supabase đơn giản và chặt chẽ hơn.

## 5. Database

Không có migration mới. Không thay schema Supabase, payOS, quota hoặc công thức tính.
