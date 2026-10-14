-- Installs the reset action; applying this migration does not delete any data.
begin;
create or replace function public.duo_reset()
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize with ledger mutations and incoming Discord payments.
  perform 1 from public.duo_settings where id = 1 for update;
  delete from public.duo_entries;
  delete from public.duo_discord_receipts;
  update public.duo_settings set names = '["Você","Seu sócio"]'::jsonb where id = 1;
  return jsonb_build_object('names',jsonb_build_array('Você','Seu sócio'),'entries','[]'::jsonb);
end;
$$;
revoke all on function public.duo_reset() from public, anon, authenticated;
grant execute on function public.duo_reset() to service_role;
commit;
