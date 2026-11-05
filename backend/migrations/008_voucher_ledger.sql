-- ROFÉ: change vouchers as a customer liability (audit fixes). Non-destructive.
--
-- A change voucher is money ROFÉ already collected and owes the customer. Using it on an
-- order is a PAYMENT (settling the liability), not a discount: the order keeps its full
-- total as revenue and records how much of it was paid with vouchers. Cash/card collect
-- only `total - voucher_amount`.

alter table orders add column if not exists voucher_amount numeric(12,2) not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_voucher_amount_check') then
    alter table orders add constraint orders_voucher_amount_check check (voucher_amount >= 0 and voucher_amount <= total);
  end if;
end $$;

alter table change_vouchers add column if not exists cancelled_reason text;
alter table change_vouchers add column if not exists cancelled_by text;
alter table change_vouchers add column if not exists cancelled_at timestamptz;
create index if not exists change_vouchers_status_idx on change_vouchers(status, created_at desc);

-- An administrator voids a voucher (lost, fraud, customer refunded otherwise). The
-- remaining balance is kept for the record; it can no longer be used.
create or replace function cancel_change_voucher(p_code text, p_reason text, p_user_id text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  voucher change_vouchers%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'voucher_cancel_reason_required'; end if;
  select * into voucher from change_vouchers where code = p_code for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if voucher.status = 'CANCELLED' then return false; end if;
  if exists (
    select 1 from change_voucher_redemptions r join orders o on o.id = r.order_id
    where r.voucher_id = voucher.id and r.kind = 'ORDER' and r.status = 'APPLIED' and o.status = 'PENDING_PAYMENT'
  ) then raise exception 'voucher_reserved_by_pending_order'; end if;
  if voucher.status <> 'ACTIVE' then raise exception 'voucher_not_active'; end if;
  update change_vouchers set status = 'CANCELLED', cancelled_reason = trim(p_reason), cancelled_by = p_user_id, cancelled_at = now(), updated_at = now()
  where id = voucher.id;
  return true;
end;
$$;

-- A reservation whose order was never stored (process died between reserving and
-- inserting the order) is given back after ten minutes. Idempotent.
create or replace function release_orphan_change_voucher_redemptions(p_code text) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  redemption change_voucher_redemptions%rowtype;
  released numeric := 0;
begin
  for redemption in
    select r.* from change_voucher_redemptions r join change_vouchers v on v.id = r.voucher_id
    where v.code = p_code and r.kind = 'ORDER' and r.status = 'APPLIED'
      and r.created_at < now() - interval '10 minutes'
      and not exists (select 1 from orders o where o.id = r.order_id)
    for update of r
  loop
    update change_voucher_redemptions set status = 'RELEASED' where id = redemption.id;
    update change_vouchers set balance = balance + redemption.amount, status = case when status = 'REDEEMED' then 'ACTIVE' else status end, updated_at = now() where id = redemption.voucher_id;
    released := released + redemption.amount;
  end loop;
  return released;
end;
$$;

-- Release must never resurrect a cancelled voucher.
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
    update change_vouchers
    set balance = balance + redemption.amount,
        status = case when status = 'CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
        updated_at = now()
    where id = redemption.voucher_id;
    released := released + redemption.amount;
  end loop;
  return released;
end;
$$;

-- The cash ledger records the cash that actually leaves the drawer: the amount paid in
-- cash (total minus the voucher portion), and nothing for card/Point refunds.
create or replace function apply_order_refund(
  p_order_id text,
  p_operation_id text,
  p_reason text,
  p_user_id text,
  p_cash_denominations jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order orders%rowtype;
  movement inventory_movements%rowtype;
  denomination_entry record;
begin
  select * into current_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.status = 'REFUNDED' or current_order.payment_status = 'REFUNDED' then return false; end if;
  if current_order.payment_status <> 'APPROVED' then raise exception 'order_not_paid'; end if;
  if current_order.payment_method = 'cash' then
    perform id from cash_sessions where closed_at is null for update;
    if not found then raise exception 'cash_session_required'; end if;
  end if;

  for movement in select * from inventory_movements where order_id = p_order_id and movement_type = 'SALE' loop
    update raw_inventory set
      stock = stock + abs(movement.quantity),
      cost = cost + abs(movement.quantity) * movement.unit_cost_snapshot
    where id = movement.ingredient_id;
    if not found then raise exception 'inventory_item_not_found:%', movement.ingredient_id; end if;
    insert into inventory_movements (ingredient_id, quantity, unit, movement_type, reason, user_id, order_id, operation_id, unit_cost_snapshot)
    values (movement.ingredient_id, abs(movement.quantity), movement.unit, 'RETURN', p_reason, p_user_id, p_order_id, p_operation_id::uuid, movement.unit_cost_snapshot)
    on conflict do nothing;
  end loop;

  if current_order.payment_method = 'cash' then
    for denomination_entry in select key, value from jsonb_each_text(p_cash_denominations) loop
      update cash_register set count = count - denomination_entry.value::integer
      where denomination = denomination_entry.key and count >= denomination_entry.value::integer;
      if not found then raise exception 'insufficient_cash_denomination:%', denomination_entry.key; end if;
    end loop;
  end if;
  insert into cash_transactions (type, amount, description, denominations)
  values ('refund', case when current_order.payment_method = 'cash' then current_order.total - coalesce(current_order.voucher_amount, 0) else 0 end, 'Devolución de orden ' || coalesce(current_order.folio, current_order.id) || ': ' || p_reason, p_cash_denominations);
  update orders set status = 'REFUNDED', payment_status = 'REFUNDED', cancellation_reason = p_reason, updated_at = now() where id = p_order_id;
  return true;
end;
$$;

revoke all on function cancel_change_voucher(text, text, text) from public;
revoke all on function release_orphan_change_voucher_redemptions(text) from public;
revoke all on function release_change_voucher_for_order(text) from public;
revoke all on function apply_order_refund(text, text, text, text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function cancel_change_voucher(text, text, text) to service_role;
    grant execute on function release_orphan_change_voucher_redemptions(text) to service_role;
    grant execute on function release_change_voucher_for_order(text) to service_role;
    grant execute on function apply_order_refund(text, text, text, text, jsonb) to service_role;
  end if;
end $$;

create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path = public as $$ select 8 $$;
revoke all on function rofe_schema_version() from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then grant execute on function rofe_schema_version() to service_role; end if;
end $$;
