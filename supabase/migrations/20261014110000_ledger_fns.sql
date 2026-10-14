-- 04 ledger: 거래 출처, 예산 알림 중복 방지 컬럼, budget_usage(), 고정지출 자동 등록(run_recurring_payments).

-- ---------------------------------------------------------------------------
-- 거래 출처: MCP(Claude)로 기록한 거래를 화면에서 "Claude에서 기록"으로 표시 (06과 합의)
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column source text not null default 'web' check (source in ('web', 'mcp'));

-- ---------------------------------------------------------------------------
-- 예산 80%/100% 첫 도달 알림 1회 보장용 (05 notify가 갱신)
-- ---------------------------------------------------------------------------
alter table public.budgets
  add column alerted_80_at timestamptz,
  add column alerted_100_at timestamptz;

-- ---------------------------------------------------------------------------
-- budget_usage(p_user, p_month): 해당 월 예산별 사용액. category_id null = 총예산.
-- 지출(type='expense')만 집계한다(이체·수입 제외). 로그인 사용자는 auth.uid()가 우선(p_user 무시),
-- service role(notify/MCP)은 p_user를 넘긴다.
-- ---------------------------------------------------------------------------
create or replace function public.budget_usage(p_user uuid default null, p_month date default null)
returns table (category_id uuid, budget bigint, spent bigint, ratio numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user);
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  if v_user is null then
    raise exception 'budget_usage: user required' using errcode = '28000';
  end if;

  return query
  select b.category_id,
         b.amount::bigint as budget,
         coalesce((
           select sum(t.amount) from public.transactions t
            where t.user_id = v_user and t.type = 'expense'
              and t.date >= v_month and t.date < (v_month + interval '1 month')::date
              and (b.category_id is null or t.category_id = b.category_id)
         ), 0)::bigint as spent,
         round(coalesce((
           select sum(t.amount) from public.transactions t
            where t.user_id = v_user and t.type = 'expense'
              and t.date >= v_month and t.date < (v_month + interval '1 month')::date
              and (b.category_id is null or t.category_id = b.category_id)
         ), 0)::numeric / b.amount, 4) as ratio
    from public.budgets b
   where b.user_id = v_user and b.month = v_month;
end;
$$;

revoke all on function public.budget_usage(uuid, date) from public, anon;
grant execute on function public.budget_usage(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 결제일 계산: 해당 연·월의 pay_day (그 달에 없으면 말일: 31일→30일/28·29일)
-- ---------------------------------------------------------------------------
create or replace function public.pay_date_in(p_year int, p_month int, p_day int)
returns date
language sql
immutable
set search_path = public
as $$
  select least(
    make_date(p_year, p_month, 1) + (p_day - 1),
    (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month - 1 day')::date
  );
$$;

-- p_after 이후(초과)의 다음 결제일
create or replace function public.next_pay_date(p_cycle text, p_pay_day int, p_pay_month int, p_after date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d date;
begin
  if p_cycle = 'yearly' then
    d := public.pay_date_in(extract(year from p_after)::int, p_pay_month, p_pay_day);
    if d <= p_after then
      d := public.pay_date_in(extract(year from p_after)::int + 1, p_pay_month, p_pay_day);
    end if;
  else
    d := public.pay_date_in(extract(year from p_after)::int, extract(month from p_after)::int, p_pay_day);
    if d <= p_after then
      d := public.pay_date_in(extract(year from p_after + interval '1 month')::int,
                              extract(month from p_after + interval '1 month')::int, p_pay_day);
    end if;
  end if;
  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- run_recurring_payments(): next_run_date <= 오늘(사용자 시간대)인 활성 고정지출을 거래로 등록한다.
-- 며칠 밀렸어도 누락일을 모두 생성하고, (recurring_id, date) 유니크로 같은 날 중복 등록을 막는다(멱등).
-- 반환: 새로 만든 거래 수. cron(UTC)이 호출하므로 일반 사용자에게는 실행 권한을 주지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.run_recurring_payments(p_today date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date;
  v_run date;
  v_created int := 0;
  v_n int;
begin
  for r in
    select rp.*, coalesce(pr.timezone, 'Asia/Seoul') as tz
      from public.recurring_payments rp
      left join public.profiles pr on pr.user_id = rp.user_id
     where rp.active
     order by rp.id
     for update of rp
  loop
    v_today := coalesce(p_today, (now() at time zone r.tz)::date);
    v_run := r.next_run_date;
    while v_run <= v_today loop
      insert into public.transactions (user_id, date, amount, type, category_id, account_id, memo, recurring_id, source)
      values (r.user_id, v_run, r.amount, 'expense', r.category_id, r.account_id, r.name, r.id, 'web')
      on conflict (recurring_id, date) where recurring_id is not null do nothing;
      get diagnostics v_n = row_count;
      v_created := v_created + v_n;
      update public.recurring_payments set last_run_date = v_run where id = r.id;
      v_run := public.next_pay_date(r.cycle, r.pay_day, r.pay_month, v_run);
    end loop;
    if v_run <> r.next_run_date then
      update public.recurring_payments set next_run_date = v_run where id = r.id;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.run_recurring_payments(date) from public, anon, authenticated;
grant execute on function public.run_recurring_payments(date) to service_role;

-- 매일 00:10 KST = 15:10 UTC (Supabase cron은 UTC)
select cron.schedule('run-recurring-payments', '10 15 * * *', $$select public.run_recurring_payments()$$);
