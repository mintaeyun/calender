-- 07 gcal-sync: 구글 캘린더 동기화에 필요한 컬럼과 주기 호출(pg_cron).
-- 적용 전 사용자 승인 필요(원격 DB 변경).

-- 동기화 락: 같은 사용자의 동기화가 겹쳐 실행되지 않게 한다(만료 시각까지 유효).
alter table public.google_connections add column if not exists sync_lock_until timestamptz;

-- 전체 재동기화(410)·재개 가능한 가져오기에서 "이번 실행에서 확인된 구글 일정"을 표시한다.
-- 전체 재동기화가 끝난 뒤 google_synced_at 이 시작 시각보다 오래된 구글 일정은 구글에서 사라진 것으로 보고 소프트 삭제한다.
alter table public.events add column if not exists google_synced_at timestamptz;
create index if not exists events_google_synced_idx
  on public.events (user_id, calendar_id, google_synced_at) where google_event_id is not null;

-- 구글 캘린더의 접근 역할(owner/writer/reader/freeBusyReader)과 읽기 전용 여부(공휴일 등)
alter table public.calendars add column if not exists google_access_role text;
alter table public.calendars add column if not exists read_only boolean not null default false;

-- 15분마다 sync-all 호출. notify 와 같은 Vault 비밀값(project_url, service_role_key)을 쓴다. 없으면 NOTICE 만 남기고 종료.
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_gcal_sync()
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
    raise notice 'invoke_gcal_sync: vault secrets (project_url, service_role_key) are not set';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/gcal-sync/sync-all',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.invoke_gcal_sync() from public, anon, authenticated;

select cron.schedule('gcal-sync-all', '*/15 * * * *', $$select public.invoke_gcal_sync()$$);
