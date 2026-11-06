-- Durable GET-only reconciliation work queue. Does not send payments or alter orders.
begin;
create table if not exists point_reconciliation_jobs (
  order_id text primary key references orders(id),
  attempts integer not null default 0,
  outcome text not null default 'PENDING_PROVIDER' check(outcome in ('PENDING_PROVIDER','MISSING_REFERENCE','PROVIDER_ERROR','REFERENCE_MISMATCH','AMOUNT_MISMATCH','LOCAL_CONFIRMATION_ERROR','RESOLVED')),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz
);
alter table point_reconciliation_jobs enable row level security;
create index if not exists point_jobs_due_idx on point_reconciliation_jobs(next_attempt_at,lease_until);
create or replace function claim_point_reconciliation(p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  insert into point_reconciliation_jobs(order_id)
    select id from orders where payment_method='card' and coalesce(payment_provider,'MERCADO_PAGO') <> 'STRIPE' and channel <> 'QR_PICKUP'
      and status='PENDING_PAYMENT' and payment_status='PENDING' and created_at <= clock_timestamp()-interval '30 seconds'
    on conflict(order_id) do nothing;
  with due as (
    select j.order_id from point_reconciliation_jobs j join orders o on o.id=j.order_id
    where o.status='PENDING_PAYMENT' and o.payment_status='PENDING' and o.payment_method='card'
      and coalesce(o.payment_provider,'MERCADO_PAGO') <> 'STRIPE' and o.channel <> 'QR_PICKUP'
      and j.next_attempt_at <= clock_timestamp() and (j.lease_until is null or j.lease_until <= clock_timestamp())
    order by j.next_attempt_at,j.order_id limit greatest(0,least(coalesce(p_limit,5),5)) for update of j skip locked
  ), claimed as (
    update point_reconciliation_jobs j set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '180 seconds',last_attempt_at=clock_timestamp()
    from due where j.order_id=due.order_id returning j.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end $$;
create or replace function finish_point_reconciliation(p_order_id text,p_lease_token uuid,p_outcome text,p_delay_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update point_reconciliation_jobs set outcome=p_outcome,lease_token=null,lease_until=null,
    next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(0,least(p_delay_seconds,3600)))
    where order_id=p_order_id and lease_token=p_lease_token;
  return found;
end $$;
revoke all on point_reconciliation_jobs from public;
revoke all on function claim_point_reconciliation(integer) from public;
revoke all on function finish_point_reconciliation(text,uuid,text,integer) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on point_reconciliation_jobs from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on point_reconciliation_jobs from authenticated; end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select on point_reconciliation_jobs to service_role;
    grant execute on function claim_point_reconciliation(integer) to service_role;
    grant execute on function finish_point_reconciliation(text,uuid,text,integer) to service_role;
  end if;
end $$;
create or replace function rofe_schema_version() returns integer language sql stable security invoker set search_path=public as $$ select 11 $$;
commit;
