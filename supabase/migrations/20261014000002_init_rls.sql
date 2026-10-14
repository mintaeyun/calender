-- RLS · 권한 · 스토리지. 모든 사용자 데이터는 user_id = auth.uid() 로만 접근한다.
-- (Edge Function은 service role로 RLS를 우회하므로 쿼리에 user_id 조건을 직접 넣어야 한다.)

-- 비로그인(anon)은 어떤 테이블에도 접근하지 못한다.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- 일반 테이블: 본인 행만 select/insert/update/delete
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','calendars','events','event_reminders','todo_projects','todos','todo_items',
    'tags','todo_tags','accounts','categories','recurring_payments','transactions','receipts',
    'budgets','notifications','notification_settings','mcp_tokens'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 읽기·삭제만 허용 (쓰기는 서버(service role)가 한다): 로그
-- ---------------------------------------------------------------------------
alter table public.mcp_logs enable row level security;
create policy mcp_logs_select_own on public.mcp_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy mcp_logs_delete_own on public.mcp_logs for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update on public.mcp_logs from authenticated;

alter table public.sync_logs enable row level security;
create policy sync_logs_select_own on public.sync_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_logs_delete_own on public.sync_logs for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update on public.sync_logs from authenticated;

-- ---------------------------------------------------------------------------
-- google_connections: 암호화된 refresh token 컬럼은 클라이언트가 읽을 수 없다.
-- 연결 생성/토큰 갱신은 Edge Function(service role)만 한다.
-- ---------------------------------------------------------------------------
alter table public.google_connections enable row level security;
create policy google_connections_select_own on public.google_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy google_connections_update_own on public.google_connections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy google_connections_delete_own on public.google_connections for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.google_connections from authenticated;
grant select (id, user_id, google_email, sync_direction, sync_token_by_calendar,
              last_synced_at, last_error, created_at, updated_at)
  on public.google_connections to authenticated;
grant update (sync_direction) on public.google_connections to authenticated;
grant delete on public.google_connections to authenticated;

-- ---------------------------------------------------------------------------
-- weather_cache: 로그인 사용자는 읽기만, 쓰기는 service role만
-- ---------------------------------------------------------------------------
alter table public.weather_cache enable row level security;
create policy weather_cache_select_auth on public.weather_cache for select to authenticated using (true);
revoke insert, update, delete on public.weather_cache from authenticated;

-- ---------------------------------------------------------------------------
-- allowed_emails: 정책 없음 = 클라이언트 접근 불가 (SQL 편집기/service role로만 관리)
-- ---------------------------------------------------------------------------
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from authenticated;

-- ---------------------------------------------------------------------------
-- 영수증 스토리지 버킷 (비공개). 경로 규칙: <user_id>/<transaction_id>/<파일명>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_select_own on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_update_own on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
