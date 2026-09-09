-- Run once using the SQL Editor in the chosen Supabase project.
begin;
create table if not exists public.duo_settings (
  id integer primary key check (id = 1),
  names jsonb not null default '["Você", "Seu sócio"]'::jsonb
);
insert into public.duo_settings (id) values (1) on conflict do nothing;
create table if not exists public.duo_entries (
  id bigint generated always as identity primary key,
  type text not null check (type in ('income', 'transfer')),
  person integer not null check (person in (0, 1)),
  amount bigint not null check (amount > 0),
  description text not null check (length(description) <= 120),
  date date not null,
  created timestamptz not null default now()
);
create table if not exists public.duo_login_attempts (
  bucket text primary key,
  attempts integer not null,
  expires timestamptz not null
);
alter table public.duo_settings enable row level security;
alter table public.duo_entries enable row level security;
alter table public.duo_login_attempts enable row level security;
revoke all on public.duo_settings, public.duo_entries, public.duo_login_attempts from anon, authenticated;

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

create or replace function public.duo_login_attempt(p_bucket text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_attempts integer;
begin
  delete from public.duo_login_attempts where expires < now();
  insert into public.duo_login_attempts(bucket,attempts,expires)
    values(p_bucket,1,now()+interval '15 minutes')
    on conflict(bucket) do update set attempts=public.duo_login_attempts.attempts+1
    returning attempts into v_attempts;
  return v_attempts <= 10;
end;
$$;
revoke all on function public.duo_ledger(text,jsonb) from public, anon, authenticated;
revoke all on function public.duo_login_attempt(text) from public, anon, authenticated;
grant execute on function public.duo_ledger(text,jsonb), public.duo_login_attempt(text) to service_role;
grant all on public.duo_settings, public.duo_entries, public.duo_login_attempts to service_role;
grant usage, select on sequence public.duo_entries_id_seq to service_role;
commit;
