# Cấu hình đăng nhập Google và Facebook cho tinhluonghuu-bhxh.vercel.app

## Các URL của website

- Site URL: `https://tinhluonghuu-bhxh.vercel.app`
- Người dùng social login trở về: `https://tinhluonghuu-bhxh.vercel.app/`
- Quản trị social login trở về: `https://tinhluonghuu-bhxh.vercel.app/admin`
- Xác nhận đăng ký email: `https://tinhluonghuu-bhxh.vercel.app/auth/confirmed`
- OAuth callback của provider KHÔNG phải URL Vercel. Hãy copy callback trong Supabase Dashboard; dạng thường là `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.

## A. Supabase URL Configuration

Vào Supabase Dashboard → Authentication → URL Configuration.

- Site URL: `https://tinhluonghuu-bhxh.vercel.app`
- Redirect URLs thêm chính xác:
  - `https://tinhluonghuu-bhxh.vercel.app/`
  - `https://tinhluonghuu-bhxh.vercel.app/admin`
  - `https://tinhluonghuu-bhxh.vercel.app/auth/confirmed`

## B. Google

1. Trong Google Cloud/Google Auth Platform, tạo hoặc chọn project.
2. Cấu hình Branding/Audience. Với website cho người dùng bên ngoài tổ chức, chọn audience phù hợp và thêm test users nếu app còn ở chế độ Testing.
3. Tạo OAuth Client loại `Web application`.
4. Authorized JavaScript origins: `https://tinhluonghuu-bhxh.vercel.app`
5. Authorized redirect URI: copy đúng `Callback URL` từ Supabase → Authentication → Sign In / Providers → Google.
6. Copy Google Client ID và Client Secret.
7. Trở lại Supabase → Authentication → Sign In / Providers → Google → Enable → nhập Client ID + Secret → Save.
8. Mở `https://tinhluonghuu-bhxh.vercel.app/api/health`. `googleAuthEnabled` phải là `true`.

## C. Facebook

1. Vào Meta for Developers, tạo app phù hợp cho consumer authentication.
2. Thêm/use case Facebook Login / Authentication and account creation.
3. Trong Facebook Login settings, `Valid OAuth Redirect URIs` phải là đúng callback Supabase: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
4. Cấu hình domain/website là `tinhluonghuu-bhxh.vercel.app`; khai báo Privacy Policy và Terms URL nếu Meta yêu cầu:
   - `https://tinhluonghuu-bhxh.vercel.app/privacy`
   - `https://tinhluonghuu-bhxh.vercel.app/terms`
5. Copy App ID và App Secret.
6. Supabase → Authentication → Sign In / Providers → Facebook → Enable → nhập App ID + App Secret → Save.
7. Khi app Facebook còn Development mode, chỉ admin/developer/tester được đăng nhập. Muốn người dùng công khai đăng nhập cần đưa app sang Live/hoàn tất các yêu cầu của Meta. Quyền `email` cần sẵn sàng nếu website cần email người dùng.
8. Mở `/api/health`. `facebookAuthEnabled` phải là `true`.

## D. Vercel

Google/Facebook Client Secret được lưu trong Supabase, không cần đặt vào Vercel. Vercel vẫn chỉ cần các biến Supabase của ứng dụng:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_EMAILS=admin@example.com
```

Sau khi đổi biến Vercel mới cần Redeploy; bật/tắt provider trong Supabase thường không cần sửa source.

## E. Kiểm tra

1. Mở cửa sổ ẩn danh.
2. Bấm Đăng nhập → Google hoặc Facebook.
3. Sau khi đồng ý ở provider, phải quay về website và thấy tài khoản đã đăng nhập.
4. Với admin: email social account phải trùng một email trong `ADMIN_EMAILS`. Facebook cần trả được email; nếu không, nên dùng Google/email cho tài khoản admin.
5. Nếu nhận `Unsupported provider`, vào Supabase provider tương ứng và xác nhận Enable + Client ID/Secret đã lưu.
6. Nếu nhận `redirect_uri_mismatch`, đối chiếu callback URL ở Google/Meta với callback URL hiển thị trong Supabase từng ký tự.
