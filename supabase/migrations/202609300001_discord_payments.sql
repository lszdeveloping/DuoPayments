-- Apply after 202609130001_service_referrals.sql.
begin;
-- Private payments never enter the shared ledger or its totals.
create table if not exists public.duo_discord_receipts (
  message_id text primary key,
  payload jsonb not null,
  created timestamptz not null default now()
);
alter table public.duo_discord_receipts enable row level security;
revoke all on public.duo_discord_receipts from public, anon, authenticated;
grant all on public.duo_discord_receipts to service_role;
create or replace function public.duo_discord_payment(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.duo_discord_receipts%rowtype;
begin
  perform 1 from public.duo_settings where id = 1 for update;
  select * into v_existing from public.duo_discord_receipts where message_id = p_input->>'messageId';
  if found then
    if (v_existing.payload - 'confirmedBy' - 'date') <> (p_input - 'confirmedBy' - 'date') then
      return jsonb_build_object('error','Este ticket já foi registrado com outros dados. Confira o lançamento no site.');
    end if;
    return jsonb_build_object('id',v_existing.message_id,'duplicate',true);
  end if;
  if (p_input->>'amount')::bigint not between 1 and 100000000 then raise exception 'Invalid amount'; end if;
  insert into public.duo_discord_receipts(message_id,payload) values(p_input->>'messageId',p_input);
  return jsonb_build_object('id',p_input->>'messageId','duplicate',false);
end;
$$;
revoke all on function public.duo_discord_payment(jsonb) from public, anon, authenticated;
grant execute on function public.duo_discord_payment(jsonb) to service_role;
create or replace function public.duo_discord_list()
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('payments',coalesce((select jsonb_agg(jsonb_build_object('id',message_id,'created',created,'payment',payload) order by created desc) from public.duo_discord_receipts),'[]'::jsonb));
$$;
revoke all on function public.duo_discord_list() from public, anon, authenticated;
grant execute on function public.duo_discord_list() to service_role;
commit;
