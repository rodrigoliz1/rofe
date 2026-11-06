-- Historical fixture created on schema 009 to verify the FIRST additive migration.
insert into cash_sessions(id,opening_amount,opening_denominations,opened_by,opened_at,closed_by,closed_at,expected_cash,counted_cash,difference,closing_denominations)
values('ae000000-0000-4000-8000-000000000001',0,'{}','fixture','2025-01-01T00:00:00Z','fixture','2025-01-01T01:00:00Z',0,0,0,'{}');
insert into orders(id,customer_name,items,total,status,payment_method,payment_status,created_at)
values('stabilization-history-preserved','Historical fixture','[]',20,'PAID','card','APPROVED','2025-01-01T00:30:00Z');
