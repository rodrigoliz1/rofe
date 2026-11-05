-- ROFÉ 1.0 — non-destructive production schema upgrade for Supabase/PostgreSQL.
-- Apply with a privileged migration role. Existing orders and catalog data are preserved.

create extension if not exists pgcrypto;

-- Baseline tables. These statements are safe on existing installations and make
-- the migration usable for a brand-new project as well as an upgrade.
create table if not exists products (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  category text not null,
  icon text not null default '',
  customizable boolean not null default false,
  image text not null default '',
  recipe jsonb not null default '{}'::jsonb,
  custom_variants jsonb not null default '[]'::jsonb
);

create table if not exists inventory (
  product_id text primary key references products(id),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  cost numeric(14,2) not null default 0 check (cost >= 0)
);

create table if not exists raw_inventory (
  id text primary key,
  name text not null,
  unit text not null check (unit in ('kg','g','L','ml','piece','pieza','un')),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  cost numeric(14,2) not null default 0 check (cost >= 0)
);

create table if not exists orders (
  id text primary key,
  customer_name text not null default 'Cliente',
  items jsonb not null,
  total numeric(12,2) not null check (total >= 0),
  status text not null,
  payment_method text not null check (payment_method in ('cash','card')),
  payment_id text,
  payment_intent_id text,
  created_at timestamptz not null default now()
);

create table if not exists cash_register (
  denomination text primary key,
  count integer not null default 0 check (count >= 0)
);

create table if not exists cash_transactions (
  id bigserial primary key,
  type text not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text not null,
  denominations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  status text not null default 'active',
  audit_reason text,
  original_amount numeric(12,2)
);

create table if not exists bakery_batches (
  id bigserial primary key,
  product_id text not null references products(id),
  quantity integer not null check (quantity > 0),
  added_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists daily_closures (
  id uuid primary key default gen_random_uuid(),
  closed_at timestamptz not null,
  total_sales numeric(12,2) not null,
  total_income numeric(12,2) not null,
  total_costs numeric(12,2) not null,
  net_profit numeric(12,2) not null,
  cash_start numeric(12,2) not null,
  cash_end numeric(12,2) not null,
  products_sold jsonb not null default '{}'::jsonb,
  notes text
);

insert into products (id, name, description, price, category, icon, customizable, image, recipe) values
  ('espresso', 'Espresso', 'Extracción doble, intensa y dulce.', 38, 'coffee', 'espresso', true, '/espresso.webp', '{"coffee_beans":18}'),
  ('americano', 'Americano', 'Espresso doble alargado con agua caliente.', 45, 'coffee', 'americano', true, '/americano.webp', '{"coffee_beans":18}'),
  ('latte', 'Latte', 'Espresso con leche texturizada y espuma fina.', 55, 'coffee', 'latte', true, '/iced-latte.webp', '{"coffee_beans":18,"milk_whole":250}'),
  ('matcha-latte', 'Matcha latte', 'Matcha ceremonial con leche texturizada.', 65, 'coffee', 'latte', true, '/matcha-latte.jpg', '{"matcha_powder":4,"milk_whole":250}'),
  ('cold-brew', 'Cold brew', 'Café extraído en frío, limpio y refrescante.', 58, 'cold', 'cold_brew', true, '/cold-brew.webp', '{"cold_brew_concentrate":180}'),
  ('iced-latte', 'Iced latte', 'Espresso, leche y hielo.', 60, 'cold', 'latte', true, '/iced-latte.webp', '{"coffee_beans":18,"milk_whole":220,"ice":120}'),
  ('croissant-mantequilla', 'Croissant de mantequilla', 'Hojaldre laminado, crujiente y ligero.', 45, 'bakery', 'croissant', false, '/pan-chocolate.jpg', '{"croissant_finished":1}'),
  ('galleta-chocolate', 'Galleta de chocolate', 'Galleta suave con chispas de chocolate.', 35, 'bakery', 'pain_choc', false, '/galleta-chispas.jpeg', '{"cookie_finished":1}')
on conflict (id) do nothing;

insert into raw_inventory (id, name, unit, stock, cost) values
  ('coffee_beans', 'Café en grano', 'g', 5000, 2500),
  ('milk_whole', 'Leche entera', 'ml', 12000, 384),
  ('milk_light', 'Leche deslactosada', 'ml', 6000, 216),
  ('milk_avena', 'Leche de avena', 'ml', 4000, 320),
  ('milk_almendra', 'Leche de almendra', 'ml', 4000, 360),
  ('matcha_powder', 'Matcha', 'g', 500, 1200),
  ('cold_brew_concentrate', 'Concentrado cold brew', 'ml', 5000, 700),
  ('ice', 'Hielo', 'g', 20000, 200),
  ('croissant_finished', 'Croissant terminado', 'piece', 30, 540),
  ('cookie_finished', 'Galleta terminada', 'piece', 40, 320)
on conflict (id) do nothing;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('ADMIN', 'MANAGER', 'BARISTA')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key,
  name text not null,
  token_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table if not exists auth_sessions (
  id uuid primary key,
  subject_id text not null,
  role text not null check (role in ('ADMIN', 'MANAGER', 'BARISTA', 'POS_DEVICE')),
  refresh_token_hash text not null,
  device_id uuid references devices(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null
);
create index if not exists auth_sessions_subject_idx on auth_sessions(subject_id, revoked_at);
create index if not exists auth_sessions_expiry_idx on auth_sessions(expires_at);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  device_id uuid references devices(id),
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on audit_logs(entity, entity_id, created_at desc);
create index if not exists audit_logs_action_idx on audit_logs(action, created_at desc);

alter table orders add column if not exists folio text;
alter table orders add column if not exists operation_id uuid;
alter table orders add column if not exists device_id uuid references devices(id);
alter table orders add column if not exists barista_id text;
alter table orders add column if not exists subtotal numeric(12,2);
alter table orders add column if not exists discount numeric(12,2) not null default 0;
alter table orders add column if not exists discount_type text check (discount_type in ('PERCENTAGE','FIXED','COURTESY'));
alter table orders add column if not exists discount_reason text;
alter table orders add column if not exists discount_authorized_by text;
alter table orders add column if not exists tax numeric(12,2) not null default 0;
alter table orders add column if not exists payment_status text;
alter table orders add column if not exists notes text;
alter table orders add column if not exists cancellation_reason text;
alter table orders add column if not exists inventory_applied_at timestamptz;
alter table orders add column if not exists updated_at timestamptz not null default now();
update orders set folio = id where folio is null;
update orders set subtotal = total where subtotal is null;
update orders set payment_status = case when status in ('paid','preparing','ready','completed','PAID','IN_PREPARATION','READY','COMPLETED') then 'APPROVED' else 'PENDING' end where payment_status is null;
create unique index if not exists orders_operation_id_idx on orders(operation_id) where operation_id is not null;
create unique index if not exists orders_folio_idx on orders(folio);
create index if not exists orders_status_created_idx on orders(status, created_at desc);
create index if not exists orders_device_created_idx on orders(device_id, created_at desc);

alter table raw_inventory add column if not exists min_stock numeric(14,3) not null default 0;
alter table raw_inventory add column if not exists average_unit_cost numeric(14,6) not null default 0;
alter table raw_inventory add column if not exists supplier_id uuid;
alter table raw_inventory add column if not exists expires_at date;
alter table raw_inventory add column if not exists active boolean not null default true;
update raw_inventory set average_unit_cost = case when stock > 0 then cost / stock else 0 end
where average_unit_cost = 0 and cost > 0;
update raw_inventory set min_stock = case id
  when 'coffee_beans' then 1000 when 'milk_whole' then 3000 when 'milk_light' then 1500
  when 'milk_avena' then 1000 when 'milk_almendra' then 1000 when 'matcha_powder' then 100
  when 'cold_brew_concentrate' then 1000 when 'ice' then 5000 when 'croissant_finished' then 8
  when 'cookie_finished' then 10 else min_stock end
where min_stock = 0;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table raw_inventory add constraint raw_inventory_supplier_fk foreign key (supplier_id) references suppliers(id) not valid;
exception when duplicate_object then null;
end $$;

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  invoice_reference text,
  payment_method text not null,
  total numeric(12,2) not null check (total >= 0),
  notes text,
  purchased_at timestamptz not null default now(),
  created_by text not null,
  operation_id uuid not null unique
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id),
  ingredient_id text not null references raw_inventory(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  unit_cost numeric(14,6) not null check (unit_cost >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id text not null references raw_inventory(id),
  quantity numeric(14,3) not null check (quantity <> 0),
  unit text,
  movement_type text not null check (movement_type in ('PURCHASE','SALE','WASTE','ADJUSTMENT','PRODUCTION','RETURN','TRANSFER')),
  reason text,
  user_id text,
  device_id uuid references devices(id),
  order_id text references orders(id),
  purchase_id uuid references purchases(id),
  operation_id uuid,
  unit_cost_snapshot numeric(14,6) not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists inventory_sale_once_idx on inventory_movements(order_id, ingredient_id, movement_type) where order_id is not null and movement_type = 'SALE';
create unique index if not exists inventory_operation_once_idx on inventory_movements(operation_id, ingredient_id) where operation_id is not null;
create index if not exists inventory_movements_ingredient_idx on inventory_movements(ingredient_id, created_at desc);
alter table inventory_movements drop constraint if exists inventory_movements_quantity_check;
alter table inventory_movements add constraint inventory_movements_quantity_check check (quantity <> 0 or movement_type = 'ADJUSTMENT');

create table if not exists waste_records (
  id uuid primary key default gen_random_uuid(),
  ingredient_id text not null references raw_inventory(id),
  quantity numeric(14,3) not null check (quantity > 0),
  cost_snapshot numeric(12,2) not null default 0,
  reason text not null,
  user_id text not null,
  operation_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opening_amount numeric(12,2) not null check (opening_amount >= 0),
  opening_denominations jsonb not null default '{}'::jsonb,
  opened_by text not null,
  opened_at timestamptz not null default now(),
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference numeric(12,2),
  closing_denominations jsonb,
  closed_by text,
  closed_at timestamptz,
  constraint cash_session_close_integrity check ((closed_at is null and closed_by is null) or (closed_at is not null and closed_by is not null))
);
alter table cash_sessions add column if not exists opening_denominations jsonb not null default '{}'::jsonb;
create unique index if not exists one_open_cash_session_idx on cash_sessions ((true)) where closed_at is null;

alter table cash_transactions add column if not exists operation_id uuid;
alter table cash_transactions add column if not exists created_by text;
alter table cash_transactions add column if not exists cash_session_id uuid references cash_sessions(id);
create unique index if not exists cash_transactions_operation_idx on cash_transactions(operation_id) where operation_id is not null;

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references cash_sessions(id),
  movement_type text not null check (movement_type in ('SALE','CHANGE','EXPENSE','DEPOSIT','WITHDRAWAL','ADJUSTMENT','REFUND')),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null,
  order_id text references orders(id),
  operation_id uuid not null unique,
  user_id text,
  device_id uuid references devices(id),
  denominations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cash_movements_session_idx on cash_movements(cash_session_id, created_at);

create table if not exists production_batches (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  quantity_produced numeric(14,3) not null check (quantity_produced > 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  waste_quantity numeric(14,3) not null default 0 check (waste_quantity >= 0),
  expires_at timestamptz,
  responsible_user_id text not null,
  operation_id uuid not null unique,
  produced_at timestamptz not null default now()
);
alter table production_batches add column if not exists consumption jsonb not null default '[]'::jsonb;

create table if not exists daily_closings (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  sales numeric(12,2) not null,
  cash_sales numeric(12,2) not null,
  card_sales numeric(12,2) not null,
  refunds numeric(12,2) not null,
  discounts numeric(12,2) not null,
  cost_of_goods numeric(12,2) not null,
  expenses numeric(12,2) not null,
  gross_margin numeric(12,2) not null,
  operating_result numeric(12,2) not null,
  expected_cash numeric(12,2) not null,
  counted_cash numeric(12,2) not null,
  difference numeric(12,2) not null,
  tickets integer not null,
  closed_by text not null,
  created_at timestamptz not null default now(),
  unique(period_start, period_end)
);

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
  if current_order.payment_status = 'APPROVED' then return false; end if;

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

create or replace function confirm_cash_payment(
  p_order_id text,
  p_payment_id text,
  p_consumption jsonb,
  p_received_amount numeric,
  p_change_amount numeric,
  p_received_denominations jsonb,
  p_change_denominations jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  committed boolean;
  denomination_entry record;
  current_session_id uuid;
  current_order orders%rowtype;
begin
  select id into current_session_id from cash_sessions where closed_at is null for update;
  if current_session_id is null then raise exception 'cash_session_required'; end if;
  select * into current_order from orders where id = p_order_id;
  select confirm_order_payment(p_order_id, p_payment_id, p_consumption) into committed;
  if not committed then return false; end if;
  insert into cash_transactions (type, amount, description, denominations, operation_id, created_by, cash_session_id)
  values ('payment', p_received_amount, 'Pago en efectivo recibido para orden ' || p_order_id, p_received_denominations, current_order.operation_id, current_order.barista_id, current_session_id);
  insert into cash_movements (cash_session_id, movement_type, amount, description, order_id, operation_id, user_id, device_id, denominations)
  values (current_session_id, 'SALE', p_received_amount, 'Pago en efectivo recibido para orden ' || p_order_id, p_order_id, current_order.operation_id, current_order.barista_id, current_order.device_id, p_received_denominations);
  if p_change_amount > 0 then
    insert into cash_transactions (type, amount, description, denominations)
    values ('change', p_change_amount, 'Cambio devuelto para orden ' || p_order_id, p_change_denominations);
    insert into cash_movements (cash_session_id, movement_type, amount, description, order_id, operation_id, user_id, device_id, denominations)
    values (current_session_id, 'CHANGE', p_change_amount, 'Cambio devuelto para orden ' || p_order_id, p_order_id, gen_random_uuid(), current_order.barista_id, current_order.device_id, p_change_denominations);
  end if;
  for denomination_entry in select key, value from jsonb_each_text(p_received_denominations) loop
    insert into cash_register (denomination, count) values (denomination_entry.key, denomination_entry.value::integer)
    on conflict (denomination) do update set count = cash_register.count + excluded.count;
  end loop;
  for denomination_entry in select key, value from jsonb_each_text(p_change_denominations) loop
    update cash_register set count = count - denomination_entry.value::integer
    where denomination = denomination_entry.key and count >= denomination_entry.value::integer;
    if not found then raise exception 'insufficient_cash_denomination:%', denomination_entry.key; end if;
  end loop;
  return true;
end;
$$;

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
  return true;
end;
$$;

create or replace function record_inventory_waste(p_waste jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  waste_id uuid;
  current_item raw_inventory%rowtype;
  waste_quantity numeric := (p_waste->>'quantity')::numeric;
  unit_cost numeric;
  waste_cost numeric;
begin
  select * into current_item from raw_inventory where id = p_waste->>'ingredientId' for update;
  if not found then raise exception 'inventory_item_not_found:%', p_waste->>'ingredientId'; end if;
  if current_item.stock < waste_quantity then raise exception 'insufficient_inventory:%', p_waste->>'ingredientId'; end if;
  unit_cost := coalesce(nullif(current_item.average_unit_cost, 0), case when current_item.stock > 0 then current_item.cost / current_item.stock else 0 end);
  waste_cost := round(unit_cost * waste_quantity, 2);

  insert into waste_records (id, ingredient_id, quantity, cost_snapshot, reason, user_id, operation_id, created_at)
  values ((p_waste->>'id')::uuid, p_waste->>'ingredientId', waste_quantity, waste_cost, p_waste->>'reason', p_waste->>'userId', (p_waste->>'operationId')::uuid, (p_waste->>'createdAt')::timestamptz)
  on conflict (operation_id) do nothing returning id into waste_id;
  if waste_id is null then return false; end if;

  update raw_inventory set stock = stock - waste_quantity, cost = greatest(0, cost - waste_cost)
  where id = p_waste->>'ingredientId';
  insert into inventory_movements (ingredient_id, quantity, unit, movement_type, reason, user_id, operation_id, unit_cost_snapshot)
  values (p_waste->>'ingredientId', -waste_quantity, current_item.unit, 'WASTE', p_waste->>'reason', p_waste->>'userId', (p_waste->>'operationId')::uuid, unit_cost);
  return true;
end;
$$;

create or replace function record_inventory_adjustment(
  p_ingredient_id text,
  p_stock numeric,
  p_cost numeric,
  p_reason text,
  p_user_id text,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item raw_inventory%rowtype;
  movement_id uuid;
  delta numeric;
  previous_unit_cost numeric;
begin
  if exists (select 1 from inventory_movements where operation_id = p_operation_id and ingredient_id = p_ingredient_id) then return false; end if;
  select * into current_item from raw_inventory where id = p_ingredient_id for update;
  if not found then raise exception 'inventory_item_not_found:%', p_ingredient_id; end if;
  if p_stock < 0 or p_cost < 0 then raise exception 'invalid_inventory_adjustment'; end if;
  delta := p_stock - current_item.stock;
  previous_unit_cost := case when current_item.stock > 0 then current_item.cost / current_item.stock else 0 end;
  insert into inventory_movements (ingredient_id, quantity, unit, movement_type, reason, user_id, operation_id, unit_cost_snapshot)
  values (p_ingredient_id, delta, current_item.unit, 'ADJUSTMENT', p_reason, p_user_id, p_operation_id, previous_unit_cost)
  returning id into movement_id;
  update raw_inventory set stock = p_stock, cost = p_cost, average_unit_cost = case when p_stock > 0 then p_cost / p_stock else 0 end
  where id = p_ingredient_id;
  return movement_id is not null;
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
  values ('refund', current_order.total, 'Devolución de orden ' || coalesce(current_order.folio, current_order.id) || ': ' || p_reason, p_cash_denominations);
  update orders set status = 'REFUNDED', payment_status = 'REFUNDED', cancellation_reason = p_reason, updated_at = now() where id = p_order_id;
  return true;
end;
$$;

create or replace function record_production_batch(p_batch jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  current_item raw_inventory%rowtype;
  finished_item inventory%rowtype;
  line_quantity numeric;
  unit_cost numeric;
  calculated_cost numeric := 0;
  net_quantity numeric := (p_batch->>'quantityProduced')::numeric - (p_batch->>'wasteQuantity')::numeric;
  operation_uuid uuid := (p_batch->>'operationId')::uuid;
begin
  if exists (select 1 from production_batches where operation_id = operation_uuid) then return false; end if;
  if net_quantity <= 0 then raise exception 'invalid_production_quantity'; end if;
  for line in select * from jsonb_array_elements(p_batch->'consumption') loop
    line_quantity := (line->>'quantity')::numeric;
    select * into current_item from raw_inventory where id = line->>'ingredientId' for update;
    if not found then raise exception 'inventory_item_not_found:%', line->>'ingredientId'; end if;
    if line_quantity <= 0 or current_item.stock < line_quantity then raise exception 'insufficient_inventory:%', line->>'ingredientId'; end if;
    unit_cost := coalesce(nullif(current_item.average_unit_cost, 0), case when current_item.stock > 0 then current_item.cost / current_item.stock else 0 end);
    calculated_cost := calculated_cost + line_quantity * unit_cost;
    update raw_inventory set stock = stock - line_quantity, cost = greatest(0, cost - round(line_quantity * unit_cost, 2)) where id = current_item.id;
    insert into inventory_movements (ingredient_id, quantity, unit, movement_type, reason, user_id, operation_id, unit_cost_snapshot)
    values (current_item.id, -line_quantity, current_item.unit, 'PRODUCTION', 'Lote ' || (p_batch->>'id'), p_batch->>'responsibleUserId', operation_uuid, unit_cost);
  end loop;
  calculated_cost := round(calculated_cost, 2);
  select * into finished_item from inventory where product_id = p_batch->>'productId' for update;
  if found then
    update inventory set cost = case when stock + net_quantity > 0 then ((stock * cost) + calculated_cost) / (stock + net_quantity) else 0 end,
      stock = stock + net_quantity where product_id = p_batch->>'productId';
  else
    insert into inventory (product_id, stock, cost) values (p_batch->>'productId', net_quantity, calculated_cost / net_quantity);
  end if;
  insert into production_batches (id, product_id, quantity_produced, total_cost, waste_quantity, expires_at, responsible_user_id, operation_id, produced_at, consumption)
  values ((p_batch->>'id')::uuid, p_batch->>'productId', (p_batch->>'quantityProduced')::numeric, calculated_cost,
    (p_batch->>'wasteQuantity')::numeric, nullif(p_batch->>'expiresAt', '')::timestamptz, p_batch->>'responsibleUserId', operation_uuid,
    (p_batch->>'producedAt')::timestamptz, p_batch->'consumption');
  return true;
end;
$$;

create or replace function record_cash_movement(p_transaction jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session_id uuid;
  denomination_entry record;
  current_count integer;
  subtracts_cash boolean;
  mapped_type text;
  operation_uuid uuid := (p_transaction->>'operationId')::uuid;
begin
  if exists (select 1 from cash_transactions where operation_id = operation_uuid) then return false; end if;
  select id into current_session_id from cash_sessions where closed_at is null for update;
  if current_session_id is null then raise exception 'cash_session_required'; end if;
  subtracts_cash := p_transaction->>'type' in ('change','manual_expense','manual_investment','refund');
  mapped_type := case p_transaction->>'type'
    when 'payment' then 'SALE' when 'change' then 'CHANGE' when 'manual_expense' then 'EXPENSE'
    when 'manual_income' then 'DEPOSIT' when 'manual_investment' then 'WITHDRAWAL'
    when 'adjustment' then 'ADJUSTMENT' when 'refund' then 'REFUND' else 'DEPOSIT' end;

  for denomination_entry in select key, value from jsonb_each_text(coalesce(p_transaction->'denominations', '{}'::jsonb)) loop
    if denomination_entry.value::integer < 0 then raise exception 'invalid_denominations'; end if;
    select count into current_count from cash_register where denomination = denomination_entry.key for update;
    current_count := coalesce(current_count, 0);
    if subtracts_cash and current_count < denomination_entry.value::integer then raise exception 'insufficient_cash_denomination:%', denomination_entry.key; end if;
    insert into cash_register (denomination, count)
    values (denomination_entry.key, current_count + denomination_entry.value::integer * case when subtracts_cash then -1 else 1 end)
    on conflict (denomination) do update set count = excluded.count;
  end loop;

  insert into cash_transactions (type, amount, description, denominations, operation_id, created_by, cash_session_id)
  values (p_transaction->>'type', (p_transaction->>'amount')::numeric, p_transaction->>'description', coalesce(p_transaction->'denominations', '{}'::jsonb), operation_uuid, p_transaction->>'createdBy', current_session_id);
  insert into cash_movements (cash_session_id, movement_type, amount, description, operation_id, user_id, denominations)
  values (current_session_id, mapped_type, (p_transaction->>'amount')::numeric, p_transaction->>'description', operation_uuid, p_transaction->>'createdBy', coalesce(p_transaction->'denominations', '{}'::jsonb));
  return true;
end;
$$;

create or replace function open_cash_session(p_session jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  denomination_entry record;
begin
  if exists (select 1 from cash_sessions where closed_at is null) then return false; end if;
  insert into cash_sessions (id, opening_amount, opening_denominations, opened_by, opened_at)
  values ((p_session->>'id')::uuid, (p_session->>'openingAmount')::numeric, p_session->'openingDenominations', p_session->>'openedBy', (p_session->>'openedAt')::timestamptz);
  update cash_register set count = 0;
  for denomination_entry in select key, value from jsonb_each_text(p_session->'openingDenominations') loop
    insert into cash_register (denomination, count) values (denomination_entry.key, denomination_entry.value::integer)
    on conflict (denomination) do update set count = excluded.count;
  end loop;
  return true;
exception when unique_violation then return false;
end;
$$;

create or replace function close_cash_session(p_session_id text, p_close jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  denomination_entry record;
  target cash_sessions%rowtype;
begin
  select * into target from cash_sessions where id = p_session_id::uuid for update;
  if not found or target.closed_at is not null then return false; end if;
  update cash_sessions set
    expected_cash = (p_close->>'expectedCash')::numeric,
    counted_cash = (p_close->>'countedCash')::numeric,
    difference = (p_close->>'difference')::numeric,
    closing_denominations = p_close->'closingDenominations',
    closed_by = p_close->>'closedBy',
    closed_at = (p_close->>'closedAt')::timestamptz
  where id = p_session_id::uuid;
  update cash_register set count = 0;
  for denomination_entry in select key, value from jsonb_each_text(p_close->'closingDenominations') loop
    insert into cash_register (denomination, count) values (denomination_entry.key, denomination_entry.value::integer)
    on conflict (denomination) do update set count = excluded.count;
  end loop;
  return true;
end;
$$;

create or replace function close_cash_session_with_closing(p_session_id text, p_close jsonb, p_closure jsonb) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  closed boolean;
begin
  select close_cash_session(p_session_id, p_close) into closed;
  if not closed then return false; end if;
  insert into daily_closures (id, closed_at, total_sales, total_income, total_costs, net_profit, cash_start, cash_end, products_sold, notes)
  values ((p_closure->>'id')::uuid, (p_closure->>'closed_at')::timestamptz, (p_closure->>'total_sales')::numeric,
    (p_closure->>'total_income')::numeric, (p_closure->>'total_costs')::numeric, (p_closure->>'net_profit')::numeric,
    (p_closure->>'cash_start')::numeric, (p_closure->>'cash_end')::numeric, coalesce(p_closure->'products_sold', '{}'::jsonb), p_closure->>'notes');
  insert into daily_closings (id, period_start, period_end, sales, cash_sales, card_sales, refunds, discounts, cost_of_goods, expenses,
    gross_margin, operating_result, expected_cash, counted_cash, difference, tickets, closed_by)
  values ((p_closure->>'id')::uuid, (p_closure->>'period_start')::timestamptz, (p_closure->>'period_end')::timestamptz,
    (p_closure->>'total_sales')::numeric, (p_closure->>'cash_sales')::numeric, (p_closure->>'card_sales')::numeric,
    (p_closure->>'refunds')::numeric, (p_closure->>'discounts')::numeric, (p_closure->>'cost_of_goods')::numeric,
    (p_closure->>'expenses')::numeric, (p_closure->>'gross_margin')::numeric, (p_closure->>'operating_result')::numeric,
    (p_closure->>'expected_cash')::numeric, (p_closure->>'counted_cash')::numeric, (p_closure->>'difference')::numeric,
    (p_closure->>'tickets')::integer, p_closure->>'closed_by');
  return true;
end;
$$;

revoke all on function confirm_order_payment(text, text, jsonb) from public;
revoke all on function confirm_cash_payment(text, text, jsonb, numeric, numeric, jsonb, jsonb) from public;
revoke all on function record_inventory_purchase(jsonb) from public;
revoke all on function record_inventory_waste(jsonb) from public;
revoke all on function record_inventory_adjustment(text, numeric, numeric, text, text, uuid) from public;
revoke all on function record_cash_movement(jsonb) from public;
revoke all on function record_production_batch(jsonb) from public;
revoke all on function open_cash_session(jsonb) from public;
revoke all on function close_cash_session(text, jsonb) from public;
revoke all on function close_cash_session_with_closing(text, jsonb, jsonb) from public;
revoke all on function apply_order_refund(text, text, text, text, jsonb) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function confirm_order_payment(text, text, jsonb) to service_role;
    grant execute on function confirm_cash_payment(text, text, jsonb, numeric, numeric, jsonb, jsonb) to service_role;
    grant execute on function record_inventory_purchase(jsonb) to service_role;
    grant execute on function record_inventory_waste(jsonb) to service_role;
    grant execute on function record_inventory_adjustment(text, numeric, numeric, text, text, uuid) to service_role;
    grant execute on function record_cash_movement(jsonb) to service_role;
    grant execute on function record_production_batch(jsonb) to service_role;
    grant execute on function open_cash_session(jsonb) to service_role;
    grant execute on function close_cash_session(text, jsonb) to service_role;
    grant execute on function close_cash_session_with_closing(text, jsonb, jsonb) to service_role;
    grant execute on function apply_order_refund(text, text, text, text, jsonb) to service_role;
  end if;
end $$;

-- ROFE exposes data through its authenticated backend only. Block direct table
-- access from Supabase browser roles; service_role remains backend-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'inventory', 'raw_inventory', 'orders', 'cash_register',
    'cash_transactions', 'bakery_batches', 'daily_closures', 'app_users',
    'devices', 'auth_sessions', 'audit_logs', 'suppliers', 'purchases',
    'purchase_items', 'inventory_movements', 'waste_records', 'cash_sessions',
    'cash_movements', 'production_batches', 'daily_closings'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on table public.%I from anon', table_name); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on table public.%I from authenticated', table_name); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant select, insert, update, delete on table public.%I to service_role', table_name); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on all sequences in schema public from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on all sequences in schema public from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant usage, select on all sequences in schema public to service_role'; end if;
end $$;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('product_images', 'product_images', true, 1000000, array['image/jpeg','image/png','image/webp'])
      on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
    $sql$;
  end if;
end $$;
