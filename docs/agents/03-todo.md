# 03. todo — 할일

> 먼저 `00-overview.md`를 읽는다. 01의 계약 커밋 후 본격 시작. **웨이브 2.**

## 목표
할일 목록·상세·체크리스트부터 칸반, 반복 할일, 프로젝트·태그, 완료 보관함까지 실데이터로 구현한다. 목업(`components/screens/Todo.tsx`)을 이식한다.

## 선행 조건 / 의존
- 01: `todos`, `todo_items`, `todo_projects`, `tags`, `todo_tags` 테이블·RLS, 라우트 `/todos`, `QuickAddProvider`.
- 02(선택, P2): 일정 전환(TODO-8)은 02의 `createEvent` api를 호출한다.
- 계약 전에 가능한 작업: UI 이식, 필터·정렬·반복 계산 순수 로직과 테스트.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| TODO-1 | 필드: 제목(필수), 마감일, 우선순위(상/중/하), 프로젝트, 태그, 메모, 하위 체크리스트 | P0 |
| TODO-2 | 필터 오늘/예정/기한초과/전체/완료, 정렬 마감·우선순위·생성일 | P0 |
| TODO-3 | 체크로 완료/취소, 완료 시각 기록 | P0 |
| TODO-4 | 칸반(대기/진행 중/완료), 드래그로 상태 변경 | P1 |
| TODO-5 | 반복 할일: 완료 시 다음 주기 자동 생성 | P1 |
| TODO-6 | 프로젝트·태그 CRUD, 색상 | P1 |
| TODO-7 | 완료 보관함: 조회, 복원, 영구 삭제 | P1 |
| TODO-8 | 할일을 캘린더 일정으로 변환(마감일 기준) | P2 |

## 소유 경로
`web/src/app/todos/`, `web/src/features/todo/` (`api.ts`, `hooks.ts`, `components/`, `lib/`)

## 작업 목록

### A. 데이터 계층 (P0)
- [x] `api.ts`: `listTodos(filter, sort)`, `getTodo(id)`(체크리스트·태그 포함), `createTodo`, `updateTodo`, `toggleDone`(`status`와 `completed_at` 함께), `softDeleteTodo`(`deleted_at`), 체크리스트 CRUD(`todo_items`).
- [x] `hooks.ts`: `useTodos(filter)`, `useTodo(id)`, mutation 훅. 체크 토글은 낙관적 업데이트.
- [x] 기한 분류는 서버에서 `due_date`(date)와 사용자 TZ의 "오늘"을 비교해 계산: 오늘 = `due_date = today`, 기한초과 = `due_date < today and status != done`, 예정 = `due_date > today`. `lib/due.ts`에 순수 함수로 두고 테스트. (목업의 `due: 'over'|'today'|'later'|'none'|'past'` 분류를 그대로 도출.)

### B. 목록 화면 (P0)
- [x] `components/TodoList.tsx`: 목업 3단 레이아웃(필터/목록/상세) 이식. 필터별 개수 배지는 실제 count 쿼리.
- [x] 정렬 선택 UI(마감순/우선순위/생성일). 같은 마감이면 우선순위 → 생성일.
- [x] 상세 패널: 마감일, 우선순위, 프로젝트, 태그, 반복, 체크리스트(추가·체크·삭제), 메모(편집). 인라인 편집 후 저장.
- [x] 우선순위 색(상=경고색, 중=회색, 하=어두운 회색)은 목업의 `PRI` 값 사용.
- [x] 빠른 추가: `features/todo/quick-add.tsx`를 'todo'로 `QuickAddProvider`에 등록.
- [x] 삭제는 확인 후 소프트 삭제(TODO-7 보관함과는 별개: 보관함은 "완료" 항목, 삭제는 `deleted_at`).

### C. 칸반 (P1)
- [x] `components/Kanban.tsx`: 3열(대기 `todo` / 진행 중 `doing` / 완료 `done`). 드래그로 열 이동 시 `status` 변경(완료로 이동하면 `completed_at` 기록, 이탈하면 null).
- [x] 열 내 순서는 `position`(실수 또는 문자열 분수 인덱스)으로 저장. 드롭 시 이웃 사이 값으로 계산해 한 행만 업데이트.
- [x] 드래그 라이브러리는 가벼운 것(`@dnd-kit/core`) 사용 가능. 키보드 대체 조작(접근성)도 고려.

### D. 반복 할일 (P1)
- [x] `todos.recurrence_rule`(RRULE 문자열, `rrule` 라이브러리). UI: 매일/매주(요일)/매월/매년/종료 설정(02 반복 UI와 모양을 맞춘다. 컴포넌트는 공유하지 말고 별도 구현 — 소유권 분리).
- [x] 완료 시 다음 주기 할일 자동 생성: `lib/nextOccurrence.ts`(순수, 테스트 필수). 새 행은 같은 제목·프로젝트·태그·체크리스트(미완료로 초기화), `due_date`는 다음 주기. 종료 조건(UNTIL/COUNT)을 넘으면 생성하지 않는다.
- [x] 생성은 클라이언트 mutation이 아닌 **DB 함수**(`complete_todo(id)` RPC) 또는 트리거로 원자적으로 처리해 중복 생성을 막는다. 이 RPC는 06 MCP의 `complete_todo`도 호출한다 → 추가 마이그레이션 `YYYYMMDDHHMMSS_todo_complete_fn.sql`에 작성. (순수 SQL로 RRULE 계산이 어려우면: 다음 주기 계산은 앱/Edge에서 하고, 멱등성 키(`recurrence_source_id` + `due_date` unique)로 중복을 막는다. 선택 근거를 인수인계 메모에 기록.)

### E. 프로젝트·태그 (P1)
- [x] 프로젝트 CRUD(이름·색·보관), 태그 CRUD(색). 사이드바 목록에 미완료 개수 표시. 삭제/보관 시 소속 할일은 프로젝트 없음으로 이동.
- [x] 설정 → 카테고리·태그 화면(08)이 재사용할 `listProjects/listTags` + mutation api를 export한다.

### F. 완료 보관함 (P1)
- [x] 완료 항목 목록(완료 시각순), 복원(`status=todo`, `completed_at=null`), 영구 삭제(확인 모달, 하드 삭제).

### G. 일정 전환 (P2)
- [x] "일정으로 전환 ↗" 버튼: 마감일 기준 종일 일정 생성(02 `createEvent` 호출, 02가 없으면 보류). 전환 후 할일에 연결 표시(추가 컬럼이 필요하면 추가 마이그레이션). 중복 전환 방지.

## 제공하는 계약
- `features/todo/api.ts`(`listTodos`, `createTodo`, `completeTodo`, `listProjects`, `listTags`, `searchTodos(query)`)
- `complete_todo` RPC 또는 다음 주기 계산 모듈 (06이 호출)
- 'todo' 빠른 추가 컴포넌트
- 대시보드용 쿼리: 오늘 마감·기한초과 할일 목록, 주간 달성률 (08이 사용)

## 지켜야 할 규칙 · 함정
- 마감일은 `date`(타임존 변환 금지). "오늘" 판정만 사용자 TZ로 한다.
- 소프트 삭제(`deleted_at`) 항목은 모든 조회에서 제외. 30일 정리는 01의 cron이 한다.
- 반복 할일 완료 취소 시 이미 생성된 다음 주기 행을 지우지 않는다(데이터 손실 방지). 사용자에게 알림만.
- 프로젝트 ID가 아닌 이름으로 접근하는 외부(MCP)를 위해 프로젝트 이름은 사용자 내 유일하게 제약(추가 마이그레이션 `unique(user_id, name)`).

## 완료 기준
- [ ] 할일 생성·수정·체크·삭제가 DB에 반영되고 새로고침 후 유지된다. 필터 개수가 맞다.
- [ ] 칸반에서 드래그한 상태·순서가 유지된다.
- [ ] 매주 금요일 반복 할일을 완료하면 다음 금요일 할일이 정확히 1개 생성된다(재클릭해도 중복 없음).
- [ ] 순수 로직(`due.ts`, `nextOccurrence.ts`) 단위 테스트 통과.
- [ ] `npm run lint`, `npm run build` 통과. `AGENTS.md`에 테스트 명령 추가.

## 인수인계 메모
**상태(2026-10-14, 브랜치 feat/todo, 커밋 aa1dae0):** 코드 구현·단위 테스트(25개)·lint·build 통과. **실DB 연동 검증은 미실시**(Docker·Supabase 프로젝트 없음) — 화면 동작은 연결 후 확인 필요. TODO-8(일정 전환)은 2026-10-19 구현.
- **반복 생성 방식:** SQL로 RRULE 계산이 어려워 "다음 주기 날짜는 앱/Edge(`nextOccurrence.ts`, rrule)가 계산 → DB 함수 `complete_todo(p_id, p_next_due, p_next_rule, p_user)`가 완료 처리+다음 행 생성을 한 트랜잭션으로" 방식을 택했다. 중복 방지: 이미 done이면 갱신 0행이라 아무 일도 없고, `unique(recurrence_source_id, due_date)`가 이중 생성을 막는다. PGlite로 1회 호출 생성/재호출 null/비반복/타 사용자 null 검증함.
- **06 MCP 호출법:** service role로 `rpc("complete_todo", {p_id, p_next_due, p_next_rule, p_user: <토큰 소유자 user_id>})`. 다음 주기는 `web/src/features/todo/lib/nextOccurrence.ts`(순수, npm:rrule)와 같은 로직으로 계산해 넘긴다(Edge에서는 파일 복사 필요: web 밖 import 불가). p_user를 안 넘기면 service role에서는 오류.
- **추가 마이그레이션:** `20261014100000_todo_complete_fn.sql` (todos.recurrence_source_id + 유니크 인덱스 + complete_todo). `database.types.ts`(web·_shared)는 Docker가 없어 **손으로 해당 부분만 수정**했으니 `npm run db:types`로 재생성 필요.
- **position 규칙:** double. 새 할일은 열 맨 끝(max+1024), 드롭은 이웃 중간값(`lib/position.ts`). 한 행만 갱신. 간격이 1e-6 미만이면 재정렬 필요(`needsRebalance`, 아직 호출하는 곳 없음).
- **필터 개수:** 서버 count 쿼리 대신 삭제되지 않은 전체 할일(`listTodos`)을 가져와 클라이언트에서 같은 데이터로 필터·개수 계산(개인용 규모 가정).
- **프로젝트 이름 유니크:** 01 스키마에 이미 `unique(user_id,name)` 있어 추가 마이그레이션 불필요. 
- **목업 정리:** `components/screens/Todo.tsx`·`lib/todo.ts`는 `components/App.tsx`(구 목업 셸)와 Dashboard 목업이 아직 참조해 지우지 못했다(소유 밖). App.tsx 정리 시 함께 삭제.
- **다른 세션 계약:** `features/todo/api.ts`의 `listTodos/createTodo/completeTodo/listProjects/listTags/searchTodos`. 대시보드용 "오늘 마감·기한초과 / 주간 달성률" 전용 쿼리는 아직 없음(08이 `listTodos()`+`matchesFilter`로 계산 가능, 필요하면 요청).

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/03-todo.md 를 읽고 03 todo 세션을 진행해줘.
브랜치 feat/todo 에서 작업하고, 01 foundation 계약이 main에 있으면 병합해서 시작해줘. 아직 없으면 UI 이식과 순수 로직(due.ts, nextOccurrence.ts)+테스트부터 해줘.
소유 경로 밖은 수정하지 말고, 필요하면 docs/agents/REQUESTS.md에 남겨줘. P0 → P1 → P2 순서를 지켜줘.
```

- **TODO-8 일정 전환(2026-10-19):** `todos.event_id`(+복합 FK, 일정 하드 삭제 시 null) 와 DB 함수 `convert_todo_to_event(p_todo_id,p_start_at,p_end_at,p_calendar_id)` — 할일 행을 잠가 중복을 막고(이미 연결된 살아있는 일정이면 그 id 반환, 일정이 소프트 삭제됐으면 새로 생성), 종일 일정 규칙은 02 `allDayToRange` 사용. 마이그레이션 `20261019100000_todo_event_link.sql`(원격 적용됨). 알림(event_reminders)은 만들지 않는다(할일 마감 알림과 중복 방지). UI: 상세 패널 "일정으로 전환 ↗"(마감일 없으면 비활성) → 전환 후 "일정 보기 ↗".
