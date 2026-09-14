-- VN Pension Calculator v3 - Supabase schema
-- Run in Supabase SQL Editor once. Auth providers (Email, Google, Phone/SMS)
-- are configured in the Supabase Dashboard, not by this SQL file.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  direct_credits integer not null default 3 check (direct_credits >= 0),
  file_credits integer not null default 0 check (file_credits >= 0),
  history_credits integer not null default 3 check (history_credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  price_vnd integer not null check (price_vnd >= 0),
  direct_credits integer not null default 0 check (direct_credits >= 0),
  file_credits integer not null default 0 check (file_credits >= 0),
  history_credits integer not null default 0 check (history_credits >= 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),
  plan_name text not null,
  amount_vnd integer not null check (amount_vnd >= 0),
  direct_credits integer not null default 0,
  file_credits integer not null default 0,
  history_credits integer not null default 0,
  payment_method text not null default 'bank_transfer',
  payment_code text unique not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','expired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  direct_delta integer not null default 0,
  file_delta integer not null default 0,
  history_delta integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.calculation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  mode text not null check (mode in ('manual','file')),
  input_json jsonb not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text,
  model text,
  parser_mode text,
  status text not null default 'processing' check (status in ('processing','success','failed')),
  latency_ms integer,
  source_count integer not null default 1,
  period_hash text,
  used_for_calculation boolean not null default false,
  calculation_input_hash text,
  calculation_result jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Starter commercial plans. These are sample prices only; edit/deactivate them in /admin before launch.
insert into public.plans(code,name,description,price_vnd,direct_credits,file_credits,history_credits,active,sort_order) values
  ('DIRECT_10','Gói Trực tiếp 10','10 lượt tính bằng nhập trực tiếp + 10 lượt lưu lịch sử.',29000,10,0,10,true,10),
  ('FILE_5','Gói Hồ sơ 5','5 lượt nhập hồ sơ/ảnh/file + 5 lượt lưu lịch sử.',49000,0,5,5,true,20),
  ('COMBO_99','Combo 99K','20 lượt trực tiếp + 10 lượt hồ sơ + 20 lượt lưu lịch sử.',99000,20,10,20,true,30)
on conflict (code) do nothing;

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists usage_user_created_idx on public.usage_events(user_id, created_at desc);
create index if not exists history_user_created_idx on public.calculation_history(user_id, created_at desc);
create index if not exists import_user_created_idx on public.import_jobs(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (user_id) do nothing;

  insert into public.wallets(user_id, direct_credits, file_credits, history_credits)
  values (new.id, 3, 0, 3)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill existing accounts if this schema is added after users already exist.
insert into public.profiles(user_id, display_name)
select id, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name') from auth.users
on conflict (user_id) do nothing;
insert into public.wallets(user_id, direct_credits, file_credits, history_credits)
select id, 3, 0, 3 from auth.users
on conflict (user_id) do nothing;

create or replace function public.consume_credit(
  p_user_id uuid,
  p_bucket text,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
declare
  w public.wallets;
begin
  if p_bucket = 'direct' then
    update public.wallets set direct_credits = direct_credits - 1, updated_at = now()
    where user_id = p_user_id and direct_credits > 0 returning * into w;
  elsif p_bucket = 'file' then
    update public.wallets set file_credits = file_credits - 1, updated_at = now()
    where user_id = p_user_id and file_credits > 0 returning * into w;
  elsif p_bucket = 'history' then
    update public.wallets set history_credits = history_credits - 1, updated_at = now()
    where user_id = p_user_id and history_credits > 0 returning * into w;
  else
    raise exception 'INVALID_BUCKET';
  end if;

  if w.user_id is null then raise exception 'NO_CREDIT'; end if;

  insert into public.usage_events(user_id, action, direct_delta, file_delta, history_delta, metadata)
  values (
    p_user_id, p_action,
    case when p_bucket='direct' then -1 else 0 end,
    case when p_bucket='file' then -1 else 0 end,
    case when p_bucket='history' then -1 else 0 end,
    coalesce(p_metadata, '{}'::jsonb)
  );
  return w;
end;
$$;

create or replace function public.grant_credits(
  p_user_id uuid,
  p_direct integer default 0,
  p_file integer default 0,
  p_history integer default 0,
  p_action text default 'admin_adjustment',
  p_metadata jsonb default '{}'::jsonb
)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
declare
  w public.wallets;
begin
  insert into public.wallets(user_id, direct_credits, file_credits, history_credits)
  values (p_user_id, greatest(p_direct,0), greatest(p_file,0), greatest(p_history,0))
  on conflict (user_id) do update set
    direct_credits = public.wallets.direct_credits + greatest(p_direct,0),
    file_credits = public.wallets.file_credits + greatest(p_file,0),
    history_credits = public.wallets.history_credits + greatest(p_history,0),
    updated_at = now()
  returning * into w;

  insert into public.usage_events(user_id, action, direct_delta, file_delta, history_delta, metadata)
  values (p_user_id, p_action, greatest(p_direct,0), greatest(p_file,0), greatest(p_history,0), coalesce(p_metadata,'{}'::jsonb));
  return w;
end;
$$;

create or replace function public.refund_credit(
  p_user_id uuid,
  p_bucket text,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
begin
  if p_bucket='direct' then
    return public.grant_credits(p_user_id,1,0,0,p_action,p_metadata);
  elsif p_bucket='file' then
    return public.grant_credits(p_user_id,0,1,0,p_action,p_metadata);
  elsif p_bucket='history' then
    return public.grant_credits(p_user_id,0,0,1,p_action,p_metadata);
  end if;
  raise exception 'INVALID_BUCKET';
end;
$$;

create or replace function public.save_calculation_history(
  p_user_id uuid,
  p_title text,
  p_mode text,
  p_input jsonb,
  p_result jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  w public.wallets;
  new_id uuid;
begin
  select * into w from public.consume_credit(p_user_id,'history','history_save', jsonb_build_object('mode',p_mode));
  insert into public.calculation_history(user_id,title,mode,input_json,result_json)
  values (p_user_id,left(coalesce(p_title,''),120),p_mode,p_input,p_result)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.approve_order(p_order_id uuid, p_admin_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  o public.orders;
begin
  update public.orders set status='paid', approved_by=p_admin_id, approved_at=now(), updated_at=now()
  where id=p_order_id and status='pending' returning * into o;
  if o.id is null then raise exception 'ORDER_NOT_PENDING'; end if;

  perform public.grant_credits(
    o.user_id, o.direct_credits, o.file_credits, o.history_credits,
    'order_credit', jsonb_build_object('order_id',o.id,'payment_code',o.payment_code)
  );
  insert into public.admin_audit_logs(admin_user_id,action,target_user_id,metadata)
  values(p_admin_id,'approve_order',o.user_id,jsonb_build_object('order_id',o.id,'amount_vnd',o.amount_vnd));
  return o;
end;
$$;

-- Business tables are server-only. Authenticated users access them through API endpoints.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.plans enable row level security;
alter table public.orders enable row level security;
alter table public.usage_events enable row level security;
alter table public.calculation_history enable row level security;
alter table public.import_jobs enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.profiles, public.wallets, public.plans, public.orders, public.usage_events, public.calculation_history, public.import_jobs, public.admin_audit_logs from anon, authenticated;
grant all on public.profiles, public.wallets, public.plans, public.orders, public.usage_events, public.calculation_history, public.import_jobs, public.admin_audit_logs to service_role;
revoke all on function public.consume_credit(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid,integer,integer,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.save_calculation_history(uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.approve_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.consume_credit(uuid,text,text,jsonb) to service_role;
grant execute on function public.grant_credits(uuid,integer,integer,integer,text,jsonb) to service_role;
grant execute on function public.refund_credit(uuid,text,text,jsonb) to service_role;
grant execute on function public.save_calculation_history(uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.approve_order(uuid,uuid) to service_role;

-- Set the first administrator manually after that user signs up:
-- update public.profiles set role='admin' where user_id='<UUID>';
