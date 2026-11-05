#!/usr/bin/env bash
# Real concurrency on PostgreSQL: parallel sessions race for the same voucher. Exactly one
# may win each race; the balance can never go negative or be paid twice.
set -euo pipefail
host="$1"; db="$2"
psql_q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$host" -d "$db" -c "$1"; }
psql_q "insert into orders (id, folio, operation_id, customer_name, items, total, status, payment_status, payment_method) values ('race-sale', 'R-RACE', 'd0000000-0000-4000-8000-000000000001', 'Race', '[]', 10, 'PENDING_PAYMENT', 'NOT_REQUIRED', 'cash');
  insert into cash_sessions (id, opening_amount, opening_denominations, opened_by, opened_at) select 'd0000000-0000-4000-8000-0000000000aa', 0, '{}', 'race', now() where not exists (select 1 from cash_sessions where closed_at is null);
  insert into cash_register(denomination, count) values ('bill_20', 50) on conflict(denomination) do update set count = 50;
  select confirm_cash_payment_with_voucher('race-sale', 'cash-race-sale', '[]', 30, 0, '{\"bill_20\":1, \"coin_10\":1}', '{}', 'RACE-RACE-01', 20, 'race');" >/dev/null
for i in $(seq 1 12); do psql_q "insert into orders (id, folio, customer_name, items, total, status, payment_status, payment_method) values ('race-order-$i', 'R-RACE-$i', 'Race', '[]', 20, 'PENDING_PAYMENT', 'PENDING', 'card');" >/dev/null; done

# 12 sessions try to spend the whole $20 balance on 12 different orders at the same time.
pids=()
for i in $(seq 1 12); do
  ( psql -X -q -t -A -h "$host" -d "$db" -c "select apply_change_voucher_to_order('RACE-RACE-01', 'race-order-$i', 'e0000000-0000-4000-8000-0000000000$(printf %02d "$i")', 20);" >/dev/null 2>&1 && echo ok >> "$host/race-apply" || echo fail >> "$host/race-apply" ) &
  pids+=($!)
done
wait "${pids[@]}"
wins=$(grep -c ok "$host/race-apply" || true)
[ "$wins" = "1" ] || { echo "concurrent order use: expected 1 winner, got $wins"; exit 1; }
[ "$(psql_q "select balance from change_vouchers where code = 'RACE-RACE-01'")" = "0.00" ] || { echo "balance after race is not 0"; exit 1; }

# Give the balance back, then 12 sessions race to pay it out in cash with different operations.
psql_q "select release_change_voucher_for_order(order_id) from change_voucher_redemptions where status = 'APPLIED' and kind = 'ORDER';" >/dev/null
pids=()
for i in $(seq 1 12); do
  ( psql -X -q -t -A -h "$host" -d "$db" -c "select redeem_change_voucher_cash('RACE-RACE-01', 'f0000000-0000-4000-8000-0000000000$(printf %02d "$i")', 20, '{\"bill_20\":1}', 'race');" >/dev/null 2>&1 && echo ok >> "$host/race-payout" || echo fail >> "$host/race-payout" ) &
  pids+=($!)
done
wait "${pids[@]}"
wins=$(grep -c ok "$host/race-payout" || true)
[ "$wins" = "1" ] || { echo "concurrent payouts: expected 1 winner, got $wins"; exit 1; }
[ "$(psql_q "select count(*) from cash_transactions where type = 'voucher_payout' and description like '%RACE-RACE-01%'")" = "1" ] || { echo "payout recorded more than once"; exit 1; }
# 12 + 1 bills: 50 before, +1 received ($20 bill in the sale) − 1 paid out = 50.
[ "$(psql_q "select count from cash_register where denomination = 'bill_20'")" = "50" ] || { echo "drawer changed more than once"; exit 1; }

# 8 sessions confirm the same cash payment with a voucher at once: one payment, one voucher.
psql_q "insert into orders (id, folio, operation_id, customer_name, items, total, status, payment_status, payment_method) values ('race-pay', 'R-RACE-PAY', 'd0000000-0000-4000-8000-000000000002', 'Race', '[]', 10, 'PENDING_PAYMENT', 'NOT_REQUIRED', 'cash');" >/dev/null
pids=()
for i in $(seq 1 8); do
  ( psql -X -q -t -A -h "$host" -d "$db" -c "select confirm_cash_payment_with_voucher('race-pay', 'cash-race-pay', '[]', 20, 0, '{\"bill_20\":1}', '{}', 'RACE-PAY0-$(printf %02d "$i")', 10, 'race');" >/dev/null 2>&1 || true ) &
  pids+=($!)
done
wait "${pids[@]}"
[ "$(psql_q "select count(*) from change_vouchers where order_id = 'race-pay'")" = "1" ] || { echo "concurrent cash payment issued more than one voucher"; exit 1; }
[ "$(psql_q "select count(*) from cash_transactions where type = 'payment' and description like '%race-pay%'")" = "1" ] || { echo "concurrent cash payment recorded more than once"; exit 1; }
echo 'PostgreSQL concurrency checks passed.'
