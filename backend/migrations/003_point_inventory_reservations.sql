-- Keep inventory available for a card charge until Point confirms or cancels it.
begin;
alter table raw_inventory add column if not exists reserved_stock numeric(14,3) not null default 0;
alter table raw_inventory drop constraint if exists raw_inventory_reservations_check;
alter table raw_inventory add constraint raw_inventory_reservations_check check (reserved_stock >= 0 and stock >= reserved_stock);
create table if not exists inventory_reservations (
  order_id text not null references orders(id),
  ingredient_id text not null references raw_inventory(id),
  quantity numeric(14,3) not null check (quantity > 0),
  primary key (order_id, ingredient_id)
);
alter table inventory_reservations enable row level security;

create or replace function release_order_inventory(p_order_id text) returns void
language plpgsql security definer set search_path = public as $$
declare reservation record;
begin
  for reservation in select * from inventory_reservations where order_id = p_order_id order by ingredient_id for update loop
    update raw_inventory set reserved_stock = reserved_stock - reservation.quantity where id = reservation.ingredient_id;
  end loop;
  delete from inventory_reservations where order_id = p_order_id;
end $$;

create or replace function reserve_order_inventory(p_order_id text, p_consumption jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare current_order orders%rowtype; ingredient jsonb; available numeric;
begin
  select * into current_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.status <> 'PENDING_PAYMENT' or current_order.payment_status <> 'PENDING' then return; end if;
  if exists(select 1 from inventory_reservations where order_id = p_order_id) then return; end if;
  for ingredient in select * from jsonb_array_elements(p_consumption) order by value->>'ingredientId' loop
    select stock - reserved_stock into available from raw_inventory where id = ingredient->>'ingredientId' for update;
    if not found or available < (ingredient->>'quantity')::numeric then raise exception 'insufficient_available_inventory'; end if;
    insert into inventory_reservations values (p_order_id, ingredient->>'ingredientId', (ingredient->>'quantity')::numeric);
    update raw_inventory set reserved_stock = reserved_stock + (ingredient->>'quantity')::numeric where id = ingredient->>'ingredientId';
  end loop;
end $$;

create or replace function release_final_order_inventory() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'CANCELLED' or new.payment_status = 'REJECTED' then perform release_order_inventory(new.id); end if;
  return new;
end $$;
drop trigger if exists release_final_order_inventory on orders;
create trigger release_final_order_inventory after update on orders for each row execute function release_final_order_inventory();

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
begin
  select * into current_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.payment_status in ('APPROVED', 'REFUNDED') or current_order.status = 'CANCELLED' then return false; end if;
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
    inventory_applied_at = now(), updated_at = now() where id = p_order_id;
  if current_order.payment_method = 'card' then
    insert into cash_transactions (type, amount, description, denominations)
    values ('card_payment', current_order.total, 'Pago con tarjeta para orden ' || coalesce(current_order.folio, current_order.id), '{}'::jsonb);
  end if;
  return true;
end;
$$;



revoke all on function reserve_order_inventory(text, jsonb) from public;
revoke all on function release_order_inventory(text) from public;
revoke all on function release_final_order_inventory() from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'anon') then revoke all on inventory_reservations from anon; end if;
  if exists(select 1 from pg_roles where rolname = 'authenticated') then revoke all on inventory_reservations from authenticated; end if;
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on inventory_reservations to service_role;
    grant execute on function reserve_order_inventory(text, jsonb) to service_role;
    grant execute on function release_order_inventory(text) to service_role;
  end if;
end $$;
create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path = public as $$ select 3 $$;
commit;
