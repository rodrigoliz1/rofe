-- Read-only verification, safe to execute after migration 009. No cash operations.
select public.rofe_schema_version() as schema_version;
select p.proname as function_name,
  position('where count <> 0' in lower(pg_get_functiondef(p.oid))) > 0 as filtered_drawer_reset,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('open_cash_session','close_cash_session');
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='cash_sessions';
select 'cash_sessions' as entity, count(*) as total, count(*) filter(where closed_at is null) as open from public.cash_sessions
union all select 'cash_movements',count(*),null from public.cash_movements
union all select 'cash_transactions',count(*),null from public.cash_transactions
union all select 'daily_closures',count(*),null from public.daily_closures
union all select 'daily_closings',count(*),null from public.daily_closings;
