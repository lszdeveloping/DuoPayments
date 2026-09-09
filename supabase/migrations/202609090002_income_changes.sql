-- Apply after 202609090001_duo.sql. Existing entries are preserved.
begin;
create or replace function public.duo_ledger(p_action text, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_names jsonb;
  v_balance bigint;
  v_rows jsonb;
begin
  -- All mutations share one row lock, so two requests cannot settle the same balance.
  select names into v_names from public.duo_settings where id = 1 for update;
  if p_action = 'income' then
    if (p_input->>'amount')::bigint > 100000000 then raise exception 'Invalid amount'; end if;
    insert into public.duo_entries(type,person,amount,description,date)
    values ('income',(p_input->>'person')::integer,(p_input->>'amount')::bigint,
      coalesce(nullif(trim(p_input->>'description'),''),'Recebimento'),(p_input->>'date')::date);
  elsif p_action in ('income-edit', 'income-delete') then
    if not exists (
      select 1 from public.duo_entries e where e.id = (p_input->>'id')::bigint and e.type = 'income'
        and e.person = (p_input->'expected'->>'person')::integer
        and e.amount = (p_input->'expected'->>'amount')::bigint
        and e.description = p_input->'expected'->>'description'
        and e.date = (p_input->'expected'->>'date')::date
    ) then
      return jsonb_build_object('error','Este recebimento foi alterado ou excluído. Atualize a página e tente novamente.');
    end if;
    if p_action = 'income-delete' then
      delete from public.duo_entries where id = (p_input->>'id')::bigint and type = 'income';
    else
      if (p_input->>'amount')::bigint > 100000000 then raise exception 'Invalid amount'; end if;
      update public.duo_entries set person = (p_input->>'person')::integer,
        amount = (p_input->>'amount')::bigint,
        description = coalesce(nullif(trim(p_input->>'description'),''),'Recebimento'),
        date = (p_input->>'date')::date
      where id = (p_input->>'id')::bigint and type = 'income';
    end if;
  elsif p_action = 'settle' then
    select coalesce(sum((case when person = 0 then 1 else -1 end) *
      (case when type = 'income' then round(amount::numeric / 5)::bigint else -amount end)),0)
      into v_balance from public.duo_entries;
    if v_balance = 0 or v_balance <> (p_input->>'balance')::bigint then
      return jsonb_build_object('error','O saldo mudou. Atualize a página antes de confirmar o repasse.');
    end if;
    insert into public.duo_entries(type,person,amount,description,date)
    values ('transfer',case when v_balance > 0 then 0 else 1 end,abs(v_balance),'Acerto de saldo',
      (now() at time zone 'America/Sao_Paulo')::date);
  elsif p_action = 'settings' then
    v_names := p_input->'names';
    if jsonb_typeof(v_names) <> 'array' or jsonb_array_length(v_names) <> 2 then raise exception 'Invalid names'; end if;
    update public.duo_settings set names = v_names where id = 1;
  elsif p_action <> 'state' then
    raise exception 'Invalid action';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]'::jsonb) into v_rows from public.duo_entries e;
  return jsonb_build_object('names',v_names,'entries',v_rows);
end;
$$;

revoke all on function public.duo_ledger(text,jsonb) from public, anon, authenticated;
grant execute on function public.duo_ledger(text,jsonb) to service_role;
commit;
