-- VN Pension Calculator v3.3 - atomic payOS payment confirmation
-- Run once in Supabase Dashboard -> SQL Editor as postgres.
-- If your SQL Editor was left in an impersonated role, RESET ROLE returns to the session role.
RESET ROLE;

create or replace function public.confirm_paid_order(
  p_order_id uuid,
  p_reference text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  meta jsonb;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Webhook retries and status reconciliation are idempotent.
  if o.status = 'paid' then
    return o;
  end if;
  if o.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING:%', o.status;
  end if;

  update public.orders
  set status = 'paid', approved_at = now(), updated_at = now()
  where id = p_order_id
  returning * into o;

  meta := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'order_id', o.id,
    'payment_code', o.payment_code,
    'provider', 'payos',
    'reference', coalesce(p_reference,'')
  );

  perform public.grant_credits(
    o.user_id,
    o.direct_credits,
    o.file_credits,
    o.history_credits,
    'payos_payment',
    meta
  );

  return o;
end;
$$;

revoke all on function public.confirm_paid_order(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_paid_order(uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
