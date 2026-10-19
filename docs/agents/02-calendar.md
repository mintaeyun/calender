# 02. calendar — 일정

> 먼저 `00-overview.md`를 읽는다. 01의 계약(스키마·타입·셸) 커밋 후 본격 시작. **웨이브 2.**

## 목표
일정 CRUD부터 주간/일간 보기, 반복, 알림, 드래그까지 캘린더 전체를 실데이터로 구현한다. 목업(`components/screens/Calendar.tsx`, 빠른 추가의 일정 탭)을 이식한다.

## 선행 조건 / 의존
- 01: `events`, `event_reminders`, `calendars` 테이블·RLS, 라우트 `/calendar`, `lib/time.ts`, `useProfile()`, `QuickAddProvider`.
- 05(선택): `useWeather(range)` 훅이 있으면 날씨 아이콘 표시(CAL-10). 없으면 슬롯만 두고 나중에 연결.
- 계약 전에 가능한 작업: UI 이식, `recurrence.ts` 순수 로직과 단위 테스트, 레이아웃 계산.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| CAL-1 | 월간 보기, 셀당 최대 3건 + "+N개" | P0 |
| CAL-2 | 일정 필드: 제목(필수), 시작/종료, 종일, 장소, 메모, 색상, 캘린더 분류 | P0 |
| CAL-3 | 등록·수정·삭제(삭제는 확인 단계) | P0 |
| CAL-11 | 모든 시간 사용자 시간대 표시, DB는 UTC | P0 |
| CAL-4 | 주간·일간 보기, 보기 전환, 오늘로 이동 | P1 |
| CAL-5 | 드래그로 이동, 가장자리 드래그로 기간 조절 | P1 |
| CAL-6 | 반복 일정(매일/매주 요일/매월/매년, 종료일·횟수), 수정 시 이번만/이후 전체/전체 | P1 |
| CAL-7 | 알림: 정시, 10분/1시간/1일 전 복수 선택 | P1 |
| CAL-8 | 마감 할일·고정지출 결제일을 캘린더에 표시(토글) | P1 |
| CAL-10 | 날짜 셀에 날씨 아이콘·기온(예보 기간 내) | P1 |
| CAL-9 | 일정 검색(제목·메모·기간·분류) | P2 |

## 소유 경로
`web/src/app/calendar/`, `web/src/features/calendar/` (`api.ts`, `hooks.ts`, `components/`, `lib/`)

## 작업 목록

### A. 데이터 계층 (P0)
- [x] `api.ts`: `listEvents(range)`, `createEvent`, `updateEvent`, `softDeleteEvent`(`deleted_at` 설정), 알림(`event_reminders`) 동시 저장. 항상 `deleted_at is null` 조건.
- [x] `hooks.ts`: `useEvents(range)`, `useEventMutations()`. 쿼리 키 `['events', range]`, 변경 후 invalidate. 월 전환이 빠르도록(CAL 성능: 300ms) 인접 월 prefetch와 `staleTime` 설정.
- [x] 시간 처리: 입력은 사용자 시간대 → UTC `timestamptz`로 저장. 종일 일정은 날짜 기준으로 `start_at`/`end_at`을 정한다(규칙을 `lib/allday.ts`에 문서화: 시작=그날 00:00 사용자 TZ, 종료=마지막 날 다음 00:00 — 구글의 종일 종료 exclusive 규칙과 맞춘다. 07과 합의 필요하면 `REQUESTS.md`).

### B. 월간 보기 (P0)
- [x] `components/MonthView.tsx`: 목업 `Month()` 이식. 월 시작 요일은 `profiles.week_start`. 오늘 강조, 이전/다음 달 흐림, 셀당 3건+"+N개"(클릭 시 해당 날짜 일정 목록).
- [x] 헤더: 이전/다음/오늘 버튼 동작, 제목 "2026년 10월", 일정 개수.
- [x] 분류 범례(캘린더 색), `G` = 구글 일정 표시(출처 구분은 07이 채우는 `calendars.source`/`events.google_event_id` 사용).

### C. 일정 모달 CRUD (P0)
- [x] `components/EventDialog.tsx`: 목업 빠른 추가의 일정 탭 이식. 제목·시작/종료·종일 토글·장소·메모·색상·분류. 날짜/시간 선택기(네이티브 `input[type=datetime-local]`로 시작해도 됨, 한국어 라벨).
- [x] 유효성: 제목 필수, 종료 ≥ 시작.
- [x] 삭제 시 확인 모달(CAL-3). 소프트 삭제이며 "30일 후 영구 삭제" 안내.
- [x] `QuickAddProvider`에 `features/calendar/quick-add.tsx`를 'ev'로 등록(대시보드/헤더에서 호출됨).

### D. 주간·일간 (P1)
- [x] `components/WeekView.tsx`: 목업 `Week()` 이식. 08~22시 그리드, 현재 시각 선, 종일/마감 마커 행, 겹치는 일정은 열 분할 레이아웃(목업은 겹침 처리가 없으므로 구현 필요: 겹침 그룹 → 폭 분할).
- [x] `DayView.tsx`: 단일 컬럼 확대 버전.
- [x] `/calendar?view=month|week|day` 쿼리 파라미터 동기화(PRD §8).

### E. 반복 일정 (P1)
- [x] `lib/recurrence.ts` (순수, 단위 테스트 필수): `rrule` 라이브러리로 `events.rrule` 문자열 생성/파싱, 기간 내 인스턴스 전개(`expandEvents(events, range, tz)`), `exdates`/예외 인스턴스(`recurring_event_id`, `original_start_at`) 반영. **다른 세션(05 알림 스캔, 06 MCP, 07 구글)이 재사용**하므로 React 비의존으로 작성하고 `supabase/functions`에서도 쓸 수 있게 `npm:rrule`만 의존.
- [x] 반복 UI: 목업의 빈도 탭(안 함/매일/매주/매월/매년), 요일 선택, 종료(없음/날짜/횟수), 요약 문구.
- [x] 수정·삭제 시 범위 선택 모달 "이번만 / 이후 전체 / 전체"(3가지로 제한):
  - 이번만: 예외 인스턴스 생성(`recurring_event_id`, `original_start_at`) 또는 `exdates` 추가(삭제)
  - 이후 전체: 원본 rrule에 `UNTIL` 설정 + 새 시리즈 생성
  - 전체: 원본 수정
- [x] 구글 유래 반복 일정은 구글의 RRULE을 그대로 따른다(변환하지 않음).

### F. 알림 선택 (P1)
- [x] 일정 모달의 알림 칩(정시/10분/1시간/1일 전, 종일은 당일 09:00·1일 전 20:00·1주 전). `event_reminders.minutes_before`에 저장(종일 일정의 시각 기준은 규칙화해 문서에 기록).
- [x] 실제 발송은 05 `notify`가 한다. 02는 데이터만 저장.

### G. 드래그 (P1)
- [x] 주간/일간에서 일정 드래그 이동(15분 스냅), 아래 가장자리 드래그로 종료 시간 조절. 월간은 날짜 간 이동. 낙관적 업데이트 + 실패 롤백.
- [x] 반복 일정 드래그는 범위 선택 모달을 거친다. 구글 읽기전용 일정은 드래그 불가.
- [x] 라이브러리 선택(FullCalendar vs 직접 구현, PRD §10)은 반복·드래그 요구를 평가해 근거와 함께 사용자에게 확인한 뒤 확정한다. 기본 제안: 목업 디자인 유지를 위해 직접 구현 + 포인터 이벤트.

### H. 캘린더 오버레이 (P1)
- [x] CAL-8: 마감일 있는 할일(03 `todos`)과 고정지출 결제일(04 `recurring_payments.next_run_date` 기반 예정일 계산)을 마커로 표시. 헤더 칩(할일 마감/결제일/날씨)을 토글로 만들고 상태를 localStorage에 저장. 읽기 전용 조회 쿼리만 작성하고 해당 영역의 api를 임의 수정하지 않는다.
- [x] CAL-10: 날씨 슬롯 — 05의 `useWeather` 사용(7일 예보 범위 밖은 표시 안 함).

### I. 검색 (P2)
- [x] CAL-9: 제목·메모 ilike 또는 `pg_trgm`/FTS, 기간·분류 필터. 통합 검색(08)이 재사용할 `searchEvents(query)` api를 export.

## 제공하는 계약
- `features/calendar/api.ts`의 `listEvents/createEvent/updateEvent/softDeleteEvent/searchEvents`
- `features/calendar/lib/recurrence.ts`(`expandEvents`), `lib/allday.ts`
- 'ev' 빠른 추가 컴포넌트
- 종일·알림 저장 규칙 문서(이 파일 하단 인수인계 메모)

## 지켜야 할 규칙 · 함정
- 시간은 UTC 저장·사용자 TZ 표시(CAL-11). DST가 없는 Asia/Seoul이라도 TZ를 하드코딩하지 말고 `profiles.timezone`을 쓴다.
- 일정 삭제는 소프트 삭제. 하드 삭제 UI 금지.
- 반복 수정은 3가지로만 제한. 다른 범위를 추가하지 않는다.
- 쿼리마다 `user_id` 필터가 RLS와 이중으로 걸리게 하지 않아도 되지만, 타입 안전을 위해 `database.types.ts`의 Row 타입을 쓴다.
- 구글 연동(07)이 같은 `events` 행을 upsert한다. `google_event_id`, `google_etag`, `calendars.source`를 02가 덮어쓰지 않도록 update 시 해당 컬럼은 건드리지 않는다.

## 완료 기준
- [ ] (실DB 검증 대기) 월간/주간/일간에서 일정 생성·수정·삭제(확인 포함)가 DB에 반영되고 새로고침 후에도 유지된다.
- [ ] (실DB 검증 대기) 매주 월·수 반복 일정을 만들고 "이번만 수정", "이후 전체 수정", "전체 수정"이 각각 맞게 동작한다.
- [x] `recurrence.ts` 단위 테스트 통과(매일/매주/매월/매년/횟수/UNTIL/예외/exdates).
- [ ] (실DB 검증 대기) 드래그 이동·기간 조절이 DB에 저장된다.
- [x] `npm run lint`, `npm run build` 통과. `AGENTS.md`에 테스트 실행 명령 추가.

## 인수인계 메모
- 브랜치 feat/calendar (미병합). lint/build 통과, vitest 42개 통과(recurrence·scope·range·layout·move·allday·overlays). **미검증**: 실제 Supabase 쿼리(api.ts의 PostgREST or() 필터, 임베드 select, 복합 FK 동작), 브라우저 조작(드래그·모달) — DB/브라우저 환경이 없어 코드 리뷰와 순수 로직 테스트로만 확인.
- 종일·알림 규칙: features/calendar/lib/allday.ts 상단 주석 참고 (종일 end_at = 마지막 날 다음 00:00 exclusive, 종일 알림 기준 = 첫날 09:00 → 당일 0 / 전날 20:00 780 / 1주 전 10080).
- 반복: events.rrule = RRULE 문자열(접두사·DTSTART 없음), 시작은 start_at. 사용자 시간대 벽시계 기준으로 전개(lib/recurrence.ts expandEvents/occurrencesBetween). 예외 = recurring_event_id+original_start_at 행, 제외 = 마스터 exdates. 이번만/이후 전체/전체 계획은 lib/scope.ts(planEdit/planDelete)이며 api.ts가 순서대로 실행(트랜잭션 아님 → 중간 실패 시 일부만 반영될 수 있음, 새 행 생성을 먼저 하도록 정렬).
- 이후 전체 분할 시: 이후의 예외 행·exdates는 새 시리즈로 옮기고 시각 차이만큼 평행이동. 예외 행을 전체/이후 전체로 수정하면 그 행은 마스터에 흡수(소프트 삭제).
- 다른 세션용: recurrence.ts는 ../../../lib/time 상대 경로 + rrule 에만 의존(Edge Function에서 쓰려면 import_map 에 rrule→npm:rrule 필요, 번들링 가능 여부 미검증). reminderFireAt()(allday.ts)으로 알림 발송 시각 계산.
- 구글 일정은 읽기 전용(lib/colors.ts isReadOnlyEvent 한 곳에서 판단). 07이 양방향을 지원하면 이 함수만 수정.
- CAL-10 날씨: CalendarScreen이 features/weather 의 useDailyWeather()로 날짜 셀·주간 헤더에 아이콘+기온 표시, 헤더 "날씨" 칩으로 토글(localStorage "calendar.overlays"). CAL-9 검색: 헤더 "검색" 버튼 → SearchPanel(제목·메모·장소, 기간, 분류), 반복 일정은 마스터 1건으로 나오고 결과를 누르면 그 날짜로 이동(비반복은 수정 모달도 연다).
- 미구현: 설정의 기본 알림값(notification_settings.default_reminder_minutes) 연동 — 새 일정 기본 알림은 현재 없음.
- 확인 필요: 드래그는 라이브러리 없이 직접 구현(포인터 이벤트, 월간은 HTML5 DnD). PRD §10 라이브러리 선택은 사용자 확인 사항이라 기본 제안안대로 진행했고 바꿔도 EventInstance/onChangeRange 경계만 교체하면 됨.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/02-calendar.md 를 읽고 02 calendar 세션을 진행해줘.
브랜치 feat/calendar 에서 작업하고, 01 foundation 계약이 main에 있으면 병합해서 시작해줘. 아직 없으면 UI 이식과 recurrence.ts 순수 로직(+단위 테스트)부터 해줘.
소유 경로 밖은 수정하지 말고, 필요하면 docs/agents/REQUESTS.md에 남겨줘. P0 → P1 → P2 순서를 지켜줘.
```
