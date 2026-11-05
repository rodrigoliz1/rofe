-- Add the public pickup channel without changing existing POS orders.
begin;
alter table orders add column if not exists channel text not null default 'POS' check (channel in ('POS', 'QR_PICKUP'));
alter table orders add column if not exists payment_provider text check (payment_provider in ('MERCADO_PAGO', 'STRIPE'));
alter table orders add column if not exists pickup jsonb;
create index if not exists orders_pending_pickup_idx on orders(created_at) where channel = 'QR_PICKUP' and status = 'PENDING_PAYMENT' and payment_status = 'PENDING';
create table if not exists pickup_settings (id smallint primary key check (id = 1), settings jsonb not null);
alter table pickup_settings enable row level security;
revoke all on pickup_settings from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'anon') then revoke all on pickup_settings from anon; end if;
  if exists(select 1 from pg_roles where rolname = 'authenticated') then revoke all on pickup_settings from authenticated; end if;
  if exists(select 1 from pg_roles where rolname = 'service_role') then grant all on pickup_settings to service_role; end if;
end $$;
create or replace function rofe_schema_version() returns integer
language sql stable security invoker set search_path = public as $$ select 5 $$;
revoke all on function rofe_schema_version() from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then grant execute on function rofe_schema_version() to service_role; end if;
end $$;
commit;
