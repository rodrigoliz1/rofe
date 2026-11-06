-- Fix cash session opening/closing under Supabase/PostgREST pg-safeupdate.
-- DDL only: applying this file never changes balances, sessions or historical rows.
-- Preserve transaction boundaries, row locking, unique indexes and existing ACLs.
begin;

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
  update cash_register set count = 0 where count <> 0;
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
  update cash_register set count = 0 where count <> 0;
  for denomination_entry in select key, value from jsonb_each_text(p_close->'closingDenominations') loop
    insert into cash_register (denomination, count) values (denomination_entry.key, denomination_entry.value::integer)
    on conflict (denomination) do update set count = excluded.count;
  end loop;
  return true;
end;
$$;

revoke all on function open_cash_session(jsonb) from public;
revoke all on function close_cash_session(text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function open_cash_session(jsonb) to service_role;
    grant execute on function close_cash_session(text, jsonb) to service_role;
  end if;
end $$;

create or replace function rofe_schema_version() returns integer
language sql stable security invoker set search_path = public as $$ select 9 $$;
revoke all on function rofe_schema_version() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rofe_schema_version() to service_role;
  end if;
end $$;
commit;
