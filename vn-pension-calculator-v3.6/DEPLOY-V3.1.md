# Checklist cập nhật website lên v3.1

## 1. Cập nhật Supabase database
- Mở Supabase Dashboard → SQL Editor → New query.
- Mở file `supabase/migration-v3.1.sql`, sao chép toàn bộ, dán vào SQL Editor và bấm Run.
- Chờ báo Success. Migration không xóa lịch sử cũ; các lệnh chính dùng `if not exists`/`on conflict`.

## 2. Cấu hình xác nhận email
Supabase → Authentication → URL Configuration:
- Site URL: `https://tinhluonghuu-bhxh.vercel.app`
- Redirect URLs thêm: `https://tinhluonghuu-bhxh.vercel.app/auth/confirmed`

Sau khi người dùng bấm link xác nhận trong email, website hiển thị trang “Đăng ký thành công”.

## 3. Cấu hình admin
Vercel → Project → Settings → Environment Variables, thêm:
`ADMIN_EMAILS=email-cua-ban@gmail.com`

Nếu có nhiều admin:
`ADMIN_EMAILS=admin1@gmail.com,admin2@gmail.com`

Redeploy. Sau đó dùng đúng email đó để đăng nhập tại `/admin`; không cần form đăng ký admin riêng.

## 4. Bỏ đăng nhập điện thoại
Code v3.1 đã bỏ giao diện và JS điện thoại. Trong Supabase → Authentication → Providers → Phone, tắt Phone provider để đồng bộ cấu hình.

## 5. Kiểm tra
- Mở `/api/system/status`: cần thấy `ready: true`.
- Đăng ký một email mới → xác nhận email → phải tới `/auth/confirmed`.
- Vào trang chủ → phần tài khoản phải thấy 3 lượt trực tiếp, 0 lượt hồ sơ, 3 lượt lưu.
- Bấm Mua thêm lượt → phải thấy 3 gói mẫu thay vì lỗi `public.plans`.
- Đăng nhập email trong `ADMIN_EMAILS` → `/admin` phải mở được.
