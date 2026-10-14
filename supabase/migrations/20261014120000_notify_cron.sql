-- 05 notify: pg_cron 이 5분마다 Edge Function `notify` 를 호출한다.
-- 사전 준비(사용자): Vault 에 두 비밀값을 넣어야 동작한다. 값은 코드·커밋에 두지 않는다.
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');
-- 비밀값이 없으면 함수는 아무것도 하지 않고 NOTICE 만 남긴다.
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'invoke_notify: vault secrets (project_url, service_role_key) are not set';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke all on function public.invoke_notify() from public, anon, authenticated;

-- UTC 기준 5분마다. 사용자 시간대 판정(09:00, 20:00, 방해금지)은 함수 안에서 한다.
select cron.schedule('notify-scan', '*/5 * * * *', $$select public.invoke_notify()$$);
