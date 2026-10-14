-- 가입 트리거(AUTH-4), 허용 이메일(AUTH-5), 계정 삭제(AUTH-3), 소프트 삭제 정리(pg_cron)

-- ---------------------------------------------------------------------------
-- 허용 이메일: allowed_emails가 비어 있으면 누구나 가입, 행이 있으면 목록의 이메일만 가입
-- ---------------------------------------------------------------------------
create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.allowed_emails)
     and not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'signup not allowed for this email' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_check_allowed
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

-- ---------------------------------------------------------------------------
-- 가입 시 기본 데이터 생성
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  );

  insert into public.notification_settings (user_id) values (new.id);

  insert into public.accounts (user_id, name, type, initial_balance)
  values (new.id, '현금', 'cash', 0);

  insert into public.categories (user_id, name, kind, color) values
    (new.id, '주거', 'expense', 'oklch(0.55 0.22 290)'),
    (new.id, '식비', 'expense', 'oklch(0.68 0.17 290)'),
    (new.id, '쇼핑', 'expense', 'oklch(0.9 0.19 125)'),
    (new.id, '교통', 'expense', 'oklch(0.7 0.12 230)'),
    (new.id, '문화', 'expense', 'oklch(0.45 0.14 290)'),
    (new.id, '기타', 'expense', '#55555c'),
    (new.id, '급여', 'income', '#d6d6da'),
    (new.id, '부수입', 'income', 'oklch(0.9 0.19 125)'),
    (new.id, '이자', 'income', 'oklch(0.7 0.12 230)');

  insert into public.calendars (user_id, name, color, source) values
    (new.id, '업무', 'oklch(0.55 0.22 290)', 'local'),
    (new.id, '개인', '#34343a', 'local'),
    (new.id, '운동', 'oklch(0.7 0.12 230)', 'local');

  insert into public.todo_projects (user_id, name, color) values
    (new.id, '업무', 'oklch(0.55 0.22 290)'),
    (new.id, '생활', '#8d8d94'),
    (new.id, '여행', 'oklch(0.9 0.19 125)'),
    (new.id, '운동', 'oklch(0.7 0.12 230)');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 계정 삭제 (AUTH-3): 모든 데이터는 auth.users 삭제에 on delete cascade 로 함께 지워진다.
-- 영수증 파일(Storage)과 구글 토큰 revoke 는 호출 전에 앱/Edge Function 이 처리해야 한다.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 소프트 삭제 정리: 30일 지난 일정·할일 영구 삭제 (매일 03:00 UTC = 12:00 KST)
-- ---------------------------------------------------------------------------
create or replace function public.purge_soft_deleted()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.events where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.todos where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

revoke all on function public.purge_soft_deleted() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule('purge-soft-deleted', '0 3 * * *', $$select public.purge_soft_deleted()$$);
