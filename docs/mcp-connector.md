# MCP 커넥터 등록 가이드

Life Manager의 MCP 서버를 Claude의 커스텀 커넥터로 등록하는 방법이다. (초안 — 배포 전이라 아래 URL은 아직 동작하지 않는다)

## 인증 방식 (확정: 개인 토큰 + Request headers)

- 서버는 `Authorization: Bearer lm_…` 헤더로 인증한다. 토큰은 설정 > MCP 탭에서 발급한다(원문은 발급 시 1회만 표시, DB에는 해시만 저장).
- Claude 커스텀 커넥터는 OAuth가 기본이다. 고정 토큰은 **No sign-in** 으로 두고 **Request headers** 에 넣는다. 이 항목은 베타라 일부 계정에만 보인다(사용자 계정에는 확인됨).
- 헤더 입력란이 없는 계정이면 이 방식은 커넥터에서 쓸 수 없다. 그 경우 Claude Code·Desktop 설정 파일 방식을 쓰거나 OAuth 지원을 추가해야 한다.
- 토큰을 URL 쿼리에 넣는 방식은 쓰지 않는다(로그 유출 위험).

## 등록 단계 (Claude 웹/데스크톱, Free·Pro·Max)

1. 설정 > MCP 탭에서 새 토큰을 발급한다. 이름과 서비스별 범위(일정/할일/가계부 × 읽기 / 읽기·쓰기)를 고르고, 표시된 `lm_…` 값을 복사한다. 창을 닫으면 다시 볼 수 없다.
2. Claude에서 **Customize > Connectors > Add custom connector** 를 연다.
3. **MCP server URL** 에 서버 주소(`https://lmbmljlupqjcrgmrvqgl.supabase.co/functions/v1/mcp`)를 입력한다.
4. **Authentication** 은 **No sign-in** 을 고른다.
5. **Request headers** 를 열고 헤더 이름 `authorization`, 값 `Bearer lm_…`(Bearer와 공백 포함)을 넣고 Required로 둔다.
6. **Add** 를 누른다. 등록 후에는 인증 설정을 바꿀 수 없으니, 바꾸려면 삭제하고 다시 추가한다.
7. 대화창의 **+ > Connectors** 에서 켠다.

Team/Enterprise는 Owner가 조직 설정 > Connectors 에서 추가한다. 모바일은 웹/데스크톱에서 등록한 커넥터를 같은 계정으로 쓴다.

## 제공 도구

| 서비스 | 읽기 | 쓰기 |
|---|---|---|
| 일정 | list_events, search_events, find_free_time | create_event, update_event, delete_event |
| 할일 | list_todos | create_todo, update_todo, complete_todo, delete_todo |
| 가계부 | list_transactions, get_summary, list_accounts | add_transaction, update_transaction, delete_transaction |
| 공통 | get_weather, get_today_overview | — |

제한: 반복 일정은 조회만 가능하고 수정·삭제는 웹에서 한다. 일괄 삭제 도구는 없다. 일정 알림은 `reminders`(시작 몇 분 전)로 설정한다.

## 토큰 폐기·범위

- 설정 > MCP 에서 토큰을 폐기하면 이후 호출은 즉시 401이다. 폐기 후에는 커넥터를 새 토큰으로 다시 등록한다.
- 읽기 전용 범위의 토큰은 쓰기·삭제 도구가 목록에 나타나지 않고, 호출해도 거부된다.

## 사용 예시

- "내일 오후 3시에 치과 일정 잡아줘"
- "이번 주 비는 시간 알려줘"
- "점심 12,000원 식비 신한카드로 기록해줘"
- "이번 달 식비 얼마 썼어?"
- "오늘 브리핑해줘"

삭제는 항상 Claude가 먼저 확인을 묻는다. 일괄 삭제 도구는 없다.

## 문제 해결

| 증상 | 원인·조치 |
|---|---|
| 401 | 토큰이 틀렸거나 폐기됨. 헤더 값에 `Bearer ` 가 빠졌는지 확인하고 새 토큰으로 재등록 |
| 429 | 토큰당 분당 60회 초과. 응답의 Retry-After 초 뒤에 재시도 |
| "후보: …" 오류 | 카테고리·계좌·프로젝트 이름이 모호하거나 없음. 후보 중 하나를 지정해 다시 요청 |
| 도구가 안 보임 | 토큰 범위에 해당 서비스가 없음. 범위를 넓혀 새 토큰 발급 |

## 배포 절차 (클라우드 Supabase)

로컬 Docker 없이 클라우드 프로젝트에 바로 배포한다.

1. `supabase login`, `supabase link --project-ref <ref>`
2. 마이그레이션 적용: `supabase db push`
3. 함수 배포: `supabase functions deploy mcp --no-verify-jwt` (자체 토큰 인증이므로 JWT 검증 끔. `config.toml`에 `[functions.mcp] verify_jwt = false`가 있으면 플래그 불필요)
4. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`는 Edge에 기본 주입된다. 별도 secret 등록은 없다.
5. 서버 URL: `https://lmbmljlupqjcrgmrvqgl.supabase.co/functions/v1/mcp` (프로젝트 ref `lmbmljlupqjcrgmrvqgl`)
6. 함수 배포와 원격 DB 변경은 사용자 승인 후에만 한다.

## 검증 체크리스트 (배포 후)

- [ ] `GET /functions/v1/mcp/health` → `{"ok":true}`
- [ ] 설정 또는 `POST /tokens`(사용자 JWT)로 토큰 발급 → 응답에 `lm_…` 원문이 1회만 있고 DB `mcp_tokens`에는 해시만 있다
- [ ] 토큰 없이/틀린 토큰으로 `POST /mcp` → 401
- [ ] MCP Inspector(`npx @modelcontextprotocol/inspector`)로 Streamable HTTP 연결, `Authorization: Bearer lm_…` 헤더 → `initialize`, `tools/list`, `tools/call` 동작
- [ ] Claude 커스텀 커넥터(위 등록 단계)에서 도구 목록이 보이고 "내 계좌 잔액 알려줘"가 동작
- [ ] 읽기 전용 토큰: `tools/list`에 쓰기·삭제 도구가 없고, 직접 호출하면 거부 + `mcp_logs`에 `denied`
- [ ] 토큰 폐기(`DELETE /tokens/:id`) 직후 같은 토큰 호출 → 401
- [ ] 같은 토큰으로 1분에 61번 호출 → 61번째가 429 + `Retry-After`
- [ ] 모든 호출이 `mcp_logs`에 남는다(입력은 요약본)
- [ ] 다른 사용자의 id(할일·거래)를 넣어 조회·수정·삭제 → 찾을 수 없음/실패
- [ ] 모호한 카테고리 이름 → 후보가 담긴 오류
- [ ] "점심 12,000원 식비 신한카드로 기록해줘" → 웹 내역에 거래가 나타나고 "Claude에서 기록"으로 표시됨 (`transactions.source='mcp'`)
- [ ] 반복 할일을 `complete_todo` → 다음 주기 할일이 생기고, 같은 호출을 다시 해도 중복 생성되지 않음
- [ ] `delete_*` 는 id 하나만 받고, Claude가 삭제 전에 사용자에게 확인을 묻는다
- [ ] 반복 일정에 `update_event`/`delete_event` → "웹에서 처리" 안내 오류
- [ ] `get_weather`, `get_today_overview` 가 동작 (기본 지역 설정 필요)
- [ ] 배포 전 필수: `complete_todo`(03)·`transactions.source`(04) 마이그레이션이 원격 DB에 적용되어 있어야 한다 (`supabase db push`, 사용자 승인 후)

## 참고

- Claude 문서: Add a connector that isn't in the directory (claude.com/docs/connectors/custom/remote-mcp)
