-- Preserve final payment states when a webhook or poll is replayed.
begin;
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

  for ingredient in select * from jsonb_array_elements(p_consumption)
  loop
    select stock into current_stock from raw_inventory where id = ingredient->>'ingredientId' for update;
    if not found then
      raise exception 'inventory_item_not_found:%', ingredient->>'ingredientId';
    end if;
    if current_stock < (ingredient->>'quantity')::numeric then
      raise exception 'insufficient_inventory:%', ingredient->>'ingredientId';
    end if;
  end loop;

  for ingredient in select * from jsonb_array_elements(p_consumption)
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


create or replace function rofe_schema_version() returns integer
language sql stable security invoker set search_path = public as $$ select 2 $$;
revoke all on function rofe_schema_version() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rofe_schema_version() to service_role;
  end if;
end $$;
commit;
