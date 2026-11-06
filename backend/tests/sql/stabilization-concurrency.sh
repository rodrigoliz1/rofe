#!/usr/bin/env bash
# This script receives only the disposable cluster created by test-migrations.sh.
set -euo pipefail
host="$1"; db="$2"
q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$host" -d "$db" -c "$1"; }
shift='a3000000-0000-4000-8000-000000000001'
q "select open_cash_session(jsonb_build_object('id','$shift','openingAmount',100,'openingDenominations','{\"bill_100\":1}'::jsonb,'openedBy','race','openedAt',clock_timestamp()-interval '1 minute'));
insert into orders(id,operation_id,customer_name,items,total,status,payment_method,payment_status,created_at) values ('stabilization-race',gen_random_uuid(),'Isolated','[]',50,'PENDING_PAYMENT','cash','PENDING',clock_timestamp()-interval '1 day');" >/dev/null
# Hold a committed-in-flight receipt while the close is waiting for its shift lock.
q "begin; select id from cash_sessions where id='$shift' for update; select pg_advisory_xact_lock(781234); select confirm_cash_payment('stabilization-race','cash','[]',50,0,'{\"bill_50\":1}','{}'); select pg_sleep(1); commit;" > "$host/stabilization-payment" &
payer=$!
# Synchronize on the actual lock instead of assuming scheduling order.
for i in $(seq 1 100); do
  [ "$(q "select count(*) from pg_locks where locktype='advisory' and objid=781234 and granted")" = 1 ] && break
  sleep 0.01
done
q "select close_cash_session_consistent('$shift','{\"bill_100\":1,\"bill_50\":1}','race');" > "$host/stabilization-close" &
closer=$!
wait "$payer" "$closer"
[ "$(q "select expected_cash from cash_sessions where id='$shift'")" = '150.00' ] || { echo 'Close lost concurrent receipt'; exit 1; }
[ "$(q "select sales from daily_closings where id='$shift'")" = '50.00' ] || { echo 'Late receipt missing from report'; exit 1; }
# Eight simultaneous close replays must all target this same persisted closing.
pids=()
for i in $(seq 1 8); do
  q "select close_cash_session_consistent('$shift','{\"bill_100\":1,\"bill_50\":1}','race');" > "$host/stabilization-replay-$i" & pids+=($!)
done
wait "${pids[@]}"
[ "$(q "select count(*) from daily_closings where id='$shift'")" = 1 ] || exit 1
# Multiple workers partition claims, and leases survive separate DB connections.
q "insert into orders(id,operation_id,customer_name,items,total,status,payment_method,payment_status,created_at) select 'stabilization-job-'||i,gen_random_uuid(),'Isolated','[]',50,'PENDING_PAYMENT','card','PENDING',clock_timestamp()-interval '1 minute' from generate_series(1,8) i;" >/dev/null
pids=()
for i in $(seq 1 4); do q "select claim_point_reconciliation(5);" > "$host/stabilization-job-$i" & pids+=($!); done
wait "${pids[@]}"
python3 - "$host" <<'PY'
import json,pathlib,sys
rows=[row for p in pathlib.Path(sys.argv[1]).glob('stabilization-job-*') for row in json.loads(p.read_text())]
ids=[r['order_id'] for r in rows]
assert len(ids)==len(set(ids)), 'Concurrent workers claimed a live lease twice'
assert len([i for i in ids if i.startswith('stabilization-job-')])==8
PY
echo 'Stabilization: concurrent receipt/close, eight close retries and durable worker leases passed.'
# Inverse race: the close commits first. A card approval waits and is timestamped
# after that cut, even though its transaction started before the close committed.
shift2='a3000000-0000-4000-8000-000000000002'
q "select open_cash_session(jsonb_build_object('id','$shift2','openingAmount',100,'openingDenominations','{\"bill_100\":1}'::jsonb,'openedBy','race','openedAt',clock_timestamp()));
insert into orders(id,operation_id,customer_name,items,total,status,payment_method,payment_status,created_at) values ('stabilization-late-card',gen_random_uuid(),'Isolated','[]',50,'PENDING_PAYMENT','card','PENDING',clock_timestamp()-interval '1 day');" >/dev/null
q "begin; select close_cash_session_consistent('$shift2','{\"bill_100\":1}','race'); select pg_advisory_xact_lock(781235); select pg_sleep(1); commit;" > "$host/stabilization-close-first" &
closer=$!
for i in $(seq 1 100); do
  [ "$(q "select count(*) from pg_locks where locktype='advisory' and objid=781235 and granted")" = 1 ] && break
  sleep 0.01
done
q "select confirm_order_payment('stabilization-late-card','late-card','[{\"ingredientId\":\"coffee_beans\",\"quantity\":1}]');" > "$host/stabilization-late-card" &
payer=$!
wait "$closer" "$payer"
[ "$(q "select count(*) from orders o join cash_sessions s on s.id='$shift2' where o.id='stabilization-late-card' and o.paid_at>s.closed_at and o.paid_cash_session_id is null and o.updated_at>=o.paid_at")" = 1 ] || { echo 'Late card assigned to closed shift'; exit 1; }
[ "$(q "select sales from daily_closings where id='$shift2'")" = '0.00' ] || exit 1
[ "$(q "select count(*) from inventory_movements m join cash_sessions s on s.id='$shift2' where m.order_id='stabilization-late-card' and m.created_at>s.closed_at")" = 1 ] || { echo 'COGS posted before confirmation'; exit 1; }
echo 'Stabilization: late card approval after a close stays outside the closed shift and its COGS window.'
