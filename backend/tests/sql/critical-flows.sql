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
  if rofe_schema_version() <> 8 then raise exception 'voucher ledger migration missing'; end if;
end $$;
insert into pickup_settings values (1, '{"enabled":false,"locationName":"ROFÉ"}');
-- Change vouchers: cash payment with insufficient change issues one voucher; payout and order use are exactly-once.
insert into orders (id, folio, operation_id, customer_name, items, total, status, payment_status, payment_method)
values ('pg-voucher-sale', 'R-PG-VOUCH', 'b0000000-0000-4000-8000-000000000001', 'Postgres', '[]', 35, 'PENDING_PAYMENT', 'NOT_REQUIRED', 'cash');
insert into orders (id, folio, customer_name, items, total, status, payment_status, payment_method)
values ('pg-voucher-use', 'R-PG-VUSE', 'Postgres', '[]', 20, 'PENDING_PAYMENT', 'PENDING', 'card');
do $$
declare paid boolean; payout numeric; drawer_100 integer; drawer_20 integer;
begin
  update cash_register set count = 0 where denomination in ('bill_100', 'bill_20', 'coin_10', 'coin_5');
  insert into cash_register(denomination, count) values ('bill_20', 1) on conflict(denomination) do update set count = 1;
  -- $100 bill for $35: only $20 of the $65 change exists → voucher of $45.
  select confirm_cash_payment_with_voucher('pg-voucher-sale', 'cash-pg-voucher-sale', '[]', 100, 20, '{"bill_100":1}', '{"bill_20":1}', 'PGTE-STVO-UC', 45, 'postgres-test') into paid;
  if not paid then raise exception 'voucher payment not committed'; end if;
  select confirm_cash_payment_with_voucher('pg-voucher-sale', 'cash-pg-voucher-sale', '[]', 100, 20, '{"bill_100":1}', '{"bill_20":1}', 'PGTE-STVO-UD', 45, 'postgres-test') into paid;
  if paid then raise exception 'voucher payment replay duplicated'; end if;
  if (select count(*) from change_vouchers where order_id = 'pg-voucher-sale') <> 1 then raise exception 'voucher not issued exactly once'; end if;
  if (select balance from change_vouchers where code = 'PGTE-STVO-UC') <> 45 then raise exception 'voucher balance incorrect'; end if;
  -- Use $20 of it on another order, then cancel that order: the balance comes back once.
  if not apply_change_voucher_to_order('PGTE-STVO-UC', 'pg-voucher-use', 'a0000000-0000-4000-8000-000000000001', 20) then raise exception 'voucher not applied'; end if;
  if apply_change_voucher_to_order('PGTE-STVO-UC', 'pg-voucher-use', 'a0000000-0000-4000-8000-000000000001', 20) then raise exception 'voucher applied twice'; end if;
  if (select balance from change_vouchers where code = 'PGTE-STVO-UC') <> 25 then raise exception 'voucher order use incorrect'; end if;
  if release_change_voucher_for_order('pg-voucher-use') <> 20 then raise exception 'voucher not released'; end if;
  if release_change_voucher_for_order('pg-voucher-use') <> 0 then raise exception 'voucher released twice'; end if;
  if (select balance from change_vouchers where code = 'PGTE-STVO-UC') <> 45 then raise exception 'voucher balance not restored'; end if;
  -- Payout needs the exact balance and real denominations in the drawer.
  begin
    perform redeem_change_voucher_cash('PGTE-STVO-UC', 'a0000000-0000-4000-8000-000000000002', 45, '{"bill_20":2,"coin_5":1}', 'postgres-test');
    raise exception 'voucher payout without cash was accepted';
  exception when raise_exception then
    if SQLERRM not like 'insufficient_cash_denomination:%' then raise; end if;
  end;
  if (select balance from change_vouchers where code = 'PGTE-STVO-UC') <> 45 then raise exception 'failed payout changed the voucher'; end if;
  insert into cash_register(denomination, count) values ('bill_20', 2), ('coin_5', 1) on conflict(denomination) do update set count = excluded.count;
  select redeem_change_voucher_cash('PGTE-STVO-UC', 'a0000000-0000-4000-8000-000000000003', 45, '{"bill_20":2,"coin_5":1}', 'postgres-test') into payout;
  if payout <> 45 then raise exception 'voucher payout not committed'; end if;
  select redeem_change_voucher_cash('PGTE-STVO-UC', 'a0000000-0000-4000-8000-000000000003', 45, '{"bill_20":2,"coin_5":1}', 'postgres-test') into payout;
  if payout <> 0 then raise exception 'voucher payout replay duplicated'; end if;
  if (select status from change_vouchers where code = 'PGTE-STVO-UC') <> 'REDEEMED' then raise exception 'voucher not redeemed'; end if;
  if (select count from cash_register where denomination = 'bill_20') <> 0 then raise exception 'payout drawer incorrect'; end if;
  if (select count(*) from cash_transactions where type = 'voucher_payout') <> 1 then raise exception 'payout ledger not exactly once'; end if;
  begin
    perform apply_change_voucher_to_order('PGTE-STVO-UC', 'pg-voucher-use', 'a0000000-0000-4000-8000-000000000004', 5);
    raise exception 'redeemed voucher was reused';
  exception when raise_exception then
    if SQLERRM <> 'voucher_not_active' then raise; end if;
  end;
end $$;
-- Migration 008: liability ledger — cancellation, orphan release, no resurrection, constraints.
insert into orders (id, folio, operation_id, customer_name, items, total, status, payment_status, payment_method)
values ('pg-v8-sale', 'R-PG-V8', 'b0000000-0000-4000-8000-000000000081', 'Postgres', '[]', 30, 'PENDING_PAYMENT', 'NOT_REQUIRED', 'cash');
insert into orders (id, folio, customer_name, items, total, status, payment_status, payment_method)
values ('pg-v8-pending', 'R-PG-V8P', 'Postgres', '[]', 20, 'PENDING_PAYMENT', 'PENDING', 'card');
do $$
begin
  if not confirm_cash_payment_with_voucher('pg-v8-sale', 'cash-pg-v8-sale', '[]', 50, 0, '{"bill_50":1}', '{}', 'PGV8-AAAA-AA', 20, 'postgres-test') then raise exception 'v8 voucher not issued'; end if;
  -- A voucher reserved by a pending order cannot be cancelled.
  perform apply_change_voucher_to_order('PGV8-AAAA-AA', 'pg-v8-pending', 'c0000000-0000-4000-8000-000000000001', 10);
  begin
    perform cancel_change_voucher('PGV8-AAAA-AA', 'Cliente reportó pérdida', 'admin');
    raise exception 'reserved voucher was cancelled';
  exception when raise_exception then
    if SQLERRM <> 'voucher_reserved_by_pending_order' then raise; end if;
  end;
  perform release_change_voucher_for_order('pg-v8-pending');
  begin
    perform cancel_change_voucher('PGV8-AAAA-AA', 'x', 'admin');
    raise exception 'cancel without reason accepted';
  exception when raise_exception then
    if SQLERRM <> 'voucher_cancel_reason_required' then raise; end if;
  end;
  if not cancel_change_voucher('PGV8-AAAA-AA', 'Cliente reportó pérdida', 'admin') then raise exception 'voucher not cancelled'; end if;
  if cancel_change_voucher('PGV8-AAAA-AA', 'Cliente reportó pérdida', 'admin') then raise exception 'voucher cancelled twice'; end if;
  if (select status from change_vouchers where code = 'PGV8-AAAA-AA') <> 'CANCELLED' then raise exception 'voucher status not cancelled'; end if;
  begin
    perform apply_change_voucher_to_order('PGV8-AAAA-AA', 'pg-v8-pending', 'c0000000-0000-4000-8000-000000000002', 5);
    raise exception 'cancelled voucher was used';
  exception when raise_exception then
    if SQLERRM <> 'voucher_not_active' then raise; end if;
  end;
  -- Orphan reservation (order never stored) older than 10 minutes is given back once.
  insert into change_vouchers (code, amount, balance, created_by) values ('PGV8-BBBB-BB', 15, 0, 'postgres-test');
  insert into change_voucher_redemptions (voucher_id, kind, amount, order_id, operation_id, created_at)
  select id, 'ORDER', 15, 'never-stored-order', 'c0000000-0000-4000-8000-000000000003', now() - interval '11 minutes' from change_vouchers where code = 'PGV8-BBBB-BB';
  update change_vouchers set status = 'REDEEMED' where code = 'PGV8-BBBB-BB';
  if release_orphan_change_voucher_redemptions('PGV8-BBBB-BB') <> 15 then raise exception 'orphan not released'; end if;
  if release_orphan_change_voucher_redemptions('PGV8-BBBB-BB') <> 0 then raise exception 'orphan released twice'; end if;
  if (select balance from change_vouchers where code = 'PGV8-BBBB-BB') <> 15 or (select status from change_vouchers where code = 'PGV8-BBBB-BB') <> 'ACTIVE' then raise exception 'orphan balance not restored'; end if;
  -- voucher_amount can never exceed the order total.
  begin
    update orders set voucher_amount = 999 where id = 'pg-v8-pending';
    raise exception 'voucher_amount above total accepted';
  exception when check_violation then null;
  end;
  -- Refund of a cash order part-paid with a voucher: the ledger records only the cash returned.
  insert into orders (id, folio, operation_id, customer_name, items, total, voucher_amount, status, payment_status, payment_method)
  values ('pg-v8-refund', 'R-PG-V8R', 'b0000000-0000-4000-8000-000000000089', 'Postgres', '[]', 45, 25, 'PAID', 'APPROVED', 'cash');
  update cash_register set count = count + 1 where denomination = 'bill_20';
  if not apply_order_refund('pg-v8-refund', 'c0000000-0000-4000-8000-000000000009', 'Prueba de devolución', 'admin', '{"bill_20": 1}'::jsonb) then raise exception 'refund not applied'; end if;
  if (select amount from cash_transactions where type = 'refund' and description like 'Devolución de orden R-PG-V8R%') <> 20 then raise exception 'refund ledger amount is not the cash returned'; end if;
end $$;
rollback;
