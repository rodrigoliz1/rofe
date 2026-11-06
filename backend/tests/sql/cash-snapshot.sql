-- Fingerprint only: do not expose fixture contents or mutate financial records.
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from cash_sessions s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by denomination)::text,'')) from cash_register s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from cash_movements s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from cash_transactions s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from daily_closures s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from daily_closings s;

select md5(coalesce(jsonb_agg(to_jsonb(s)-'paid_at'-'paid_cash_session_id'-'refunded_at' order by id)::text,'')) from orders s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from raw_inventory s;
select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from inventory_movements s;
