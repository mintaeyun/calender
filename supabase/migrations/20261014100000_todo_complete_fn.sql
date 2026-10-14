-- 03 todo: 반복 할일 완료 시 다음 주기를 원자적으로 만든다 (TODO-5).
-- 다음 주기 날짜 계산은 앱/Edge(rrule)에서 하고, 이 함수는 완료 처리 + 다음 행 생성을 한 트랜잭션으로 묶는다.
-- 중복 방지: ① 이미 done인 행은 갱신하지 않아 재호출해도 아무 일도 없고, ② (recurrence_source_id, due_date) 유니크로 이중 생성을 막는다.

alter table public.todos add column recurrence_source_id uuid;
create unique index todos_recurrence_source_due_uidx
  on public.todos (recurrence_source_id, due_date) where recurrence_source_id is not null;

-- 새 반복 행의 원본(직전 주기) 추적용. 원본이 영구 삭제돼도 다음 행은 남는다(FK 없음).

create or replace function public.complete_todo(
  p_id uuid,
  p_next_due date default null,
  p_next_rule text default null,
  p_user uuid default null          -- service role(MCP)에서만 쓴다. 로그인 사용자는 auth.uid()가 우선한다.
)
returns uuid                         -- 새로 만든 다음 주기 할일 id (없으면 null)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user);
  t public.todos;
  v_new uuid;
begin
  if v_user is null then
    raise exception 'complete_todo: user required' using errcode = '28000';
  end if;

  update public.todos
     set status = 'done', completed_at = now()
   where id = p_id and user_id = v_user and status <> 'done' and deleted_at is null
  returning * into t;

  if not found or p_next_due is null then
    return null;
  end if;

  insert into public.todos (user_id, project_id, title, notes, due_date, priority, status,
                            recurrence_rule, recurrence_source_id, position)
  values (t.user_id, t.project_id, t.title, t.notes, p_next_due, t.priority, 'todo',
          coalesce(p_next_rule, t.recurrence_rule), t.id, t.position)
  on conflict (recurrence_source_id, due_date) where recurrence_source_id is not null do nothing
  returning id into v_new;

  if v_new is not null then
    insert into public.todo_tags (user_id, todo_id, tag_id)
      select user_id, v_new, tag_id from public.todo_tags where todo_id = t.id and user_id = v_user;
    insert into public.todo_items (user_id, todo_id, text, done, position)
      select user_id, v_new, text, false, position from public.todo_items where todo_id = t.id and user_id = v_user;
  end if;

  return v_new;
end;
$$;

revoke all on function public.complete_todo(uuid, date, text, uuid) from public, anon;
grant execute on function public.complete_todo(uuid, date, text, uuid) to authenticated, service_role;
