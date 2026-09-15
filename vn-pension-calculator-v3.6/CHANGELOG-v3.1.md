# v3.1 fixes

- Email signup now uses `/auth/confirmed`; confirmation page shows successful registration and preserves the Supabase browser session when available.
- Removed phone/SMS login UI and JavaScript.
- Added `ADMIN_EMAILS` server allow-list. A normal Email/Google account is automatically promoted to `admin` on its next authenticated request.
- Existing users missing `profiles`/`wallets` are automatically backfilled on login with 3 direct, 0 file, 3 history credits.
- Account modal now displays all three credit balances prominently, plus history and orders.
- Added `supabase/migration-v3.1.sql` to create the commercial tables/RPCs and reload PostgREST schema cache, fixing missing `public.plans` after the migration is run.
- Added `/api/system/status` and admin diagnostics for incomplete Supabase schema.
- Raw Supabase missing-table errors are converted to user-friendly messages.
- Added `DEPLOY-V3.1.md` with the exact Vercel/Supabase production steps.
- Pension engine regression suite remains 26/26 passing.
