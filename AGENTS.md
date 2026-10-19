# AGENTS.md

AI 코딩 에이전트(Claude Code, Codex 등)가 이 저장소에서 작업할 때 따르는 공통 지침. 도구 중립적인 내용은 이 파일에만 쓴다. `CLAUDE.md`는 이 파일을 `@AGENTS.md`로 불러오고, `Agent.md`는 이 파일을 가리키는 포인터다. 같은 내용을 다른 파일에 복사하지 않는다.

## 프로젝트 상태

기획 문서 + 기반(스키마·인증·앱 셸) 구축 단계. `supabase/`(마이그레이션·RLS·테스트·Edge Function 공용 코드)와 `web/`(Next.js)가 있다. 각 영역 화면은 껍데기이며 기능은 영역별 세션이 채운다(진행 방식은 `docs/agents/00-overview.md`).

- `design/` — Claude Design에서 내려받은 원본(`Life Manager App.dc.html`, `support.js`). 참고용이며 수정하지 않는다.
- `web/` — 위 디자인을 옮긴 Next.js(App Router) + TypeScript 앱. 프레임워크는 Next.js로 확정(PRD §14-3). 라우트는 `src/app/`(미들웨어가 비로그인을 `/login`으로 보냄), 공통 레이아웃·빠른 추가 모달은 `src/components/layout/`, supabase 클라이언트·타입은 `src/lib/supabase/`, 시간 유틸 `src/lib/time.ts`, 프로필 훅 `src/lib/profile.ts`. 영역 코드는 `src/features/<영역>/`. 목업 화면(`src/components/screens/`)과 샘플 데이터(`src/lib/data.ts`)는 이식 참고용이며 이식하면서 지운다. 색은 `globals.css`의 CSS 변수/Tailwind 토큰(`bg-surface`, `text-lime` 등).
- 명령(`web/`에서 실행): `npm run dev` 개발 서버, `npm run build` 빌드, `npm run lint` 타입 검사(`tsc --noEmit`).
- 테스트(`web/`에서 실행): `npm test` 전체(vitest), 단일 파일은 `npx vitest run src/features/calendar/lib/recurrence.test.ts`, 이름 필터는 `npx vitest run -t "이후 전체"`. 테스트는 `src/**/*.test.ts`(순수 로직 위주).
- DB 명령(`web/`에서 실행, Docker 필요): `npm run db:start`(로컬 Supabase 시작, 출력된 URL·anon key를 `web/.env.local`에 — 형식은 `web/.env.example`), `npm run db:reset`(마이그레이션 전체 재적용), `npm run db:types`(`database.types.ts` 재생성, 마이그레이션을 바꾸면 반드시 실행), `npm run db:test`(`supabase/tests/rls.sql`: RLS·제약·기본 데이터 검증).
- MCP 함수(Docker·Deno 없이): 테스트는 위 `npm run test:functions`(`supabase/functions/mcp/lib/*.test.ts`), 타입 점검은 저장소 루트에서 `web/node_modules/.bin/tsc -p supabase/functions/mcp/typecheck/tsconfig.json`(Deno·supabase-js는 스텁 선언). 실제 구동 검증은 클라우드 배포 후(`docs/mcp-connector.md` 체크리스트).
- 원격(Supabase 클라우드, Docker 불필요; `supabase login`·`supabase link` 된 체크아웃에서): `npm run db:types:remote`(원격 기준 타입 재생성, 실패 시 기존 파일 유지), `npm run db:test:remote`(RLS 테스트를 원격에서 실행 — 트랜잭션 안에서 돌고 rollback 하므로 데이터가 남지 않는다). 마이그레이션 적용은 `npx supabase db push --workdir ..` (원격 변경이므로 사용자 승인 후).
- 단위 테스트(`web/`에서 실행, vitest): `npm test` 전체, `npx vitest run src/features/todo/lib/due.test.ts` 단일 파일, `npx vitest run -t "이름"` 단일 케이스. 순수 로직은 `features/<영역>/lib/*.test.ts`.
- Edge Function 순수 로직 테스트(`web/`에서 실행, Deno 불필요): `npm run test:functions`(`supabase/functions/**/*.test.ts`). Edge 엔트리(`index.ts`)는 Deno 전용이라 Node에서 실행하지 않는다.
- gcal-sync 함수: 순수 로직 테스트는 위 `npm run test:functions`(`supabase/functions/gcal-sync/lib/*.test.ts`), 타입 점검은 저장소 루트에서 `web/node_modules/.bin/tsc -p supabase/functions/gcal-sync/typecheck/tsconfig.json`. 배포는 `npx supabase functions deploy gcal-sync`(secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENC_KEY=`openssl rand -base64 32`, 선택 ALLOWED_RETURN_ORIGINS). 구글 콘솔 리디렉션 URI: `<SUPABASE_URL>/functions/v1/gcal-sync/oauth/callback`. 실제 연결·동기화 검증은 배포 후.
- 마이그레이션은 `supabase/migrations/`에 새 파일만 추가한다(`YYYYMMDDHHMMSS_<세션>_<설명>.sql`). 초기 스키마 `*_init_*`는 수정하지 않는다.
- Google 로그인은 `supabase/config.toml`의 `[auth.external.google]`을 켜고 `supabase/.env`에 클라이언트 ID/secret을 넣어야 동작한다.

- `PRD.md` — 요구사항(ID: AUTH-, DASH-, CAL-, TODO-, LED-, WX-, GCAL-, MCP-, NOTI-), P0/P1/P2 우선순위, 데이터 모델, 마일스톤(M1–M6), 오픈 이슈(§14)
- `Sitemap.md` — 메뉴 구조와 기능 개요

문서는 한국어로 작성한다. 새 문서와 사용자 노출 문구도 한국어로 쓴다. `PRD.md`와 `Sitemap.md`는 서로 일치해야 하므로 한쪽을 바꾸면 다른 쪽도 갱신한다.

## 제품

일정, 할일, 가계부(KRW)를 하나로 묶은 1인용 개인 라이프 매니저. 구글 캘린더 동기화, 날씨, 그리고 사용자의 Claude가 세 서비스를 읽고 쓸 수 있는 MCP 서버를 포함한다.

## 예정 아키텍처 (PRD.md 기준)

- **백엔드**: Supabase 단독 — Postgres, Auth, Edge Functions(Deno/TS), Storage, pg_cron. Edge Function은 `gcal-sync`, `weather`, `mcp`, `notify`. 모든 비밀값(구글 client secret, 날씨 키, 토큰 암호화 키)은 Edge Function secrets에만 두고 클라이언트에 노출하지 않는다.
- **프론트엔드**: Next.js(App Router) + TypeScript + Tailwind/shadcn, TanStack Query + supabase-js, Vercel 배포 (제안안, 미확정 — PRD §10, §14)
- **MCP 서버**: 원격 Streamable HTTP, Supabase Edge Function에서 `@modelcontextprotocol/sdk`로 호스팅. 개인 API 토큰으로 인증하며(해시만 `mcp_tokens`에 저장, 발급 시 1회 표시), 서비스별 읽기/읽기·쓰기 범위, 호출 제한, 모든 호출의 `mcp_logs` 기록을 갖춘다.
- **날씨**: 외부 API를 서버에서만 호출하고 `weather_cache`에 30~60분 캐시한다. `WeatherProvider` 추상화 뒤에 두어 Open-Meteo로 시작하고 기상청으로 교체 가능하게 한다.
- **구글 캘린더**: OAuth refresh token은 암호화 저장. syncToken 기반 증분 동기화(410이면 전체 재동기화). `events.google_event_id`/`google_etag`로 매핑, 충돌 시 최근 `updated` 우선 + 로그. 기본은 가져오기 전용, 양방향은 옵션. 동기화 대상은 일정뿐이며 할일·가계부는 제외한다.

## 반드시 지킬 규칙

- 모든 테이블에 `user_id`와 RLS `user_id = auth.uid()`를 적용한다. MCP는 서버에서 실행되어 RLS가 보호해 주지 않으므로, 토큰 소유자의 `user_id` 조건을 쿼리에 직접 넣는다.
- 금액은 정수 원 단위(소수점·음수 불가)이며 부호는 `type`(income/expense/transfer)으로 결정한다. 계좌 잔액은 `initial_balance` + 거래 합계로 계산하고 저장하지 않는다.
- 시간은 `timestamptz`(UTC)로 저장하고 사용자 시간대(기본 Asia/Seoul)로 표시한다. 마감일과 거래일은 `date`다.
- 일정·할일은 동기화 때문에 소프트 삭제(`deleted_at`, 30일 후 영구 삭제)하고, 가계부 거래는 확인 후 즉시 삭제한다.
- MCP 삭제 도구는 사용자 확인이 필수이고 일괄 삭제 도구는 만들지 않는다. `category`/`account`/`project` 입력은 이름 또는 ID를 받으며, 모호하면 후보를 담은 오류를 돌려준다.
- 반복 규칙은 구글과 호환되도록 RFC 5545 RRULE(`rrule` 라이브러리)을 쓴다. 반복 수정은 "이번만 / 이후 전체 / 전체" 3가지로 제한한다.

## 알려진 함정

구글 OAuth가 "테스트" 상태면 refresh token이 7일 후 만료된다. 개인용이라도 프로덕션(미검증) 상태로 전환해야 하며, 토큰 만료 시 동기화가 재연결 안내를 표시해야 한다.

## 작업 방식

- 요구사항을 구현할 때 PRD의 ID(예: `GCAL-6`)와 우선순위를 기준으로 하고, P0 → P1 → P2 순서를 지킨다.
- PRD §14 오픈 이슈에 걸린 결정은 임의로 확정하지 말고 사용자에게 확인한다.
- 프로젝트를 세팅하면 이 파일에 실제 빌드/린트/테스트 명령(단일 테스트 실행법 포함)을 추가한다.
