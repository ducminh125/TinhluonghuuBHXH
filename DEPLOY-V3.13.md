# DEPLOY v3.13

## Nâng cấp source

1. Thay source hiện tại bằng v3.13.
2. Giữ nguyên các biến Supabase/payOS đang hoạt động.
3. Với ShopAIKey, nên bổ sung:

```env
SHOPAIKEY_FAST_MODEL=gemini-2.5-flash
SHOPAIKEY_VISION_FALLBACK_MODEL=gemini-2.5-pro
SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna
AI_FAST_TIMEOUT_MS=45000
AI_VISION_FALLBACK_TIMEOUT_MS=35000
AI_FALLBACK_TIMEOUT_MS=45000
AI_IMAGE_BATCH_SIZE=2
AI_BATCH_CONCURRENCY=2
```

`SHOPAIKEY_VISION_FALLBACK_MODEL` là tùy chọn; nếu chưa khai báo source mặc định dùng `gemini-2.5-pro`.

4. Redeploy Production trên Vercel.
5. Mở `/api/health`, xác nhận `version` là `3.13.0` và `aiConfigured` là `true`.

## Test đọc ảnh

- Đăng nhập tài khoản có ít nhất 1 lượt file/ảnh.
- Chọn 1 ảnh JPG/PNG rõ, dung lượng dưới giới hạn hiển thị của `/api/config`.
- Bấm `Đọc dữ liệu từ file`.
- Nếu AI/provider lỗi, response phải là lỗi có mã 8 ký tự và thông báo AI cụ thể; không được rơi về `Máy chủ gặp lỗi khi xử lý yêu cầu` do nhánh cleanup.
- Kiểm tra số lượt không giảm khi trích xuất không thành công.

## Google/Facebook OAuth

Xem `SOCIAL-LOGIN-SETUP.md` để cấu hình đầy đủ Supabase + Google Cloud + Meta for Developers.

## Database

Không cần chạy migration mới nếu v3.12 đang hoạt động.
