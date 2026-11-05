\set ON_ERROR_STOP on
begin;
insert into orders (id, folio, operation_id, customer_name, items, subtotal, total, status, payment_status, payment_method)
values ('pg-test-sale', 'PG-TEST-SALE', 'd25acee6-592b-4460-95be-ed5c826f4cd0', 'Test', '[]', 55, 55, 'PENDING_PAYMENT', 'PENDING', 'card');
do $$
declare before_stock numeric; after_stock numeric; paid boolean;
begin
  select stock into before_stock from raw_inventory where id = 'coffee_beans';
  perform reserve_order_inventory('pg-test-sale', '[{"ingredientId":"coffee_beans","quantity":18}]');
  perform reserve_order_inventory('pg-test-sale', '[{"ingredientId":"coffee_beans","quantity":18}]');
  if (select reserved_stock from raw_inventory where id = 'coffee_beans') <> 18 then raise exception 'reservation duplicated'; end if;
  begin
    update raw_inventory set stock = 17 where id = 'coffee_beans';
    raise exception 'reserved inventory could be consumed';
  exception when check_violation then null; end;
  select confirm_order_payment('pg-test-sale', 'provider-test', '[{"ingredientId":"coffee_beans","quantity":18}]') into paid;
  if not paid then raise exception 'first payment was not committed'; end if;
  if (select reserved_stock from raw_inventory where id = 'coffee_beans') <> 0 then raise exception 'reservation not released'; end if;
  select confirm_order_payment('pg-test-sale', 'provider-test', '[{"ingredientId":"coffee_beans","quantity":18}]') into paid;
  if paid then raise exception 'payment replay duplicated'; end if;
  select stock into after_stock from raw_inventory where id = 'coffee_beans';
  if after_stock <> before_stock - 18 then raise exception 'inventory deducted more than once'; end if;
  if (select count(*) from cash_transactions where description like '%PG-TEST-SALE%') <> 1 then raise exception 'ledger not exactly once'; end if;
  if (select count(*) from inventory_movements where order_id = 'pg-test-sale') <> 1 then raise exception 'movement not exactly once'; end if;
  update orders set status = 'REFUNDED', payment_status = 'REFUNDED' where id = 'pg-test-sale';
  select confirm_order_payment('pg-test-sale', 'late-approval', '[{"ingredientId":"coffee_beans","quantity":18}]') into paid;
  if paid then raise exception 'refunded order was resurrected'; end if;
  if (select stock from raw_inventory where id = 'coffee_beans') <> after_stock then raise exception 'late approval consumed inventory'; end if;
end $$;
insert into orders (id, folio, customer_name, items, total, status, payment_status, payment_method)
values ('pg-cancelled', 'PG-CANCELLED', 'Test', '[]', 10, 'PENDING_PAYMENT', 'PENDING', 'card');
select reserve_order_inventory('pg-cancelled', '[{"ingredientId":"coffee_beans","quantity":20}]');
update orders set status = 'CANCELLED' where id = 'pg-cancelled';
do $$ begin
  if exists(select 1 from inventory_reservations where order_id = 'pg-cancelled') then raise exception 'cancelled reservation not released'; end if;
end $$;
insert into cash_sessions(id, opening_amount, opening_denominations, opened_by, opened_at)
values ('789d92fb-2964-490f-b341-90d13a16db3f', 100, '{"bill_50":2}', 'postgres-test', now());
insert into cash_register(denomination, count) values ('bill_50',2) on conflict(denomination) do update set count = 2;
do $$
declare purchase jsonb; committed boolean; before_stock numeric;
begin
  select stock into before_stock from raw_inventory where id = 'coffee_beans';
  purchase := jsonb_build_object('id','34cacfc0-275d-4452-a901-5f69dd9cb620', 'operationId','34cacfc0-275d-4452-a901-5f69dd9cb621',
    'paymentMethod','cash', 'total',50, 'createdBy','postgres-test', 'purchasedAt',now(), 'cashDenominations',jsonb_build_object('bill_500',1),
    'items',jsonb_build_array(jsonb_build_object('ingredientId','coffee_beans','quantity',100,'unit','g','unitCost',0.5,'subtotal',50)));
  begin
    perform record_inventory_purchase(purchase);
    raise exception 'cash purchase without sufficient denominations was accepted';
  exception when raise_exception then
    if SQLERRM not like 'insufficient_cash_denomination:%' then raise; end if;
  end;
  if exists(select 1 from purchases where id = '34cacfc0-275d-4452-a901-5f69dd9cb620') then raise exception 'purchase committed without cash movement'; end if;
  if (select stock from raw_inventory where id = 'coffee_beans') <> before_stock then raise exception 'failed purchase changed stock'; end if;
  purchase := jsonb_set(purchase,'{cashDenominations}','{"bill_50":1}');
  select record_inventory_purchase(purchase) into committed;
  if not committed then raise exception 'cash purchase did not commit'; end if;
  select record_inventory_purchase(purchase) into committed;
  if committed then raise exception 'cash purchase was duplicated'; end if;
  if (select count from cash_register where denomination = 'bill_50') <> 1 then raise exception 'cash purchase changed drawer twice'; end if;
  if (select stock from raw_inventory where id = 'coffee_beans') <> before_stock + 100 then raise exception 'cash purchase stock incorrect'; end if;
end $$;
insert into orders (id, folio, customer_name, items, total, status, payment_status, payment_method, channel, payment_provider, pickup)
values ('pg-qr-sale', 'Q-PG-QR', 'Cliente QR', '[]', 55, 'PENDING_PAYMENT', 'PENDING', 'card', 'QR_PICKUP', 'STRIPE', '{"standId":"entrada","locationName":"ROFÉ"}');
select reserve_order_inventory('pg-qr-sale', '[{"ingredientId":"coffee_beans","quantity":18}]');
do $$ begin
  if not confirm_order_payment('pg-qr-sale', 'pi_pg_test', '[{"ingredientId":"coffee_beans","quantity":18}]') then raise exception 'QR payment did not commit'; end if;
  if confirm_order_payment('pg-qr-sale', 'pi_pg_test', '[{"ingredientId":"coffee_beans","quantity":18}]') then raise exception 'QR payment replay duplicated'; end if;
  if exists(select 1 from inventory_reservations where order_id = 'pg-qr-sale') then raise exception 'QR inventory reservation not released'; end if;
  if (select count(*) from cash_transactions where description like '%Q-PG-QR%') <> 1 then raise exception 'QR ledger duplicated'; end if;
  if rofe_schema_version() <> 5 then raise exception 'QR migration missing'; end if;
end $$;
insert into pickup_settings values (1, '{"enabled":false,"locationName":"ROFÉ"}');
rollback;
