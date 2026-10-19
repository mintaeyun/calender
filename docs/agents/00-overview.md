# 00. 멀티 세션 개발 개요

여러 Claude 세션(에이전트)이 병렬로 개발할 때의 분담, 순서, 공통 규칙이다. 각 세션은 자기 번호의 문서(`01`~`08`)를 먼저 읽고, 이 문서의 공통 규칙을 따른다.
기준 문서는 `PRD.md`(요구사항 ID·데이터 모델)와 `AGENTS.md`(반드시 지킬 규칙)다. 이 문서들과 충돌하면 PRD/AGENTS가 우선한다.

## 1. 현재 상태

- 기획(`PRD.md`, `Sitemap.md`)과 프론트 목업(`web/`, 샘플 데이터)이 있다. 백엔드(Supabase)는 없다.
- 목업 화면은 `web/src/components/screens/*.tsx`, 샘플 데이터는 `web/src/lib/data.ts`다. 디자인 원본은 `design/`(수정 금지).
- 프레임워크는 Next.js(App Router)+TypeScript로 확정(PRD §14-3).

## 2. 세션 구성

| # | 문서 | 세션 | 담당 요구사항 | 마일스톤 |
|---|---|---|---|---|
| 01 | `01-foundation.md` | 기반 | AUTH-1~5, 전 테이블 스키마·RLS, 앱 셸·라우팅 | M1 |
| 02 | `02-calendar.md` | 일정 | CAL-1~11 | M2·M5 |
| 03 | `03-todo.md` | 할일 | TODO-1~8 | M2·M5 |
| 04 | `04-ledger.md` | 가계부 | LED-1~10 | M2·M5 |
| 05 | `05-weather-notify.md` | 날씨·알림 | WX-1~7, NOTI-1~4 | M3·M5 |
| 06 | `06-mcp.md` | MCP 서버 | MCP-1~9 | M3 |
| 07 | `07-gcal-sync.md` | 구글 연동 | GCAL-1~11 | M4 |
| 08 | `08-integration.md` | 통합(후반) | DASH-1~6, SET-1~3, SRCH-1, PWA | M2·M6 |

모든 요구사항 ID는 정확히 한 세션에 배정되어 있다. 배정이 겹치거나 빠진 ID를 발견하면 `REQUESTS.md`에 남긴다.

## 3. 진행 순서 (웨이브)

```
웨이브 1  01 foundation ─────────────┐ (계약 커밋·푸시)
                                      ▼
웨이브 2  02 calendar  03 todo  04 ledger  05 weather  06 mcp(뼈대·조회)   ← 동시 시작
                                      ▼
웨이브 3  07 gcal-sync(02의 events CRUD 이후)  05 notify  06 쓰기·삭제 도구  08 integration
```

- **계약**이란 01이 커밋하는 다음 산출물이다: ① `supabase/migrations/*_init*.sql`(전 테이블·RLS·뷰), ② `web/src/lib/supabase/database.types.ts`, ③ 라우팅·레이아웃·Provider, ④ 데이터 접근 규약(아래 §5), ⑤ `supabase/functions/_shared/`.
- 계약이 나오기 전에도 02~06은 다음을 먼저 할 수 있다: 목업 UI 이식, 순수 로직(rrule 계산, 통계 계산, MCP 도구 JSON Schema), 문서.
- 02~06은 계약이 나오면 `main`을 자기 브랜치에 병합(`git merge main`)하고 시작한다.

## 4. 소유권 규칙 (충돌 방지)

| 경로 | 소유 |
|---|---|
| `supabase/migrations/*_init*`, `web/src/lib/supabase/`, `web/src/app/(auth)/`, `web/src/components/layout/`, `web/src/app/layout.tsx`, `supabase/functions/_shared/` | 01 |
| `web/src/app/calendar/`, `web/src/features/calendar/` | 02 |
| `web/src/app/todos/`, `web/src/features/todo/` | 03 |
| `web/src/app/ledger/`, `web/src/features/ledger/` | 04 |
| `supabase/functions/weather/`, `supabase/functions/notify/`, `web/src/features/{weather,notifications}/` | 05 |
| `supabase/functions/mcp/`, `web/src/features/mcp/`, `docs/mcp-connector.md` | 06 |
| `supabase/functions/gcal-sync/`, `web/src/features/google/` | 07 |
| `web/src/app/page.tsx`, `web/src/app/{settings,search,notifications}/`, `web/src/features/{dashboard,search,export,settings}/` | 08 |
| `design/`, `PRD.md`, `Sitemap.md` | 사용자만 (PRD는 사용자 승인 후 수정) |

- 소유권 밖 파일은 수정하지 않는다. 필요한 변경은 `REQUESTS.md`에 요청을 남기고 소유 세션이 처리한다.
- `package.json`은 공용이다. 의존성 추가는 허용하되 추가한 줄만 건드리고, 병합 충돌 시 양쪽 의존성을 모두 남긴다.
- `AGENTS.md`는 각 세션이 "실제 명령" 섹션에 **자기 영역 명령만 추가**한다.

## 5. 공통 개발 규약

### 브랜치·병합
- 세션마다 브랜치 `feat/<세션명>`(예: `feat/calendar`)과 `git worktree`를 쓴다.
  ```
  git worktree add ../06_calender-calendar -b feat/calendar
  ```
- 병합 전 `web/`에서 `npm run lint`와 `npm run build`를 통과시킨다. main으로는 PR로 병합한다.
- 커밋 메시지는 영어 한 줄 요약 + 필요하면 본문. 요구사항 ID를 넣는다(예: `CAL-6: add recurrence editor`).

### 마이그레이션
- 초기 스키마(전 테이블)는 01만 작성한다.
- 이후 변경은 각 세션이 `supabase/migrations/YYYYMMDDHHMMSS_<세션>_<설명>.sql`로 **새 파일만 추가**한다. 기존 파일은 수정하지 않는다.
- 새 테이블·컬럼에도 `user_id`와 RLS 정책을 반드시 둔다. 변경 후 `database.types.ts`를 재생성하고 커밋한다.

### 데이터 접근 규약 (01이 확정, 각 세션은 따른다)
- 브라우저/서버 supabase-js 클라이언트는 `web/src/lib/supabase/`의 것만 쓴다. 서비스 롤 키는 클라이언트에 두지 않는다.
- 화면 데이터는 TanStack Query로 읽고 쓴다. 쿼리 키는 `[영역, 대상, 파라미터]` 형태(예: `['events', range]`).
- 영역별 코드는 `web/src/features/<영역>/` 안에 `api.ts`(supabase 호출), `hooks.ts`(Query 훅), `components/`, `lib/`(순수 로직)로 둔다.
- 목업의 `web/src/lib/data.ts` 샘플은 이식하면서 해당 부분을 삭제한다. 마지막 세션이 끝나면 파일 자체를 지운다.
- 목업의 인라인 스타일은 이식하면서 Tailwind 클래스로 바꿔도 된다. 단 디자인(색·간격·폰트)은 유지한다. 색 토큰(라임/퍼플/경고/하늘)은 01이 CSS 변수로 정의한다.

### 제품 규칙 (AGENTS.md 요약 — 어기면 안 됨)
- 모든 테이블에 `user_id`와 RLS `user_id = auth.uid()`. Edge Function(MCP 포함)은 RLS가 보호해 주지 않으므로 쿼리에 토큰 소유자의 `user_id` 조건을 직접 넣는다.
- 금액은 정수 원(소수점·음수 불가), 부호는 `type`으로 결정. 계좌 잔액은 저장하지 않고 뷰로 계산.
- 시간은 `timestamptz`(UTC)로 저장하고 사용자 시간대(기본 Asia/Seoul)로 표시. 마감일·거래일은 `date`.
- 일정·할일은 소프트 삭제(`deleted_at`, 30일 후 영구 삭제), 가계부 거래는 확인 후 즉시 삭제.
- MCP 삭제 도구는 사용자 확인 필수, 일괄 삭제 도구 금지. `category`/`account`/`project`는 이름 또는 ID를 받고 모호하면 후보를 담은 오류.
- 반복 규칙은 RFC 5545 RRULE(`rrule` 라이브러리). 반복 수정은 "이번만 / 이후 전체 / 전체" 3가지로 제한.
- 비밀값(구글 client secret, 날씨 키, 토큰 암호화 키)은 Edge Function secrets에만. 코드·커밋·로그에 남기지 않는다.
- 문서와 사용자 노출 문구는 한국어.

### 작업 방식
- PRD ID와 우선순위 기준으로 구현한다. **P0 → P1 → P2** 순서를 지킨다.
- PRD §14 오픈 이슈에 걸린 결정(날씨 제공처, 동기화 기본값, OAuth 게시 상태, 알림 채널, MCP 인증 방식 등)은 임의로 확정하지 말고 사용자에게 확인한다. 권고안이 PRD에 있으면 그것을 기본으로 제안한다.
- 검증하지 않은 것을 "완료"라고 하지 않는다. 각 문서의 "완료 기준"을 실제로 실행해 확인한다.
- 세션 종료 전 자기 문서의 체크리스트를 갱신하고, 다음 세션이 알아야 할 것은 문서 맨 아래 "인수인계 메모"에 쓴다.

## 6. 세션 간 계약 요약

| 제공 → 사용 | 내용 |
|---|---|
| 01 → 전체 | 스키마·RLS·타입, supabase 클라이언트, 인증 가드, 레이아웃, Query Provider, `_shared/` |
| 02 → 05, 07, 06, 08 | `events` CRUD api, 반복 전개 유틸(`features/calendar/lib/recurrence.ts`), 시간대 유틸 |
| 03 → 06, 08 | `todos` api, 반복 할일 다음 주기 계산 |
| 04 → 05, 06, 08 | 거래/계좌/예산 api, SQL 함수 `budget_usage(month)`, 요약 쿼리 |
| 05 → 02, 08, 06 | `useWeather(date/range)` 훅, `weather` Edge 응답 형식, `notifications` 생성 헬퍼 |
| 06 → 08 | 토큰 발급/폐기/로그 조회 api(설정 MCP 탭) |
| 07 → 02, 08 | 구글 연결 상태/동기화 트리거 api, 일정 출처 구분 필드 |

## 7. 세션 시작 방법

1. 새 터미널에서 worktree를 만든다 (§5). 예: calendar 세션
   ```
   cd D:\chaai\06_calender
   git worktree add ..\06_calender-calendar -b feat/calendar
   cd ..\06_calender-calendar
   claude
   ```
2. 각 문서 맨 아래 "시작 프롬프트"를 붙여 넣는다.
3. 01은 단독으로 먼저 끝낸다. 01이 "계약 커밋 완료"를 알리면 02~06을 동시에 연다.

## 8. 사용자가 직접 해야 하는 것

세션이 대신할 수 없다. 해당 단계 전에 준비해 두면 막히지 않는다.
- Supabase 프로젝트 생성과 키 발급, `supabase login`/`supabase link` (01)
- Google Cloud 프로젝트, OAuth 클라이언트 ID/secret, 동의 화면을 프로덕션(미검증)으로 전환 (07)
- Vercel 프로젝트 연결과 환경변수 등록 (01·배포 시)
- 웹 푸시용 VAPID 키 생성 (05, 선택)
- PRD §14 오픈 이슈 중 미결 항목 결정
