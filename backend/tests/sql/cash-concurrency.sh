#!/usr/bin/env bash
# Disposable test cluster only; concurrent requests must commit once.
set -euo pipefail
host="$1"; db="$2"
q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$host" -d "$db" -c "$1"; }
session_id='94000000-0000-4000-8000-000000000001'
pids=()
for i in $(seq 1 8); do
  q "select open_cash_session('{\"id\":\"$session_id\",\"openingAmount\":100,\"openingDenominations\":{\"bill_100\":1},\"openedBy\":\"cash-race\",\"openedAt\":\"2026-11-05T10:00:00Z\"}');" > "$host/cash-open-$i" &
  pids+=($!)
done
wait "${pids[@]}"
[ "$(cat "$host"/cash-open-* | grep -c '^t$')" = 1 ] || { echo 'opening race did not commit exactly once'; exit 1; }
[ "$(q "select count(*) from cash_sessions where closed_at is null")" = 1 ] || exit 1
pids=()
for i in $(seq 1 8); do
  q "select close_cash_session_with_closing('$session_id', '{\"expectedCash\":100,\"countedCash\":100,\"difference\":0,\"closingDenominations\":{\"bill_100\":1},\"closedBy\":\"cash-race\",\"closedAt\":\"2026-11-05T11:00:00Z\"}', '{\"id\":\"95000000-0000-4000-8000-000000000001\",\"closed_at\":\"2026-11-05T11:00:00Z\",\"period_start\":\"2026-11-05T10:00:00Z\",\"period_end\":\"2026-11-05T11:00:00Z\",\"total_sales\":0,\"total_income\":0,\"total_costs\":0,\"net_profit\":0,\"cash_start\":100,\"cash_end\":100,\"cash_sales\":0,\"card_sales\":0,\"refunds\":0,\"discounts\":0,\"cost_of_goods\":0,\"expenses\":0,\"gross_margin\":0,\"operating_result\":0,\"expected_cash\":100,\"counted_cash\":100,\"difference\":0,\"tickets\":0,\"closed_by\":\"cash-race\"}');" > "$host/cash-close-$i" &
  pids+=($!)
done
wait "${pids[@]}"
[ "$(cat "$host"/cash-close-* | grep -c '^t$')" = 1 ] || { echo 'closing race did not commit exactly once'; exit 1; }
[ "$(q "select count(*) from daily_closings where id='95000000-0000-4000-8000-000000000001'")" = 1 ] || exit 1
[ "$(q "select count(*) from cash_sessions where closed_at is null")" = 0 ] || exit 1
echo 'PostgreSQL concurrent cash opening/closing: exactly one winner each.'
