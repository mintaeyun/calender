# MCP 커넥터 가이드 (Claude · ChatGPT)

Life Manager의 MCP 서버(일정·할일·가계부)를 Claude와 ChatGPT에서 쓰는 방법이다. 같은 내용이 앱의 **설정 > MCP 연결** 화면에도 있다.

- 서버 주소: `https://lmbmljlupqjcrgmrvqgl.supabase.co/functions/v1/mcp`
- 인증: **OAuth 2.1** (표준 방식). 앱을 연결하면 라이프 매니저의 승인 화면이 열리고, 서비스별 허용 범위를 고른다. 토큰을 직접 발급해 헤더에 넣는 방식은 보조 수단으로 남아 있다(Claude의 Request headers).
- 전송: Streamable HTTP (stateless, JSON 응답).

## 어떻게 동작하나

1. 앱(Claude/ChatGPT)이 서버에 요청하면 `401` + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` 로 인증 방법을 알려 준다.
2. 앱이 메타데이터를 읽는다: 보호 리소스 메타데이터(함수) → 인가 서버 메타데이터(웹 앱 루트 `/.well-known/oauth-authorization-server`).
3. 앱이 동적 클라이언트 등록(DCR, `/register`)으로 자신을 등록하고, 사용자를 웹 앱 `/oauth/authorize` 로 보낸다.
4. 사용자가 로그인 후 **서비스별 범위(없음/읽기/읽기·쓰기)** 를 고르고 승인하면 1회용 인가 코드가 앱으로 전달된다(PKCE S256 필수).
5. 앱이 `/token` 에서 액세스 토큰(1시간)과 리프레시 토큰(90일, 사용할 때마다 회전)을 받는다.
6. 연결은 설정 > MCP 연결의 **연결 목록**에 나타나며, 여기서 끊을 수 있다.

## Claude에 연결하기

1. claude.ai(웹) 또는 Claude 데스크톱에 로그인한다.
2. **Customize > Connectors > Add custom connector**.
3. 이름과 **MCP server URL**(위 서버 주소)을 입력한다.
4. 인증은 **Sign in now**, OAuth 클라이언트는 기본값(자동 등록 또는 Claude 기본 신원)을 두고 **Add**.
5. **Connect** → 라이프 매니저 승인 화면에서 로그인하고 범위를 고른 뒤 **허용하고 연결**.
6. 대화창 **+ > Connectors** 에서 켠다. 모바일은 같은 계정으로 등록된 커넥터를 쓴다.

Team/Enterprise는 Owner가 조직 설정 > Connectors 에서 추가한다.

**토큰 직접 사용(고급)**: 계정에 **Request headers** 입력란이 있으면 인증을 **No sign-in** 으로 두고 헤더 `authorization` 에 `Bearer lm_…`(설정에서 발급한 토큰)을 넣을 수 있다. 입력란은 베타라 일부 계정에만 보인다.

## ChatGPT에 연결하기

1. ChatGPT 웹(chatgpt.com)에 로그인한다. 커스텀 MCP 서버는 요금제·워크스페이스 설정에 따라 보이지 않을 수 있다(팀/회사 계정은 관리자 허용 필요).
2. **Plugins > + > Add custom MCP server** (메뉴 이름은 업데이트에 따라 달라질 수 있다).
3. 이름과 **Server URL**(위 서버 주소)을 입력한다.
4. 인증은 **OAuth**. 클라이언트 ID/시크릿은 비워 두면 자동 등록된다.
5. 위험 경고를 확인하고 **Create as a plugin** → 설치.
6. 연결을 시작하면 승인 화면이 열린다. 로그인 후 범위를 고르고 **허용하고 연결**.
7. 대화에서 플러그인을 켜고 쓴다. 쓰기 도구는 ChatGPT가 실행 전 확인을 물을 수 있다.

ChatGPT 커스텀 MCP 서버의 인증은 OAuth 또는 인증 없음만 지원한다(토큰 헤더 입력란 없음). **인증 없음** 으로 등록하면 서버가 401로 거절한다.

## 허용 범위

일정 · 할일 · 가계부를 각각 **없음 / 읽기 / 읽기·쓰기** 로 고른다.

- 읽기: 조회·검색·요약. 읽기·쓰기: 만들기·수정·완료·삭제.
- 삭제는 항상 앱이 사용자에게 먼저 확인하고 한 번에 하나만 지운다. 일괄 삭제 도구는 없다.
- 반복 일정의 수정·삭제는 웹에서 한다.
- **추천**: 처음에는 모두 읽기로 연결하고, 필요한 서비스만 나중에 읽기·쓰기로 올린다. 범위를 바꾸려면 연결을 끊고 다시 연결한다.

## 제공 도구

| 서비스 | 읽기 | 쓰기 |
|---|---|---|
| 일정 | list_events, search_events, find_free_time | create_event, update_event, delete_event |
| 할일 | list_todos | create_todo, update_todo, complete_todo, delete_todo |
| 가계부 | list_transactions, get_summary, list_accounts | add_transaction, update_transaction, delete_transaction |
| 공통 | get_weather, get_today_overview | — |

모든 도구에는 읽기/삭제 주석(`readOnlyHint`, `destructiveHint`)이 붙어 있어 앱이 읽기는 확인 없이, 삭제는 확인을 거쳐 실행한다.

## 사용 예시

- 일정: "이번 주 일정 알려줘", "내일 오후 3시에 치과 일정 잡아줘", "다음 주에 1시간 비는 시간 찾아줘"
- 할일: "오늘 마감인 할일 보여줘", "보고서 초안 할일 추가해줘, 금요일까지", "청소 할일 완료로 바꿔줘"
- 가계부: "점심 12,000원 식비 신한카드로 기록해줘", "이번 달 식비 얼마 썼어?", "계좌별 잔액 알려줘"
- 한 번에: "오늘 브리핑해줘"

## 연결 관리

- 연결 목록: OAuth 연결(앱 이름 표시)과 직접 발급한 토큰이 함께 보인다. **연결 끊기/폐기** 를 누르면 즉시 중단되고 되돌릴 수 없다.
- 직접 발급한 토큰은 발급 직후 한 번만 전체 값을 볼 수 있다. DB에는 해시만 저장된다.
- 호출 한도: 연결(토큰)당 분당 60회. 모든 호출은 설정의 "최근 호출"에 기록된다(입력은 요약본).

## 문제 해결

| 증상 | 원인·조치 |
|---|---|
| 401 / 연결이 끊김 | 연결이 폐기·만료됐거나 토큰이 틀림. 앱에서 커넥터를 다시 연결(직접 토큰은 새로 발급해 재등록) |
| 429 | 분당 60회 초과. 응답의 Retry-After 초 뒤 재시도 |
| "후보: …" 오류 | 카테고리·계좌·프로젝트 이름이 모호하거나 없음. 후보 중 하나를 지정 |
| 도구가 안 보임 | 허용 범위에 해당 서비스가 없음. 범위를 넓혀 다시 연결 |
| 승인 화면이 안 열림 | 웹 앱이 공개 https 주소에 배포돼 있어야 한다. 로컬 개발 주소는 외부 앱이 접근할 수 없음 |

## 배포 (운영자용)

순서: **마이그레이션 → 웹 앱 배포 → 함수 배포**. 원격 DB 변경과 배포는 사용자 승인 후에만 한다.

1. `supabase login`, `supabase link --project-ref lmbmljlupqjcrgmrvqgl`
2. 마이그레이션: `supabase db push` — OAuth 용 `20261021200000_mcp_oauth.sql` 포함(oauth_clients, oauth_codes, mcp_tokens 확장, 열 권한 변경, 정리 함수·cron).
3. 웹 앱을 공개 주소(Vercel 등)에 배포한다. 이 주소가 OAuth 발급자(issuer)이며 `/.well-known/oauth-authorization-server` 와 `/oauth/authorize` 를 제공한다. 미들웨어가 비로그인 상태에서도 `/.well-known/*`, `/oauth/authorize`(화면이 로그인 안내를 직접 표시) 를 통과시켜야 한다.
4. 함수 secret: `supabase secrets set APP_BASE_URL=https://<웹 앱 주소>` (끝 슬래시 없음). 기본값은 `http://localhost:3000` 이므로 배포 환경에서는 반드시 설정한다.
5. 함수 배포: `supabase functions deploy mcp --no-verify-jwt` (자체 인증이므로 JWT 검증 끔). `SUPABASE_URL` 등은 자동 주입된다.

## 검증 체크리스트 (배포 후)

- [ ] `GET /functions/v1/mcp/health` → `{"ok":true}`
- [ ] 토큰 없이 `POST /functions/v1/mcp` → 401 + `WWW-Authenticate: Bearer resource_metadata="…"`
- [ ] `GET /functions/v1/mcp/.well-known/oauth-protected-resource` 와 `GET <웹 앱>/.well-known/oauth-authorization-server` 가 JSON을 돌려주고 issuer 가 `APP_BASE_URL` 과 같다
- [ ] `POST /register`(redirect_uris 포함) → `client_id` 반환. 잘못된 redirect(예: http 비루프백)는 거부
- [ ] MCP Inspector(`npx @modelcontextprotocol/inspector`)에서 OAuth 흐름: 승인 화면 → 토큰 교환 → `tools/list`, `tools/call`
- [ ] Claude 커스텀 커넥터(OAuth)로 연결, 도구 목록 표시, "내 계좌 잔액 알려줘" 동작
- [ ] ChatGPT 커스텀 MCP 서버(OAuth)로 연결, 도구 목록 표시, 읽기 도구는 확인 없이 실행
- [ ] 읽기 범위로 승인한 연결은 `tools/list` 에 쓰기·삭제 도구가 없고, 직접 호출해도 거부(`mcp_logs` 에 `denied`)
- [ ] 설정 > MCP 연결에 OAuth 연결이 앱 이름과 함께 나타나고, "연결 끊기" 직후 같은 연결의 호출이 401
- [ ] 액세스 토큰 만료(1시간) 후 리프레시로 자동 갱신되어 계속 동작. 옛 리프레시 토큰 재사용은 거부되고 연결이 폐기됨
- [ ] 같은 연결로 1분에 61번 호출 → 61번째 429 + `Retry-After`. 모든 호출이 `mcp_logs` 에 남는다
- [ ] 다른 사용자의 id(할일·거래)를 넣어 조회·수정·삭제 → 찾을 수 없음
- [ ] 모호한 카테고리 이름 → 후보가 담긴 오류. "점심 12,000원 식비 신한카드로 기록해줘" → 웹 내역에 "Claude에서 기록"으로 표시
- [ ] 반복 할일 `complete_todo` → 다음 주기 생성(중복 없음). `delete_*` 는 id 하나만 받고 앱이 삭제 전 확인을 묻는다

## 참고

- Claude 문서: Add a connector that isn't in the directory (claude.com/docs/connectors/custom/remote-mcp)
- OpenAI 문서: Add custom MCP server (developers.openai.com/api/docs/guides/custom-mcp-server)
- 표준: OAuth 2.1 초안, RFC 7636(PKCE), RFC 7591(DCR), RFC 8414(AS 메타데이터), RFC 9728(보호 리소스 메타데이터), RFC 8707(resource), RFC 7009(폐기)
