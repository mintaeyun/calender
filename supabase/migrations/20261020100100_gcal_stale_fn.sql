-- 07 gcal-sync: 전체 가져오기 후 구글에서 사라진 일정 정리.
-- 이번 실행에서 확인되지 않은(google_synced_at < p_before) 구글 일정을 소프트 삭제한다.
-- 반복 마스터는 시작이 창 끝 이전이면 대상, 일반 일정·예외 인스턴스는 창과 겹치는 것만 대상(창 밖 일정은 건드리지 않는다).
create or replace function public.gcal_soft_delete_stale(
  p_user uuid, p_calendar uuid, p_min timestamptz, p_max timestamptz, p_before timestamptz
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.events e
     set deleted_at = now()
   where e.user_id = p_user
     and e.calendar_id = p_calendar
     and e.google_event_id is not null
     and e.deleted_at is null
     and (e.google_synced_at is null or e.google_synced_at < p_before)
     and ((e.rrule is not null and e.start_at < p_max)
          or (e.rrule is null and e.start_at < p_max and e.end_at >= p_min));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.gcal_soft_delete_stale(uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
