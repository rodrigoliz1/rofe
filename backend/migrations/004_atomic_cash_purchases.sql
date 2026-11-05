-- Cash purchases and their drawer movement either both commit or both roll back.
begin;
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


create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path = public as $$ select 4 $$;
commit;
