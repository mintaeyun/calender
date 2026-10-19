-- 07 gcal-sync 양방향(F). 적용 전 사용자 승인 필요(원격 DB 변경).
--
-- 변경 감지 설계: "구글과 마지막으로 맞춘 시점의 updated_at" 을 google_synced_at 에 둔다.
--   - 동기화 코드가 google_synced_at 에 'infinity' 를 쓰면 트리거가 그 행의 updated_at 으로 바꿔 저장한다(같은 트랜잭션 now() 라 정확히 같다).
--   - 따라서 앱·MCP 가 나중에 수정하면 updated_at > google_synced_at 이 되어 "로컬 변경"으로 감지된다.
--   - 서버/DB 시계를 섞어 비교하지 않는다(시계 차이로 인한 오탐 방지).

-- 전체 가져오기 때 "이번 실행에서 확인된 일정" 표시용 실행 id (시계 비교 대신 사용)
alter table public.events add column if not exists google_seen_run text;

-- 로컬 일정을 구글(mycal)에도 보낼지 (기본 켜짐). 동기화 방향은 기존 sync_direction('import_only' | 'two_way').
alter table public.google_connections add column if not exists push_local boolean not null default true;
grant select (push_local) on public.google_connections to authenticated;
grant update (push_local) on public.google_connections to authenticated;

create or replace function public.events_gcal_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.google_synced_at = 'infinity'::timestamptz then
    new.google_synced_at := new.updated_at;
  end if;
  return new;
end;
$$;

-- events_set_updated_at 트리거(updated_at 갱신) 뒤에 실행되도록 이름을 정렬 순서상 뒤로 둔다.
drop trigger if exists events_zz_gcal_stamp on public.events;
create trigger events_zz_gcal_stamp before insert or update on public.events
  for each row execute function public.events_gcal_stamp();

-- 푸시 후보: 아직 구글에 없는 로컬 일정(신규) + 구글과 맞춘 뒤 바뀐 일정(수정·삭제).
-- p_include_local=false 면 "신규 로컬 일정"은 제외하고 이미 구글과 연결된 일정의 변경만 돌려준다.
create or replace function public.gcal_push_candidates(p_user uuid, p_include_local boolean)
returns setof public.events
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
    from public.events e
    left join public.calendars c on c.id = e.calendar_id and c.user_id = e.user_id
   where e.user_id = p_user
     and (
       (e.google_event_id is null and e.deleted_at is null and p_include_local
          and coalesce(c.source, 'local') = 'local')
       or (e.google_event_id is not null and e.google_synced_at is not null and e.updated_at > e.google_synced_at)
     )
   order by (e.recurring_event_id is not null), e.updated_at;
$$;

revoke all on function public.gcal_push_candidates(uuid, boolean) from public, anon, authenticated;

-- 전체 가져오기 후 구글에서 사라진 일정 정리 (실행 id 기준). 이 실행에서 확인되지 않은 구글 일정만 소프트 삭제한다.
-- 로컬에서 만든 일정(구글 id 없음)과 로컬에서 고쳤는데 아직 푸시 안 된 일정(updated_at > google_synced_at)은 건드리지 않는다.
create or replace function public.gcal_soft_delete_stale_run(
  p_user uuid, p_calendar uuid, p_min timestamptz, p_max timestamptz, p_run text
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
     and e.google_event_id is not null
     and e.deleted_at is null
     and (e.google_seen_run is distinct from p_run)
     and (e.google_synced_at is null or e.updated_at <= e.google_synced_at)
     and (e.calendar_id = p_calendar or e.calendar_id in (select id from public.calendars where user_id = p_user and source = 'local'))
     and ((e.rrule is not null and e.start_at < p_max)
          or (e.rrule is null and e.start_at < p_max and e.end_at >= p_min));
  get diagnostics n = row_count;
  -- 방금 삭제 처리한 행은 "구글과 일치"로 표시해, 다음 푸시가 삭제를 구글로 되돌려 보내지 않게 한다.
  update public.events e set google_synced_at = e.updated_at
   where e.user_id = p_user and e.deleted_at is not null and e.google_synced_at is not null and e.updated_at > e.google_synced_at
     and e.deleted_at >= now() - interval '1 minute' and e.google_seen_run is distinct from p_run;
  return n;
end;
$$;

revoke all on function public.gcal_soft_delete_stale_run(uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
