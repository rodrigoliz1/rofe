\set ON_ERROR_STOP on
begin;
do $$
declare
  shift text := 'a1000000-0000-4000-8000-000000000001';
  next_shift text := 'a1000000-0000-4000-8000-000000000002';
  closed jsonb;
  jobs jsonb;
  token uuid;
  opening timestamptz := clock_timestamp()-interval '1 minute';
begin
  if rofe_schema_version() <> 11 then raise exception 'stabilization migrations missing'; end if;
  if not open_cash_session(jsonb_build_object('id',shift,'openingAmount',100,'openingDenominations','{"bill_50":2}'::jsonb,'openedBy','stabilization','openedAt',opening)) then raise exception 'fixture shift failed'; end if;
  insert into orders(id,operation_id,customer_name,items,total,status,payment_method,payment_status,created_at)
    values('stabilization-late',gen_random_uuid(),'Isolated','[]',50,'PENDING_PAYMENT','cash','PENDING',clock_timestamp()-interval '2 days');
  if not confirm_cash_payment('stabilization-late','isolated','[]',100,50,'{"bill_100":1}','{"bill_50":1}') then raise exception 'fixture receipt failed'; end if;
  closed := close_cash_session_consistent(shift,'{"bill_100":1,"bill_50":1}','stabilization');
  if (closed->>'expected_cash')::numeric <> 150 or (closed->>'difference')::numeric <> 0 then raise exception 'stale expected cash'; end if;
  if (select sales from daily_closings where id=shift::uuid) <> 50 then raise exception 'late receipt not attributed at confirmation'; end if;
  if (select paid_cash_session_id from orders where id='stabilization-late') <> shift::uuid then raise exception 'wrong receipt shift'; end if;
  if (select count(*) from cash_transactions where cash_session_id=shift::uuid and type in ('payment','change')) <> 2 then raise exception 'unlinked change'; end if;
  perform open_cash_session(jsonb_build_object('id',next_shift,'openingAmount',150,'openingDenominations','{"bill_100":1,"bill_50":1}'::jsonb,'openedBy','stabilization','openedAt',clock_timestamp()));
  perform close_cash_session_consistent(shift,'{"bill_100":1,"bill_50":1}','stabilization');
  if not exists(select 1 from cash_sessions where id=next_shift::uuid and closed_at is null) then raise exception 'replay closed new shift'; end if;
  begin
    perform close_cash_session_consistent(shift,'{"bill_50":3}','stabilization');
    raise exception 'conflicting close unexpectedly accepted';
  exception when raise_exception then if sqlerrm <> 'cash_close_conflict' then raise; end if; end;
  perform apply_order_refund('stabilization-late','a2000000-0000-4000-8000-000000000001','Isolated refund','stabilization','{"bill_50":1}');
  closed := close_cash_session_consistent(next_shift,'{"bill_100":1}','stabilization');
  if (closed->>'expected_cash')::numeric <> 100 then raise exception 'refund cash not linked'; end if;
  if (select sales from daily_closings where id=next_shift::uuid) <> -50 then raise exception 'refund attributed to original creation period'; end if;

  insert into orders(id,operation_id,customer_name,items,total,status,payment_method,payment_status,created_at)
    values('stabilization-point',gen_random_uuid(),'Isolated','[]',50,'PENDING_PAYMENT','card','PENDING',clock_timestamp()-interval '2 minutes');
  jobs := claim_point_reconciliation(5);
  select (value->>'lease_token')::uuid into token from jsonb_array_elements(jobs) where value->>'order_id'='stabilization-point';
  if token is null then raise exception 'worker did not claim pending order'; end if;
  if exists(select 1 from jsonb_array_elements(claim_point_reconciliation(5)) where value->>'order_id'='stabilization-point') then raise exception 'active lease claimed twice'; end if;
  if finish_point_reconciliation('stabilization-point',gen_random_uuid(),'RESOLVED',0) then raise exception 'unfenced worker update'; end if;
  if not finish_point_reconciliation('stabilization-point',token,'MISSING_REFERENCE',60) then raise exception 'lease finish failed'; end if;
  if (select payment_status from orders where id='stabilization-point') <> 'PENDING' then raise exception 'worker changed payment without provider confirmation'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='claim_point_reconciliation(integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public worker access'; end if;
end $$;
rollback;
