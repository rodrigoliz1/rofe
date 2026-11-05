-- ROFÉ: change vouchers ("cupones de cambio").
-- When the drawer cannot give the full change of a cash payment, the customer may take a
-- voucher for the missing amount. It can later be paid out in cash by a barista or used as
-- a discount on a future order. Non-destructive: new tables and functions only.
--
-- Cash accounting: the bills received stay in the drawer, so the voucher liability is in
-- the drawer until it is paid out. A payout is a 'voucher_payout' cash transaction (and a
-- REFUND cash movement), which the expected-cash calculation subtracts.

create table if not exists change_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id text references orders(id),
  amount numeric(12,2) not null check (amount > 0),
  balance numeric(12,2) not null check (balance >= 0 and balance <= amount),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REDEEMED', 'CANCELLED')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists change_vouchers_order_idx on change_vouchers(order_id);

create table if not exists change_voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references change_vouchers(id),
  kind text not null check (kind in ('CASH', 'ORDER')),
  amount numeric(12,2) not null check (amount > 0),
  order_id text,
  operation_id uuid not null unique,
  status text not null default 'APPLIED' check (status in ('APPLIED', 'RELEASED')),
  denominations jsonb not null default '{}'::jsonb,
  user_id text,
  created_at timestamptz not null default now()
);
create index if not exists change_voucher_redemptions_order_idx on change_voucher_redemptions(order_id) where kind = 'ORDER';

-- Cash payment + voucher for the change that could not be given, in one transaction.
create or replace function confirm_cash_payment_with_voucher(
  p_order_id text,
  p_payment_id text,
  p_consumption jsonb,
  p_received_amount numeric,
  p_change_amount numeric,
  p_received_denominations jsonb,
  p_change_denominations jsonb,
  p_voucher_code text,
  p_voucher_amount numeric,
  p_user_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  committed boolean;
begin
  if p_voucher_amount is null or p_voucher_amount <= 0 then raise exception 'voucher_amount_required'; end if;
  select confirm_cash_payment(p_order_id, p_payment_id, p_consumption, p_received_amount, p_change_amount, p_received_denominations, p_change_denominations) into committed;
  if not committed then return false; end if;
  insert into change_vouchers (code, order_id, amount, balance, created_by)
  values (p_voucher_code, p_order_id, p_voucher_amount, p_voucher_amount, p_user_id);
  return true;
end;
$$;

-- Pays the whole remaining balance in cash. Returns the amount paid, or 0 for a replay.
create or replace function redeem_change_voucher_cash(
  p_code text,
  p_operation_id uuid,
  p_amount numeric,
  p_denominations jsonb,
  p_user_id text
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  voucher change_vouchers%rowtype;
  current_session_id uuid;
  entry record;
begin
  if exists (select 1 from change_voucher_redemptions where operation_id = p_operation_id) then return 0; end if;
  select id into current_session_id from cash_sessions where closed_at is null for update;
  if current_session_id is null then raise exception 'cash_session_required'; end if;
  select * into voucher from change_vouchers where code = p_code for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if voucher.status <> 'ACTIVE' or voucher.balance <= 0 then raise exception 'voucher_not_active'; end if;
  if p_amount <> voucher.balance then raise exception 'voucher_amount_mismatch'; end if;
  for entry in select key, value from jsonb_each_text(p_denominations) loop
    update cash_register set count = count - entry.value::integer
    where denomination = entry.key and count >= entry.value::integer;
    if not found then raise exception 'insufficient_cash_denomination:%', entry.key; end if;
  end loop;
  insert into cash_transactions (type, amount, description, denominations, operation_id, created_by, cash_session_id)
  values ('voucher_payout', p_amount, 'Pago en efectivo del cupón de cambio ' || p_code, p_denominations, p_operation_id, p_user_id, current_session_id);
  insert into cash_movements (cash_session_id, movement_type, amount, description, order_id, operation_id, user_id, denominations)
  values (current_session_id, 'REFUND', p_amount, 'Pago en efectivo del cupón de cambio ' || p_code, voucher.order_id, p_operation_id, p_user_id, p_denominations);
  insert into change_voucher_redemptions (voucher_id, kind, amount, operation_id, denominations, user_id)
  values (voucher.id, 'CASH', p_amount, p_operation_id, p_denominations, p_user_id);
  update change_vouchers set balance = 0, status = 'REDEEMED', updated_at = now() where id = voucher.id;
  return p_amount;
end;
$$;

-- Uses (part of) the balance as a discount on a new order. False for a replay.
create or replace function apply_change_voucher_to_order(
  p_code text,
  p_order_id text,
  p_operation_id uuid,
  p_amount numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  voucher change_vouchers%rowtype;
begin
  if exists (select 1 from change_voucher_redemptions where operation_id = p_operation_id) then return false; end if;
  select * into voucher from change_vouchers where code = p_code for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if voucher.status <> 'ACTIVE' or voucher.balance < p_amount or p_amount <= 0 then raise exception 'voucher_not_active'; end if;
  insert into change_voucher_redemptions (voucher_id, kind, amount, order_id, operation_id)
  values (voucher.id, 'ORDER', p_amount, p_order_id, p_operation_id);
  update change_vouchers
  set balance = balance - p_amount,
      status = case when balance - p_amount <= 0 then 'REDEEMED' else 'ACTIVE' end,
      updated_at = now()
  where id = voucher.id;
  return true;
end;
$$;

-- Gives the balance back when an order that used a voucher is cancelled. Idempotent.
create or replace function release_change_voucher_for_order(p_order_id text) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  redemption change_voucher_redemptions%rowtype;
  released numeric := 0;
begin
  for redemption in select * from change_voucher_redemptions where order_id = p_order_id and kind = 'ORDER' and status = 'APPLIED' for update loop
    update change_voucher_redemptions set status = 'RELEASED' where id = redemption.id;
    update change_vouchers set balance = balance + redemption.amount, status = 'ACTIVE', updated_at = now() where id = redemption.voucher_id;
    released := released + redemption.amount;
  end loop;
  return released;
end;
$$;

revoke all on function confirm_cash_payment_with_voucher(text, text, jsonb, numeric, numeric, jsonb, jsonb, text, numeric, text) from public;
revoke all on function redeem_change_voucher_cash(text, uuid, numeric, jsonb, text) from public;
revoke all on function apply_change_voucher_to_order(text, text, uuid, numeric) from public;
revoke all on function release_change_voucher_for_order(text) from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['change_vouchers', 'change_voucher_redemptions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on table public.%I from anon', table_name); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on table public.%I from authenticated', table_name); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant select, insert, update, delete on table public.%I to service_role', table_name); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function confirm_cash_payment_with_voucher(text, text, jsonb, numeric, numeric, jsonb, jsonb, text, numeric, text) to service_role;
    grant execute on function redeem_change_voucher_cash(text, uuid, numeric, jsonb, text) to service_role;
    grant execute on function apply_change_voucher_to_order(text, text, uuid, numeric) to service_role;
    grant execute on function release_change_voucher_for_order(text) to service_role;
  end if;
end $$;

create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path = public as $$ select 7 $$;
revoke all on function rofe_schema_version() from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then grant execute on function rofe_schema_version() to service_role; end if;
end $$;
