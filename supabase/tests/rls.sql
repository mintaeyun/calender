-- RLS · 제약 · 기본 데이터 검증. 실패하면 예외로 종료한다. 끝에서 rollback 하므로 데이터가 남지 않는다.
-- 실행: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql   (로컬: supabase db reset 후)
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

-- 1) 가입 트리거가 기본 데이터를 만든다 (AUTH-4)
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  assert (select count(*) from public.profiles where user_id = a) = 1, 'profile missing';
  assert (select timezone from public.profiles where user_id = a) = 'Asia/Seoul', 'timezone default';
  assert (select count(*) from public.accounts where user_id = a and name = '현금') = 1, 'default account';
  assert (select count(*) from public.categories where user_id = a and kind = 'expense') = 6, 'expense categories';
  assert (select count(*) from public.categories where user_id = a and kind = 'income') = 3, 'income categories';
  assert (select count(*) from public.calendars where user_id = a) = 3, 'calendars';
  assert (select count(*) from public.todo_projects where user_id = a) = 4, 'projects';
  assert (select count(*) from public.notification_settings where user_id = a) = 1, 'notification settings';
end $$;

-- 2) B의 각 테이블 샘플 행 (슈퍼유저로 삽입)
do $$
declare
  b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  cal uuid; ev uuid; proj uuid; td uuid; tg uuid; acc uuid; acc2 uuid; cat uuid; rec uuid; tx uuid; tok uuid;
begin
  select id into cal from public.calendars where user_id = b limit 1;
  insert into public.events (user_id, calendar_id, title, start_at, end_at)
    values (b, cal, 'B 일정', now(), now() + interval '1 hour') returning id into ev;
  insert into public.event_reminders (user_id, event_id, minutes_before) values (b, ev, 10);
  select id into proj from public.todo_projects where user_id = b limit 1;
  insert into public.todos (user_id, project_id, title) values (b, proj, 'B 할일') returning id into td;
  insert into public.todo_items (user_id, todo_id, text) values (b, td, '항목');
  insert into public.tags (user_id, name) values (b, '태그') returning id into tg;
  insert into public.todo_tags (user_id, todo_id, tag_id) values (b, td, tg);
  select id into acc from public.accounts where user_id = b limit 1;
  insert into public.accounts (user_id, name, type, initial_balance) values (b, '통장', 'bank', 1000) returning id into acc2;
  select id into cat from public.categories where user_id = b and kind = 'expense' limit 1;
  insert into public.recurring_payments (user_id, name, amount, pay_day, category_id, account_id, next_run_date)
    values (b, '구독', 17000, 15, cat, acc, current_date) returning id into rec;
  insert into public.transactions (user_id, amount, type, category_id, account_id, recurring_id)
    values (b, 5000, 'expense', cat, acc, rec) returning id into tx;
  insert into public.receipts (user_id, transaction_id, storage_path) values (b, tx, b || '/' || tx || '/r.jpg');
  insert into public.budgets (user_id, month, category_id, amount) values (b, date_trunc('month', current_date)::date, null, 500000);
  insert into public.notifications (user_id, type, title) values (b, 'todo_due', '알림');
  insert into public.mcp_tokens (user_id, name, token_hash) values (b, 't', 'hash-b') returning id into tok;
  insert into public.mcp_logs (user_id, token_id, tool, status) values (b, tok, 'list_events', 'ok');
  insert into public.sync_logs (user_id, kind) values (b, 'info');
  insert into public.google_connections (user_id, google_email, refresh_token_enc) values (b, 'b@gmail.com', 'ENC');
end $$;

-- 3) A로 접근: B의 행은 읽기·수정·삭제 불가
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

do $$
declare
  b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  t text; n bigint; checked int := 0;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where user_id = $1', t) using b into n;
    assert n = 0, format('RLS leak: A can read B rows in %s', t);

    if t not in ('mcp_logs', 'sync_logs', 'google_connections') then
      execute format('update public.%I set updated_at = now() where user_id = $1', t) using b;
      get diagnostics n = row_count;
      assert n = 0, format('RLS leak: A updated B rows in %s', t);
    end if;

    execute format('delete from public.%I where user_id = $1', t) using b;
    get diagnostics n = row_count;
    assert n = 0, format('RLS leak: A deleted B rows in %s', t);
    checked := checked + 1;
  end loop;
  assert checked >= 20, format('too few tables checked: %s', checked);
end $$;

-- A가 B의 user_id로 삽입 불가
do $$
begin
  begin
    insert into public.todos (user_id, title) values ('bbbbbbbb-0000-0000-0000-000000000002', 'x');
    raise exception 'insert as other user should fail';
  exception when insufficient_privilege then null; -- RLS with check 위반
  end;
end $$;

-- A가 B의 부모를 참조하는 자식 삽입 불가 (복합 FK)
reset role;
create temp table _b_refs as
  select (select id from public.todo_projects where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' limit 1) as proj,
         (select id from public.categories where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' limit 1) as cat;
grant select on _b_refs to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

do $$
declare bproj uuid; bcat uuid;
begin
  select proj, cat into bproj, bcat from _b_refs;
  begin
    insert into public.todos (user_id, project_id, title)
      values ('aaaaaaaa-0000-0000-0000-000000000001', bproj, 'x');
    raise exception 'cross-user project reference should fail';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.transactions (user_id, amount, type, category_id, account_id)
      select 'aaaaaaaa-0000-0000-0000-000000000001', 100, 'expense', bcat, id
      from public.accounts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1;
    raise exception 'cross-user category reference should fail';
  exception when foreign_key_violation then null;
  end;
end $$;

-- 구글 refresh token 컬럼은 클라이언트가 읽을 수 없다 / 로그는 클라이언트가 쓸 수 없다
do $$
begin
  begin
    perform refresh_token_enc from public.google_connections;
    raise exception 'refresh_token_enc must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.mcp_logs (user_id, tool, status)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'ok');
    raise exception 'client must not write mcp_logs';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.weather_cache (location_key, payload) values ('x', '{}');
    raise exception 'client must not write weather_cache';
  exception when insufficient_privilege then null;
  end;
  perform 1 from public.weather_cache; -- 읽기는 가능
end $$;

-- 4) 데이터 규칙 제약 + 잔액 뷰 (A로 계속)
do $$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  cash uuid; bank uuid; cat uuid; bal bigint; tx uuid; i int;
begin
  select id into cash from public.accounts where user_id = a and name = '현금';
  insert into public.accounts (user_id, name, type, initial_balance) values (a, '은행', 'bank', 100000) returning id into bank;
  select id into cat from public.categories where user_id = a and name = '식비';

  begin insert into public.transactions (user_id, amount, type, category_id, account_id) values (a, -1, 'expense', cat, cash);
    raise exception 'negative amount should fail'; exception when check_violation then null; end;
  begin insert into public.transactions (user_id, amount, type, account_id) values (a, 0, 'expense', cash);
    raise exception 'zero amount should fail'; exception when check_violation then null; end;
  begin insert into public.transactions (user_id, amount, type, account_id) values (a, 10, 'transfer', cash);
    raise exception 'transfer without to_account should fail'; exception when check_violation then null; end;
  begin insert into public.transactions (user_id, amount, type, account_id, to_account_id) values (a, 10, 'transfer', cash, cash);
    raise exception 'transfer to same account should fail'; exception when check_violation then null; end;
  begin insert into public.transactions (user_id, amount, type, account_id, to_account_id) values (a, 10, 'expense', cash, bank);
    raise exception 'expense with to_account should fail'; exception when check_violation then null; end;

  insert into public.transactions (user_id, amount, type, category_id, account_id) values (a, 30000, 'expense', cat, bank);
  insert into public.transactions (user_id, amount, type, account_id) values (a, 500000, 'income', bank);
  insert into public.transactions (user_id, amount, type, account_id, to_account_id) values (a, 70000, 'transfer', bank, cash);

  select balance into bal from public.account_balances where account_id = bank;
  assert bal = 100000 - 30000 + 500000 - 70000, format('bank balance wrong: %s', bal);
  select balance into bal from public.account_balances where account_id = cash;
  assert bal = 70000, format('cash balance wrong: %s', bal);
  -- 뷰는 RLS를 따른다: 다른 사용자 계좌는 보이지 않는다
  assert (select count(*) from public.account_balances where user_id <> a) = 0, 'view leaks other users';

  -- 영수증 최대 3장
  select id into tx from public.transactions where user_id = a limit 1;
  for i in 1..3 loop
    insert into public.receipts (user_id, transaction_id, storage_path) values (a, tx, a || '/r' || i);
  end loop;
  begin insert into public.receipts (user_id, transaction_id, storage_path) values (a, tx, a || '/r4');
    raise exception 'fourth receipt should fail'; exception when check_violation then null; end;
end $$;

-- 5) 허용 이메일: 목록이 있으면 목록 밖 이메일 가입 차단
reset role;
insert into public.allowed_emails (email) values ('a@example.com');
do $$
begin
  begin
    insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@example.com');
    raise exception 'signup should be blocked';
  exception when insufficient_privilege then null;
  end;
  insert into auth.users (id, email) values (gen_random_uuid(), 'A@Example.com'); -- 대소문자 무시
end $$;

rollback;
select 'RLS tests passed' as result;
