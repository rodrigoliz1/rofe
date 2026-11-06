-- Additive only; no backfill, historical rewrites, balances or live operations.
-- Requires 009. Apply separately only after operator approval and backup.
begin;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists paid_cash_session_id uuid references cash_sessions(id);
alter table orders add column if not exists refunded_at timestamptz;
create index if not exists orders_paid_at_idx on orders(paid_at);

-- Events changed after a lock wait must not retain the transaction-start cursor.
create or replace function rofe_touch_updated_at() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at := clock_timestamp(); return new; end $$;

-- Use the same lock order everywhere: open shift -> order -> inventory -> drawer.
create or replace function confirm_order_payment(
  p_order_id text,
  p_payment_id text,
  p_consumption jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order orders%rowtype;
  ingredient jsonb;
  current_stock numeric;
  shift_id uuid;
  confirmed_at timestamptz;
begin
  select id into shift_id from cash_sessions where closed_at is null for update;
  select * into current_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.payment_status in ('APPROVED', 'REFUNDED') or current_order.status = 'CANCELLED' then return false; end if;
  confirmed_at := clock_timestamp();
  perform release_order_inventory(p_order_id);

  for ingredient in select * from jsonb_array_elements(p_consumption) order by value->>'ingredientId'
  loop
    select stock into current_stock from raw_inventory where id = ingredient->>'ingredientId' for update;
    if not found then
      raise exception 'inventory_item_not_found:%', ingredient->>'ingredientId';
    end if;
    if current_stock < (ingredient->>'quantity')::numeric then
      raise exception 'insufficient_inventory:%', ingredient->>'ingredientId';
    end if;
  end loop;

  for ingredient in select * from jsonb_array_elements(p_consumption) order by value->>'ingredientId'
  loop
    update raw_inventory
      set stock = stock - (ingredient->>'quantity')::numeric,
          cost = greatest(0, cost - (coalesce(nullif(average_unit_cost, 0), case when stock > 0 then cost / stock else 0 end) * (ingredient->>'quantity')::numeric))
      where id = ingredient->>'ingredientId';
    if found then
      insert into inventory_movements (ingredient_id, quantity, movement_type, order_id, unit_cost_snapshot)
      select id, -(ingredient->>'quantity')::numeric, 'SALE', p_order_id, average_unit_cost
      from raw_inventory where id = ingredient->>'ingredientId'
      on conflict do nothing;
    end if;
  end loop;

  update orders set status = 'PAID', payment_status = 'APPROVED', payment_id = p_payment_id,
    inventory_applied_at = confirmed_at, paid_at = confirmed_at, paid_cash_session_id = shift_id, updated_at = confirmed_at where id = p_order_id;
  if current_order.payment_method = 'card' then
    insert into cash_transactions (type, amount, description, denominations)
    values ('card_payment', current_order.total, 'Pago con tarjeta para orden ' || coalesce(current_order.folio, current_order.id), '{}'::jsonb);
  end if;
  return true;
end;
$$;

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
  shift_id uuid;
begin
  select id into shift_id from cash_sessions where closed_at is null for update;
  select * into current_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.status = 'REFUNDED' or current_order.payment_status = 'REFUNDED' then return false; end if;
  if current_order.payment_status <> 'APPROVED' then raise exception 'order_not_paid'; end if;
  if current_order.payment_method = 'cash' then
    if shift_id is null then raise exception 'cash_session_required'; end if;
  end if;

  for movement in select * from inventory_movements where order_id = p_order_id and movement_type = 'SALE' order by ingredient_id loop
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
  update orders set status = 'REFUNDED', payment_status = 'REFUNDED', cancellation_reason = p_reason, refunded_at = clock_timestamp(), updated_at = clock_timestamp() where id = p_order_id;
  return true;
end;
$$;

-- New rows only: attach legacy change/refund entries to the locked shift. The wall
-- clock is captured AFTER waiting for the shift, never at transaction start.
create or replace function stamp_cash_ledger_shift() returns trigger
language plpgsql security definer set search_path = public as $$
declare shift_id uuid;
begin
  select id into shift_id from cash_sessions where closed_at is null for update;
  new.created_at := clock_timestamp();
  new.cash_session_id := coalesce(new.cash_session_id, shift_id);
  return new;
end $$;
drop trigger if exists stamp_cash_ledger_shift on cash_transactions;
create trigger stamp_cash_ledger_shift before insert on cash_transactions for each row execute function stamp_cash_ledger_shift();

-- New inventory postings use the same wall clock as confirmation, so a transaction
-- that began before a cut cannot post COGS into the preceding shift after waiting.
create or replace function stamp_inventory_posting() returns trigger
language plpgsql security definer set search_path=public as $$
begin new.created_at := clock_timestamp(); return new; end $$;
drop trigger if exists stamp_inventory_posting on inventory_movements;
create trigger stamp_inventory_posting before insert on inventory_movements for each row execute function stamp_inventory_posting();
revoke all on function stamp_inventory_posting() from public;

-- Avoid inventory -> shift inversion for cash purchases (payment/refund lock shift first).
create or replace function record_inventory_purchase(p_purchase jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_id uuid;
  line jsonb;
  current_item raw_inventory%rowtype;
  line_quantity numeric;
  line_unit_cost numeric;
  line_subtotal numeric;
begin
  if p_purchase->>'paymentMethod' = 'cash' then
    perform id from cash_sessions where closed_at is null for update;
    if not found then raise exception 'cash_session_required'; end if;
  end if;
  insert into purchases (id, supplier_id, invoice_reference, payment_method, total, notes, purchased_at, created_by, operation_id)
  values (
    (p_purchase->>'id')::uuid,
    nullif(p_purchase->>'supplierId', '')::uuid,
    nullif(p_purchase->>'invoiceReference', ''),
    p_purchase->>'paymentMethod',
    (p_purchase->>'total')::numeric,
    nullif(p_purchase->>'notes', ''),
    (p_purchase->>'purchasedAt')::timestamptz,
    p_purchase->>'createdBy',
    (p_purchase->>'operationId')::uuid
  ) on conflict (operation_id) do nothing returning id into purchase_id;
  if purchase_id is null then return false; end if;

  for line in select * from jsonb_array_elements(p_purchase->'items') loop
    line_quantity := (line->>'quantity')::numeric;
    line_unit_cost := (line->>'unitCost')::numeric;
    line_subtotal := (line->>'subtotal')::numeric;
    select * into current_item from raw_inventory where id = line->>'ingredientId' for update;
    if not found then raise exception 'inventory_item_not_found:%', line->>'ingredientId'; end if;

    insert into purchase_items (purchase_id, ingredient_id, quantity, unit, unit_cost, subtotal)
    values (purchase_id, line->>'ingredientId', line_quantity, line->>'unit', line_unit_cost, line_subtotal);
    update raw_inventory set
      stock = stock + line_quantity,
      cost = cost + line_subtotal,
      average_unit_cost = case when stock + line_quantity > 0 then (cost + line_subtotal) / (stock + line_quantity) else 0 end
    where id = line->>'ingredientId';
    insert into inventory_movements (ingredient_id, quantity, unit, movement_type, reason, user_id, purchase_id, operation_id, unit_cost_snapshot)
    values (line->>'ingredientId', line_quantity, line->>'unit', 'PURCHASE', nullif(p_purchase->>'invoiceReference', ''), p_purchase->>'createdBy', purchase_id, (p_purchase->>'operationId')::uuid, line_unit_cost);
  end loop;
  if p_purchase->>'paymentMethod' = 'cash' then
    perform record_cash_movement(jsonb_build_object(
      'type', 'manual_expense', 'amount', p_purchase->'total', 'description', 'Compra ' || coalesce(nullif(p_purchase->>'invoiceReference', ''), p_purchase->>'id'),
      'denominations', coalesce(p_purchase->'cashDenominations', '{}'::jsonb), 'operationId', p_purchase->>'operationId', 'createdBy', p_purchase->>'createdBy'
    ));
  end if;
  return true;
end;
$$;

create or replace function close_cash_session_consistent(p_session_id text, p_denominations jsonb, p_user_id text, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target cash_sessions%rowtype;
  cut_at timestamptz;
  counted numeric := 0;
  expected numeric;
  entry record;
  denomination_value numeric;
  report jsonb;
  close_data jsonb;
  committed boolean;
begin
  select * into target from cash_sessions where id = p_session_id::uuid for update;
  if not found then raise exception 'cash_session_not_found'; end if;
  if jsonb_typeof(p_denominations) <> 'object' or p_denominations is null then raise exception 'invalid_denominations'; end if;
  for entry in select key, value from jsonb_each_text(p_denominations) loop
    denomination_value := case entry.key
      when 'bill_1000' then 1000 when 'bill_500' then 500 when 'bill_200' then 200 when 'bill_100' then 100
      when 'bill_50' then 50 when 'bill_20' then 20 when 'coin_20' then 20 when 'coin_10' then 10 when 'coin_5' then 5
      when 'coin_2' then 2 when 'coin_1' then 1 when 'coin_0_50' then 0.5 when 'coin_0_20' then 0.2 else null end;
    if denomination_value is null or entry.value is null or entry.value !~ '^[0-9]+$' then raise exception 'invalid_denominations'; end if;
    counted := counted + denomination_value * entry.value::integer;
  end loop;
  if target.closed_at is not null then
    if target.closed_by is distinct from p_user_id or target.closing_denominations is distinct from p_denominations then raise exception 'cash_close_conflict'; end if;
    return to_jsonb(target);
  end if;
  cut_at := clock_timestamp();
  select target.opening_amount + coalesce(sum(case
    when type in ('payment','manual_income') then amount
    when type in ('change','manual_expense','manual_investment','refund','voucher_payout') then -amount else 0 end),0)
  into expected from cash_transactions where status <> 'deleted' and
    (cash_session_id = target.id or (cash_session_id is null and created_at >= target.opened_at and created_at <= cut_at));

  -- A single MVCC snapshot for the consolidated report; new receipts and refunds
  -- cannot cross this snapshot because they take this same shift row lock.
  with sales as (
    select * from orders where (payment_status in ('APPROVED','REFUNDED') or status in ('PAID','IN_PREPARATION','READY','COMPLETED','REFUNDED','paid','preparing','ready','completed'))
      and (paid_cash_session_id = target.id or (paid_cash_session_id is null and coalesce(paid_at,inventory_applied_at) >= target.opened_at and coalesce(paid_at,inventory_applied_at) <= cut_at))
  ), refunds as (
    select * from orders where (status = 'REFUNDED' or payment_status = 'REFUNDED')
      and refunded_at >= target.opened_at and refunded_at <= cut_at
  ), ledger as (
    select * from cash_transactions where status <> 'deleted' and
      (cash_session_id = target.id or (cash_session_id is null and created_at >= target.opened_at and created_at <= cut_at))
  ), product_rows as (
    select coalesce(item->>'productName', item->'product'->>'name', item->>'productId','Producto') as product,
      sum(coalesce((item->>'quantity')::numeric,0)) as quantity
    from sales cross join lateral jsonb_array_elements(items) item group by 1
  ), figures as (
    select
      coalesce((select sum(total) from sales),0) - coalesce((select sum(total) from refunds),0) as revenue,
      coalesce((select sum(total - voucher_amount) from sales where payment_method='cash'),0) - coalesce((select sum(total - voucher_amount) from refunds where payment_method='cash'),0) as cash_sales,
      coalesce((select sum(total - voucher_amount) from sales where payment_method='card'),0) - coalesce((select sum(total - voucher_amount) from refunds where payment_method='card'),0) as card_sales,
      coalesce((select sum(total) from refunds),0) as refunds,
      coalesce((select sum(discount) from sales),0) as discounts,
      (select count(*) from sales) as tickets,
      coalesce((select sum(case when movement_type='SALE' then abs(quantity)*unit_cost_snapshot when movement_type='RETURN' then -abs(quantity)*unit_cost_snapshot else 0 end) from inventory_movements where created_at >= target.opened_at and created_at <= cut_at),0) as cost_of_goods,
      coalesce((select sum(amount) from ledger where type='manual_expense' and description not like 'Compra %'),0) as expenses,
      coalesce((select sum(amount) from ledger where type='manual_income'),0) as income,
      coalesce((select sum(cost_snapshot) from waste_records where created_at >= target.opened_at and created_at <= cut_at),0) as waste
  ) select jsonb_build_object(
    'id',target.id,'closed_at',cut_at,'period_start',target.opened_at,'period_end',cut_at,
    'total_sales',revenue,'cash_sales',cash_sales,'card_sales',card_sales,'refunds',refunds,'discounts',discounts,'tickets',tickets,
    'cost_of_goods',cost_of_goods,'expenses',expenses,'total_income',income,'total_costs',cost_of_goods+expenses+waste,
    'gross_margin',revenue-cost_of_goods,'operating_result',revenue-cost_of_goods+income-expenses-waste,
    'net_profit',revenue-cost_of_goods+income-expenses-waste,'cash_start',target.opening_amount,'cash_end',counted,
    'expected_cash',expected,'counted_cash',counted,'difference',counted-expected,'closed_by',p_user_id,'notes',p_notes,
    'products_sold',coalesce((select jsonb_object_agg(product,quantity) from product_rows),'{}'::jsonb)
  ) into report from figures;
  close_data := jsonb_build_object('expectedCash',expected,'countedCash',counted,'difference',counted-expected,
    'closingDenominations',p_denominations,'closedBy',p_user_id,'closedAt',cut_at);
  select close_cash_session_with_closing(p_session_id,close_data,report) into committed;
  if not committed then raise exception 'cash_close_conflict'; end if;
  select * into target from cash_sessions where id=p_session_id::uuid;
  return to_jsonb(target);
end $$;

revoke all on function close_cash_session_consistent(text,jsonb,text,text) from public;
revoke all on function stamp_cash_ledger_shift() from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function close_cash_session_consistent(text,jsonb,text,text) to service_role;
  end if;
end $$;
create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path=public as $$ select 10 $$;
commit;
