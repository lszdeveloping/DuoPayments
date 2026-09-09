-- Transactional verification: no test records remain in the store.
begin;
do $$
declare v_state jsonb; v_balance bigint;
begin
  if exists (select 1 from public.duo_entries) then
    raise exception 'Verification requires a new empty ledger';
  end if;
  perform public.duo_ledger('income','{"person":0,"amount":10000,"description":"Verification A","date":"2026-09-09"}');
  perform public.duo_ledger('income','{"person":1,"amount":8000,"description":"Verification B","date":"2026-09-09"}');
  v_state := public.duo_ledger('settle','{"balance":2000}');
  if not (v_state ? 'error') then raise exception 'Stale settlement was accepted'; end if;
  v_state := public.duo_ledger('settle','{"balance":400}');
  if jsonb_array_length(v_state->'entries') <> 3 then raise exception 'Settlement missing'; end if;
  select sum((case when person=0 then 1 else -1 end) * (case when type='income' then round(amount::numeric/5)::bigint else -amount end))
    into v_balance from public.duo_entries;
  if v_balance <> 0 then raise exception 'Balance was not settled'; end if;
  if has_function_privilege('anon','public.duo_ledger(text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.duo_ledger(text,jsonb)','EXECUTE')
    or has_table_privilege('anon','public.duo_entries','SELECT') then
    raise exception 'Public access must be denied';
  end if;
end;
$$;
rollback;
