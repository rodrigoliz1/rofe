\set ON_ERROR_STOP on
-- Disposable fixture only. Run with pg-safeupdate active to reproduce PostgREST.
begin;
insert into cash_register(denomination,count) values ('bill_100',3),('bill_50',0)
on conflict(denomination) do update set count=excluded.count;
do $$
declare
  session jsonb := '{"id":"91000000-0000-4000-8000-000000000001","openingAmount":200,"openingDenominations":{"bill_100":2},"openedBy":"cash-regression","openedAt":"2026-11-05T08:00:00Z"}';
  movement jsonb := '{"operationId":"92000000-0000-4000-8000-000000000001","type":"manual_income","amount":50,"description":"Isolated regression","denominations":{"bill_50":1},"createdBy":"cash-regression"}';
  closing jsonb := '{"expectedCash":250,"countedCash":250,"difference":0,"closingDenominations":{"bill_100":2,"bill_50":1},"closedBy":"cash-regression","closedAt":"2026-11-05T09:00:00Z"}';
  report jsonb := '{"id":"93000000-0000-4000-8000-000000000001","closed_at":"2026-11-05T09:00:00Z","period_start":"2026-11-05T08:00:00Z","period_end":"2026-11-05T09:00:00Z","total_sales":0,"total_income":50,"total_costs":0,"net_profit":0,"cash_start":200,"cash_end":250,"cash_sales":0,"card_sales":0,"refunds":0,"discounts":0,"cost_of_goods":0,"expenses":0,"gross_margin":0,"operating_result":0,"expected_cash":250,"counted_cash":250,"difference":0,"tickets":0,"closed_by":"cash-regression"}';
  drawer_before jsonb;
begin
  if rofe_schema_version() <> 9 then raise exception 'cash migration missing'; end if;
  if not open_cash_session(session) then raise exception 'opening failed'; end if;
  if open_cash_session(session) then raise exception 'opening replay duplicated'; end if;
  if open_cash_session(jsonb_set(session,'{id}','"91000000-0000-4000-8000-000000000002"')) then raise exception 'second simultaneous session allowed'; end if;
  if (select count(*) from cash_sessions where closed_at is null) <> 1 then raise exception 'duplicate session'; end if;
  if not record_cash_movement(movement) then raise exception 'movement failed'; end if;
  if record_cash_movement(movement) then raise exception 'movement replay duplicated'; end if;
  if (select count(*) from cash_transactions where operation_id=(movement->>'operationId')::uuid) <> 1 then raise exception 'ledger duplicated'; end if;
  if (select count(*) from cash_movements where operation_id=(movement->>'operationId')::uuid) <> 1 then raise exception 'movement duplicated'; end if;
  select jsonb_object_agg(denomination,count) into drawer_before from cash_register;
  -- Failure inserting the consolidated report must roll back session + drawer + legacy report.
  begin
    perform close_cash_session_with_closing(session->>'id',jsonb_set(closing,'{closingDenominations}','{"bill_50":5}'),report-'tickets');
    raise exception 'invalid closing unexpectedly committed';
  exception when not_null_violation then null; end;
  if exists(select 1 from cash_sessions where id=(session->>'id')::uuid and closed_at is not null) then raise exception 'partial close'; end if;
  if (select jsonb_object_agg(denomination,count) from cash_register) <> drawer_before then raise exception 'failed close mutated drawer'; end if;
  if exists(select 1 from daily_closures where id=(report->>'id')::uuid) then raise exception 'partial legacy report'; end if;
  if not close_cash_session_with_closing(session->>'id',closing,report) then raise exception 'closing failed'; end if;
  if close_cash_session_with_closing(session->>'id',closing,report) then raise exception 'closing replay duplicated'; end if;
  if (select count(*) from daily_closures where id=(report->>'id')::uuid) <> 1 or (select count(*) from daily_closings where id=(report->>'id')::uuid) <> 1 then raise exception 'reports not exactly once'; end if;
  if (select difference from cash_sessions where id=(session->>'id')::uuid) <> 0 then raise exception 'incorrect difference'; end if;
  if open_cash_session(session) then raise exception 'closed operation resurrected'; end if;
  session := jsonb_set(session,'{id}','"91000000-0000-4000-8000-000000000002"');
  session := jsonb_set(session,'{openingDenominations}','{"bill_100":1}');
  session := jsonb_set(session,'{openingAmount}','100');
  if not open_cash_session(session) then raise exception 'next shift failed'; end if;
  if (select count from cash_register where denomination='bill_50') <> 0 or (select count from cash_register where denomination='bill_100') <> 1 then raise exception 'denominations carried over'; end if;
  raise notice 'Cash opening, movement, closing, replays and atomic rollback verified';
end $$;
rollback;
