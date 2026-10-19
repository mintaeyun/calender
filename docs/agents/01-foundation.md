# 01. foundation — 기반 (스키마 · 인증 · 앱 셸)

> 먼저 `00-overview.md`를 읽는다. 이 세션이 끝나야 다른 세션이 시작할 수 있다. **웨이브 1, 단독 선행.**

## 목표
다른 모든 세션이 의존하는 "계약"을 가장 먼저, 가장 작게, 정확하게 만든다: DB 스키마·RLS, 인증, 라우팅·레이아웃, 데이터 접근 규약. 기능 구현은 하지 않는다.

## 선행 조건 / 사용자 준비
- 사용자: Supabase 프로젝트 생성, `supabase login`, 프로젝트 ref, anon/service 키. (없으면 사용자에게 요청한다. 로컬 `supabase start`로 먼저 개발해도 된다.)
- 의존 세션: 없음.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| AUTH-1 | 이메일+비밀번호, 구글 로그인 | P0 |
| AUTH-2 | 비로그인 시 모든 페이지에서 로그인으로 이동 | P0 |
| AUTH-4 | 가입 시 기본 카테고리·기본 계좌("현금") 자동 생성 | P0 |
| AUTH-3 | 비밀번호 재설정, 로그아웃, 계정 삭제 | P1 |
| AUTH-5 | 허용 이메일 화이트리스트(옵션) | P1 |
| (기반) | PRD §5 전 테이블·RLS·뷰, 타입 생성, 라우팅·셸 | M1 |

## 소유 경로
`supabase/` (config, migrations 초기분), `supabase/functions/_shared/`, `web/src/lib/supabase/`, `web/src/app/(auth)/`, `web/src/app/layout.tsx`, `web/src/components/layout/`, `web/src/middleware.ts`, `web/.env.example`

## 작업 목록

### A. Supabase 세팅 (P0)
- [x] `supabase init`, `supabase/config.toml` 정리(Auth: 이메일+Google, 사이트 URL, 리다이렉트 URL).
- [x] 로컬 개발 절차(`supabase start`/`db reset`)를 `AGENTS.md`에 기록.

### B. 초기 스키마 마이그레이션 (P0) — 가장 중요
`supabase/migrations/YYYYMMDDHHMMSS_init_schema.sql` 한 번에(또는 논리적으로 나눈 `_init_*` 여러 개) 작성한다. PRD §5의 **모든 테이블**:
`profiles, calendars, events, event_reminders, google_connections, todo_projects, todos, todo_items, tags, todo_tags, accounts, categories, transactions, receipts, budgets, recurring_payments, weather_cache, notifications, notification_settings, mcp_tokens, mcp_logs`
- [x] 공통 컬럼: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `created_at`, `updated_at`(트리거로 자동 갱신). `weather_cache`는 사용자 공용 캐시이므로 `user_id` 대신 RLS 정책을 별도로 정의(인증 사용자 읽기, 쓰기는 service role).
- [x] **RLS**: 모든 테이블 `enable row level security` + `user_id = auth.uid()`의 select/insert/update/delete 정책. 자식 테이블(`event_reminders`, `todo_items`, `todo_tags`, `receipts`)도 `user_id`를 가진다(부모와 일치하도록 체크).
- [x] 금액 컬럼: `bigint check (amount > 0)`. `transactions.type in ('income','expense','transfer')`, 이체는 `to_account_id` 필수·다른 거래는 null이라는 check.
- [x] 시간은 `timestamptz`, 마감일·거래일은 `date`.
- [x] 소프트 삭제: `events.deleted_at`, `todos.deleted_at`. 조회 편의를 위한 인덱스(`user_id, start_at`, `user_id, due_date`, `user_id, date` 등).
- [x] **계좌 잔액 뷰** `account_balances`: `initial_balance + 수입 − 지출 ± 이체`. 잔액을 저장하지 않는다. 뷰는 `security_invoker = true`로 RLS를 따르게 한다.
- [x] 반복 일정 예외 지원 컬럼(PRD §5에는 없으므로 **추가 결정 사항**, 구현 후 `REQUESTS.md` 결정 기록에 남긴다): `events.recurring_event_id uuid null`(예외 인스턴스가 가리키는 원본), `events.original_start_at timestamptz null`, `events.exdates timestamptz[] default '{}'`. 02·07이 사용한다.
- [x] `events.source`/`google_*` 필드 존재 확인: `calendars.source`, `events.google_event_id`, `google_etag`.
- [x] 색상·카테고리 등 enum은 check 제약 또는 Postgres enum으로. 변경이 쉬운 쪽(check)을 권장.
- [x] 소프트 삭제 정리 pg_cron 잡(매일): `deleted_at < now() - interval '30 days'` 영구 삭제. (pg_cron 확장 활성화 포함.)

### C. 가입 트리거 (AUTH-4, P0)
- [x] `auth.users` insert 트리거 → `profiles`(timezone `Asia/Seoul`, theme `system`, week_start `monday`), `notification_settings` 기본값, 기본 `accounts`("현금", cash, 초기잔액 0), 기본 `categories`(지출: 주거·식비·쇼핑·교통·문화·기타 / 수입: 급여·부수입·이자, 목업 `lib/data.ts`의 색상 참고), 기본 `calendars`(업무·개인·운동 — 분류 목업 참고), 기본 `todo_projects`(업무·생활·여행·운동).
- [x] 트리거 함수는 `security definer`, `search_path` 고정.
- [x] 허용 이메일 화이트리스트(AUTH-5): `allowed_emails` 테이블 또는 Auth hook으로 가입 차단. 옵션이므로 비어 있으면 모두 허용. 환경변수/테이블 중 선택은 사용자에게 확인.

### D. 타입 생성 (P0)
- [x] `supabase gen types typescript` → `web/src/lib/supabase/database.types.ts`. 재생성 명령을 `web/package.json` 스크립트 `db:types`로 추가.

### E. 클라이언트·인증 (P0)
- [x] `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query` 설치.
- [x] `web/src/lib/supabase/{client.ts,server.ts,middleware.ts}`: 브라우저/서버(쿠키)/미들웨어용 클라이언트.
- [x] `web/src/middleware.ts`: 세션 갱신 + 비로그인 시 `/login`으로 리다이렉트(AUTH-2). 로그인 상태에서 `/login` 접근 시 `/`로.
- [x] `/login` 화면: 목업 `components/screens/Login.tsx`를 이식. 이메일/비밀번호 로그인, 가입, Google 로그인(OAuth 리다이렉트), 오류 메시지(한국어). 콜백 라우트 `/auth/callback`.
- [x] 로그아웃(헤더 아바타 메뉴).
- [x] (P1, AUTH-3; 계정 삭제 UI 배치는 08) 비밀번호 재설정 메일 요청·재설정 화면, 계정 삭제. 계정 삭제는 `on delete cascade`로 데이터가 지워지는지, 구글 토큰 revoke는 07의 함수를 호출하도록 훅 지점만 남긴다(07 완료 전엔 TODO 주석 + `REQUESTS.md`).

### F. 앱 셸·라우팅 (P0)
- [x] 목업의 단일 `App.tsx`를 App Router 경로로 분리(PRD §8): `/`, `/calendar`, `/todos`, `/ledger`(+`/calendar`,`/stats`,`/budget`,`/recurring`,`/accounts`), `/search`, `/notifications`, `/settings/[tab]`. 각 페이지는 **빈 껍데기**(제목+"준비 중")로 두고 소유 세션이 채운다. 소유 세션 폴더(`web/src/app/calendar` 등)와 중복되지 않게 폴더만 만들고 `page.tsx`는 최소 내용.
- [x] `web/src/components/layout/`: 헤더(로고·내비·검색·알림 배지·아바타), 내비 활성 표시. 목업 `App.tsx`의 헤더를 이식. 알림 배지는 `unreadCount` prop/훅 자리만 둔다(05가 채움).
- [x] 빠른 추가 모달 호출 지점: 전역 컨텍스트 `QuickAddProvider`(`openQuick('tx'|'ev'|'todo')`). 모달 내용은 각 영역 세션이 `features/*/quick-add.tsx`로 제공해 등록하는 방식(레지스트리). 01은 레지스트리와 빈 모달 틀만 만든다. (DASH-5는 08이 연결.)
- [x] `QueryClientProvider`, 전역 스타일, 색 토큰 CSS 변수(`--lime`, `--purple`, `--danger`, `--sky` 등, 목업 값 `oklch(0.9 0.19 125)` 등 그대로), 폰트(Pretendard, 여기어때잘난체) 이식. 다크 우선(라이트 테마는 P1이므로 토큰 구조만 대비).
- [x] 시간 유틸 `web/src/lib/time.ts`: UTC↔사용자 시간대 변환, 날짜 포맷(한국어). 02·05·06이 공통으로 쓴다. 사용자 시간대는 `profiles.timezone`에서 읽는 훅 `useProfile()` 제공.

### G. `_shared` (Edge Function 공통, P0)
- [x] `supabase/functions/_shared/{supabase.ts,cors.ts,errors.ts,auth.ts,time.ts}`: service-role 클라이언트 생성, CORS, 오류 응답 형식, JWT 검증, 시간대 유틸. 다른 세션의 함수가 import한다.

### H. 테스트·문서 (P0)
- [x] RLS 테스트: 사용자 A/B를 만들어 A의 행을 B가 읽기·수정·삭제 못 함을 모든 테이블에 대해 확인하는 SQL 또는 스크립트(`supabase/tests/rls.sql` 또는 `web` 스크립트). 실행 방법을 `AGENTS.md`에 기록.
- [x] `web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (서비스 키는 절대 포함 금지).
- [x] `AGENTS.md`의 "프로젝트 상태"와 "예정 아키텍처"를 실제 상태로 갱신하고 명령(DB 리셋, 타입 생성, RLS 테스트) 추가.

## 제공하는 계약 (다른 세션이 의존)
- 스키마·RLS·`account_balances` 뷰, `database.types.ts`
- `lib/supabase/*` 클라이언트, 인증 가드, `useProfile()`, `lib/time.ts`
- 라우트 껍데기, 헤더·레이아웃, `QuickAddProvider` 레지스트리, Query Provider
- `supabase/functions/_shared/`
- 가입 시 기본 데이터

## 지켜야 할 규칙 · 함정
- 서비스 롤 키를 `NEXT_PUBLIC_*`나 클라이언트 코드에 두지 않는다.
- 뷰는 기본이 `security definer` 동작이라 RLS를 우회한다 → 반드시 `security_invoker = true`.
- `security definer` 함수는 `search_path`를 고정한다.
- 스키마를 한 번에 정확히 만든다. 이후 변경은 추가 마이그레이션만 가능하므로, 02~07이 필요한 컬럼(구글 매핑, 반복 예외, MCP 토큰 scopes, 알림 `scheduled_at` 등)이 PRD §5에 모두 있는지 먼저 점검한다.
- 이체 거래의 `to_account_id`, 금액 양수 제약 등 AGENTS.md 데이터 규칙을 DB 제약으로도 건다.

## 완료 기준
- [ ] `supabase db reset`이 오류 없이 끝나고 가입 시 기본 데이터가 생성된다. (Docker 불가 → PGlite 로 대체 확인함. 클라우드 db push 후 재확인 필요)
- [x] RLS 테스트가 전 테이블에서 통과한다. (PGlite, supabase/tests/rls.sql — 클라우드 적용 후 SQL 편집기 재실행 필요)
- [ ] 로그인 전에는 어느 경로든 `/login`으로 가고, 이메일·Google 로그인 후 `/`에 빈 대시보드(셸)가 보인다. (M1 완료 기준)
- [x] `npm run lint`, `npm run build` 통과.
- [x] `main`에 병합하고 `00-overview.md`의 "계약 커밋 완료"를 사용자에게 알린다.

## 인수인계 메모
- 2026-10-14 병합(main 353c0f4). 결정·추가 컬럼은 REQUESTS.md 결정 기록 참고.
- **검증 범위**: PGlite(PG17 WASM)로 마이그레이션 3개 + `supabase/tests/rls.sql` 통과, `npm run lint`/`build` 통과, 미들웨어 리다이렉트(비로그인 → /login) curl 확인, `lib/time.ts` 단위 검증. **미검증**: `supabase db reset`(Docker 없음), 실제 이메일/Google 로그인, pg_cron 실등록, `db:test`(supabase db query) 명령 자체, Deno 타입 검사(_shared).
- `database.types.ts`는 Docker가 없어 PGlite 기반 임시 생성기로 만들었다. Docker 가능해지면 `npm run db:types`로 재생성해 교체한다(형식 동일 목표, 차이는 diff로 확인).
- 데이터 접근: `createClient()`(lib/supabase/client) 쓰기 전 `profiles` 등은 RLS가 user_id 를 강제한다. insert 시 `user_id`를 반드시 넣어야 한다(기본값 없음; 필요하면 후속 마이그레이션으로 default auth.uid() 추가 가능).
- 빠른 추가: 각 영역은 `features/<영역>/quick-add.tsx`의 `QuickAddForm`만 구현. 열기는 `useQuickAdd().openQuick("tx"|"ev"|"todo")`.
- 시간: `lib/time.ts`(dateKey, startOfDayUtc, zonedToUtc, formatDateKo …), 시간대는 `useTimezone()`. Edge Function은 `_shared/time.ts`.
- 알려진 제약: 로그인 폼은 Suspense 때문에 SSR HTML이 비어 있다(하이드레이션 후 표시). 라이트 테마는 토큰 구조만. `priority`는 high/medium/low.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/01-foundation.md 를 읽고, 01 foundation 세션을 진행해줘.
PRD.md §5(데이터 모델)와 AGENTS.md의 규칙을 기준으로 하고, 문서의 작업 목록 순서(A→H)와 완료 기준을 따라줘.
Supabase 프로젝트 키가 필요하면 나에게 요청하고, 먼저 로컬 supabase로 진행해도 돼.
계약(스키마·타입·셸)이 끝나면 main에 병합하고 알려줘.
```

- 2026-10-19 추가: publishable 키 우선(env.ts, ANON 폴백) / `[functions.mcp] verify_jwt = false` 반영 / 계정 삭제 시 영수증 파일(Storage) 먼저 삭제 구현(lib/auth.ts) / `components/layout/AccountActions.tsx`(ChangePasswordForm, DeleteAccountButton)는 08이 설정 > 프로필 탭에 배치. 구글 토큰 revoke 는 07 몫(TODO 주석). 허용 이메일은 SQL로 관리: `insert into allowed_emails(email) values ('me@example.com')` (비어 있으면 모두 허용).
