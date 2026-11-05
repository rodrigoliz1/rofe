-- ROFÉ on Vercel: serverless instances detect order changes by polling orders.updated_at.
-- Guarantee every update bumps it, including RPCs and manual corrections. Non-destructive.
create or replace function rofe_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on orders;
create trigger orders_touch_updated_at
  before update on orders
  for each row execute function rofe_touch_updated_at();

create index if not exists orders_updated_at_idx on orders (updated_at desc);
