-- 03 todo: 할일 → 캘린더 일정 전환 (TODO-8, P2). 마감일 기준 종일 일정을 만들고 할일에 연결한다.
-- 중복 전환 방지: 할일 행을 잠근 채 "이미 연결된 살아있는 일정이 있으면 그 id를 돌려주고, 없을 때만 새로 만든다".

alter table public.todos add column event_id uuid;
alter table public.todos
  add constraint todos_event_fk foreign key (event_id, user_id) references public.events (id, user_id)
  on delete set null (event_id);

create or replace function public.convert_todo_to_event(
  p_todo_id uuid,
  p_start_at timestamptz,          -- 종일 일정: 첫날 00:00(사용자 시간대)의 UTC 시각
  p_end_at timestamptz,            -- 종일 일정: 다음 날 00:00 (exclusive, 02 allday 규칙)
  p_calendar_id uuid default null
)
returns table (event_id uuid, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  t public.todos;
  v_event uuid;
begin
  if v_user is null then
    raise exception 'convert_todo_to_event: user required' using errcode = '28000';
  end if;

  select * into t from public.todos where id = p_todo_id and user_id = v_user and deleted_at is null for update;
  if not found then
    raise exception 'todo not found' using errcode = 'P0002';
  end if;

  if t.event_id is not null and exists (
    select 1 from public.events e where e.id = t.event_id and e.user_id = v_user and e.deleted_at is null
  ) then
    return query select t.event_id, false;
    return;
  end if;

  insert into public.events (user_id, calendar_id, title, start_at, end_at, all_day, notes)
  values (v_user, p_calendar_id, t.title, p_start_at, p_end_at, true, t.notes)
  returning id into v_event;

  update public.todos set event_id = v_event where id = t.id;
  return query select v_event, true;
end;
$$;

revoke all on function public.convert_todo_to_event(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.convert_todo_to_event(uuid, timestamptz, timestamptz, uuid) to authenticated;
