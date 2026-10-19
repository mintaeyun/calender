# 라이프 매니저

일정 · 할일 · 가계부(KRW)를 하나로 묶은 1인용 개인 매니저입니다. 구글 캘린더 연동, 날씨, 그리고 내 Claude가 세 서비스를 읽고 쓸 수 있는 MCP 서버를 포함합니다.

- 프론트엔드: Next.js(App Router) + TypeScript + Tailwind, TanStack Query, supabase-js (`web/`)
- 백엔드: Supabase — Postgres(RLS), Auth, Edge Functions(Deno), pg_cron (`supabase/`)
- 기획 문서: `PRD.md`(요구사항·데이터 모델), `Sitemap.md`(메뉴 구조), 개발 규칙은 `AGENTS.md`

## 시작하기

필요한 것: Node.js 22 이상, Supabase 프로젝트(클라우드), 선택으로 Google Cloud 프로젝트(구글 로그인·캘린더 연동).

```bash
cd web
npm install
cp .env.example .env.local   # 값을 채운다 (아래 환경변수)
npm run dev                  # http://localhost:3000
```

### 환경변수 (`web/.env.local`)

| 이름 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개(publishable) 키. 기존 anon 키는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로도 동작 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (선택) 웹 푸시 공개키 |

서비스 롤 키는 브라우저에 노출되므로 `web/`의 환경변수에 넣지 않습니다. 구글 client secret, 날씨·푸시 비밀키, 토큰 암호화 키는 Supabase Edge Function secrets에만 둡니다.

### 명령 (`web/`에서 실행)

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 서버 / 빌드 / 빌드 결과 실행 |
| `npm run lint` | 타입 검사(`tsc --noEmit`) |
| `npm test` | 화면 쪽 순수 로직 테스트(vitest). 단일 파일은 `npx vitest run <경로>` |
| `npm run test:functions` | Edge Function 순수 로직 테스트(Deno 불필요) |
| `npm run db:*` | 로컬 Supabase(Docker 필요): `db:start`, `db:reset`, `db:types`, `db:test` |

## 배포

### Supabase

1. `supabase login` 후 `supabase link --project-ref <ref>`
2. 마이그레이션 적용: `supabase db push` (원격 DB를 바꾸므로 확인 후 실행)
3. Edge Function 배포: `supabase functions deploy <이름>` — `mcp`는 자체 토큰으로 인증하므로 `--no-verify-jwt`(또는 `config.toml`의 `[functions.mcp] verify_jwt = false`)
4. secrets 등록: 구글 연동(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY`), 웹 푸시(`VAPID_*`) 등 각 기능 문서 참고
5. Auth > URL 설정에 사이트 URL과 리디렉션 URL을 등록

구글 OAuth 동의 화면이 "테스트" 상태이면 refresh token이 7일 후 만료됩니다. 개인용이어도 프로덕션(미검증)으로 전환하세요.

### Vercel (프론트엔드)

`web/`를 루트 디렉터리로 프로젝트를 연결하고 위 환경변수를 등록합니다. 빌드 명령은 `npm run build`입니다.

## Claude와 연결 (MCP)

설정 > MCP 연결에서 토큰을 발급하고, Claude의 커스텀 커넥터에 서버 주소와 `Authorization: Bearer lm_…` 헤더를 등록합니다. 단계별 안내와 배포 후 검증 체크리스트는 [`docs/mcp-connector.md`](docs/mcp-connector.md)를 참고하세요.

## 디렉터리

```
design/      디자인 원본 (수정하지 않음)
docs/        MCP 커넥터 가이드, 개발 분담 문서
supabase/    마이그레이션, RLS 테스트, Edge Functions (mcp, weather, notify, gcal-sync, _shared)
web/         Next.js 앱 (src/app 라우트, src/features/<영역> 기능, src/lib 공용)
```

## 상태

기능별 구현 현황과 알려진 제약은 `docs/agents/`의 각 영역 문서(인수인계 메모)에 있습니다. 실서버·실브라우저 검증이 끝나지 않은 항목은 해당 메모에 명시되어 있습니다.
