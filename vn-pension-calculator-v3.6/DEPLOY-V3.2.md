# Deploy v3.2 — hướng dẫn ngắn

## Cách nhanh nhất

1. Thay source trên GitHub bằng source v3.2.
2. Vercel tự deploy hoặc vào **Deployments → Redeploy**.
3. Không cần chạy SQL mới nếu `/api/system/status` đang báo `ready: true` và database v3.1.2 đã dùng được.
4. Kiểm tra Vercel Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SHOPAIKEY_API_KEY`
   - `SHOPAIKEY_FAST_MODEL=gemini-2.5-flash`
   - `SHOPAIKEY_FALLBACK_MODEL=gpt-5.6-luna`
   - `ADMIN_EMAILS=...`
5. Mở `/api/health` và `/api/system/status`.
6. Đăng nhập một tài khoản có lượt hồ sơ và thử một file nhỏ dưới 4 MB.

## Kiểm tra cơ chế không mất lượt

- Ghi lại số **Hồ sơ** trước khi thử.
- Gửi file sai/không đọc được: số lượt phải giữ nguyên.
- Nếu server đã trừ rồi gặp lỗi kỹ thuật ở bước cuối, thông báo sẽ ghi **Lượt đọc hồ sơ đã được tự động hoàn lại tài khoản** và số dư được refresh.

## Migration v3.2 tùy chọn

Chỉ khi muốn charge/refund idempotent ở mức database, chạy `supabase/migration-v3.2.sql` bằng role `postgres/default`. Nếu đang gặp vấn đề quyền SQL, có thể bỏ qua bước này; code vẫn tương thích schema v3.1.2.

## Giới hạn Vercel

Vercel Functions giới hạn request/response body 4,5 MB. Bản v3.2 sẽ cảnh báo trước khoảng 4 MB khi chạy trên Vercel để tránh request bị platform chặn trước khi vào backend. Với nhu cầu file lớn hơn, bước nâng cấp tiếp theo là direct upload vào Vercel Blob/S3 rồi backend đọc từ URL.
