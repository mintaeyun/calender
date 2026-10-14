-- 라이프 매니저 초기 스키마 (PRD §5). 이후 변경은 새 마이그레이션 파일로만 추가한다.
-- 규칙: 모든 테이블에 user_id, 시간은 timestamptz(UTC), 마감일·거래일은 date, 금액은 정수 원.
-- 자식 테이블은 (부모id, user_id) 복합 FK로 "부모와 같은 사용자"를 DB 수준에서 강제한다.

-- ---------------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (auth.users 1:1)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Seoul',
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  week_start text not null default 'monday' check (week_start in ('monday', 'sunday')),
  start_screen text not null default 'dashboard'
    check (start_screen in ('dashboard', 'calendar', 'todos', 'ledger')),
  weather_location jsonb,                       -- { "name": "서울", "lat": 37.56, "lon": 126.97 }
  temp_unit text not null default 'C' check (temp_unit in ('C', 'F')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 일정
-- ---------------------------------------------------------------------------
create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#8d8d94',
  source text not null default 'local' check (source in ('local', 'google')),
  google_calendar_id text,
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index calendars_google_uq on public.calendars (user_id, google_calendar_id)
  where google_calendar_id is not null;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id uuid,
  title text not null check (length(btrim(title)) > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  color text,
  rrule text,                                   -- RFC 5545 (DTSTART는 start_at)
  -- 반복 예외 (PRD §5에 없는 추가 결정, REQUESTS.md 결정 기록 참고)
  recurring_event_id uuid,                      -- 예외 인스턴스가 가리키는 원본 일정
  original_start_at timestamptz,                -- 예외 인스턴스가 대체하는 원래 발생 시각
  exdates timestamptz[] not null default '{}',  -- 원본에서 제외할 발생 시각
  -- 구글 매핑
  google_event_id text,
  google_etag text,
  google_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_range_chk check (end_at >= start_at),
  constraint events_exception_chk check (
    (recurring_event_id is null and original_start_at is null)
    or (recurring_event_id is not null and original_start_at is not null)
  ),
  unique (id, user_id),
  foreign key (calendar_id, user_id) references public.calendars (id, user_id)
    on delete set null (calendar_id),
  foreign key (recurring_event_id, user_id) references public.events (id, user_id)
    on delete cascade
);
create index events_user_start_idx on public.events (user_id, start_at) where deleted_at is null;
create index events_user_deleted_idx on public.events (user_id, deleted_at) where deleted_at is not null;
create index events_recurring_idx on public.events (recurring_event_id) where recurring_event_id is not null;
create unique index events_google_uq on public.events (user_id, calendar_id, google_event_id)
  where google_event_id is not null;

create table public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null,
  minutes_before integer not null check (minutes_before >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, minutes_before),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 구글 연동
-- ---------------------------------------------------------------------------
create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,              -- AES-256 암호화. 클라이언트 SELECT 권한 없음(rls 마이그레이션 참고)
  sync_direction text not null default 'import_only' check (sync_direction in ('import_only', 'two_way')),
  sync_token_by_calendar jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 동기화 충돌·덮어쓰기 로그 (GCAL-7, PRD §5에 없는 추가 테이블)
create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  kind text not null check (kind in ('conflict', 'error', 'info')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sync_logs_user_idx on public.sync_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 할일
-- ---------------------------------------------------------------------------
create table public.todo_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#8d8d94',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  due_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  completed_at timestamptz,
  recurrence_rule text,
  position double precision not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references public.todo_projects (id, user_id)
    on delete set null (project_id)
);
create index todos_user_due_idx on public.todos (user_id, due_date) where deleted_at is null;
create index todos_user_status_idx on public.todos (user_id, status) where deleted_at is null;
create index todos_user_deleted_idx on public.todos (user_id, deleted_at) where deleted_at is not null;

create table public.todo_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  todo_id uuid not null,
  text text not null,
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (todo_id, user_id) references public.todos (id, user_id) on delete cascade
);
create index todo_items_todo_idx on public.todo_items (todo_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#8d8d94',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

-- N:M 연결 테이블이라 별도 id 없이 (todo_id, tag_id)를 기본키로 쓴다.
create table public.todo_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  todo_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (todo_id, tag_id),
  foreign key (todo_id, user_id) references public.todos (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 가계부 (금액: 정수 원, 양수. 부호는 type이 결정)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null default 'cash' check (type in ('cash', 'bank', 'card')),
  initial_balance bigint not null default 0,    -- 카드 부채 등을 위해 음수 허용(거래 금액과 다름)
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#55555c',
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name)
);

create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount bigint not null check (amount > 0),
  cycle text not null default 'monthly' check (cycle in ('monthly', 'yearly')),
  pay_day smallint not null check (pay_day between 1 and 31),
  pay_month smallint check (pay_month between 1 and 12),  -- yearly일 때만 사용
  category_id uuid,
  account_id uuid not null,
  next_run_date date not null,
  last_run_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);
create index recurring_payments_next_idx on public.recurring_payments (next_run_date) where active;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null default current_date,
  amount bigint not null check (amount > 0),
  type text not null check (type in ('income', 'expense', 'transfer')),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  memo text,
  recurring_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint transactions_transfer_chk check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null)
  ),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (recurring_id, user_id) references public.recurring_payments (id, user_id)
    on delete set null (recurring_id)
);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_category_idx on public.transactions (category_id);
-- 고정지출 자동 생성의 중복 방지(같은 고정지출·같은 날 1건)
create unique index transactions_recurring_day_uq on public.transactions (recurring_id, date)
  where recurring_id is not null;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade
);
create index receipts_tx_idx on public.receipts (transaction_id);

-- 거래당 영수증 최대 3장 (LED-9)
create or replace function public.enforce_receipt_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.receipts where transaction_id = new.transaction_id) >= 3 then
    raise exception 'receipt limit exceeded (max 3 per transaction)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger receipts_limit before insert on public.receipts
  for each row execute function public.enforce_receipt_limit();

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),  -- 매월 1일
  category_id uuid,                                                      -- null = 총예산
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, month, category_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- 계좌 잔액은 저장하지 않고 뷰로 계산한다. security_invoker로 RLS를 따른다.
create view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.archived,
  a.initial_balance,
  (a.initial_balance + coalesce(sum(
    case
      when t.account_id = a.id and t.type = 'income' then t.amount
      when t.account_id = a.id and t.type in ('expense', 'transfer') then -t.amount
      when t.to_account_id = a.id and t.type = 'transfer' then t.amount
      else 0
    end), 0))::bigint as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;

-- ---------------------------------------------------------------------------
-- 날씨 (사용자 공용 캐시: user_id 없음, 쓰기는 service role만)
-- ---------------------------------------------------------------------------
create table public.weather_cache (
  id uuid primary key default gen_random_uuid(),
  location_key text not null unique,            -- 예: "37.56,126.97" (반올림한 좌표)
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 알림
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'event_start', 'todo_due', 'budget_warning', 'budget_exceeded',
    'payment_due', 'rain_forecast', 'sync_error'
  )),
  title text not null,
  body text,
  link text,
  dedupe_key text,                              -- 같은 알림 중복 생성 방지(예: 'event_start:<id>:10')
  read_at timestamptz,
  scheduled_at timestamptz not null default now(),
  delivered_at timestamptz,                     -- 푸시 등 외부 채널 발송 시각
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, scheduled_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  enabled_types jsonb not null default
    '{"event_start":true,"todo_due":true,"budget_warning":true,"budget_exceeded":true,"payment_due":true,"rain_forecast":true,"sync_error":true}'::jsonb,
  channels jsonb not null default '{"in_app":true,"push":false,"email":false}'::jsonb,
  default_reminder_minutes integer[] not null default '{10}',
  quiet_start time,                             -- 방해금지 시작 (사용자 시간대 기준 시각)
  quiet_end time,
  push_subscriptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MCP
-- ---------------------------------------------------------------------------
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,              -- 원문은 저장하지 않는다
  token_prefix text,                            -- 목록 식별용 앞부분(예: 'lm_ab12')
  scopes jsonb not null default '{"calendar":"read","todo":"read","ledger":"read"}'::jsonb,  -- 값: none|read|write
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.mcp_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid,
  tool text not null,
  input_summary text,
  status text not null check (status in ('ok', 'error', 'denied', 'rate_limited')),
  error text,
  duration_ms integer,
  called_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (token_id, user_id) references public.mcp_tokens (id, user_id)
    on delete set null (token_id)
);
create index mcp_logs_user_idx on public.mcp_logs (user_id, called_at desc);
create index mcp_logs_token_idx on public.mcp_logs (token_id, called_at desc);  -- 분당 호출 제한 집계용

-- ---------------------------------------------------------------------------
-- 허용 이메일 화이트리스트 (AUTH-5): 비어 있으면 누구나 가입 가능
-- ---------------------------------------------------------------------------
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at 트리거 일괄 부착
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','calendars','events','event_reminders','google_connections','sync_logs',
    'todo_projects','todos','todo_items','tags','todo_tags','accounts','categories',
    'recurring_payments','transactions','receipts','budgets','weather_cache',
    'notifications','notification_settings','mcp_tokens','mcp_logs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
