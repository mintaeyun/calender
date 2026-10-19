# 06. mcp — MCP 서버

> 먼저 `00-overview.md`를 읽는다. 서버 뼈대·토큰·조회 도구는 웨이브 2, 쓰기·삭제 도구는 02~04 api가 안정된 뒤 웨이브 3.

## 목표
사용자의 Claude(데스크톱/웹/모바일)가 일정·할일·가계부를 자연어로 조회·기록할 수 있는 **원격 Streamable HTTP MCP 서버**를 Supabase Edge Function으로 만든다. 보안(토큰·범위·로그·호출 제한)이 기능만큼 중요하다.

## 선행 조건 / 의존
- 01: `mcp_tokens`, `mcp_logs` 테이블, `_shared/`, 설정 라우트.
- 02·03·04: 쓰기 도구의 도메인 규칙(반복, 종일, 소프트 삭제, 금액 검증, `complete_todo`, 카테고리 해석). **도구는 DB에 직접 쓰되 같은 규칙을 구현**한다(웹 코드 import 불가).
- 05: 날씨 provider 모듈(`get_weather`, `get_today_overview`).
- 07: 일정 쓰기 시 구글 양방향이 켜져 있으면 동일 반영(PRD §9.2-4). 07의 푸시 큐/함수에 위임.
- 사용자: PRD §14-8 인증 방식 확인(권고: 개인 토큰으로 시작, Claude 커넥터 호환 확인 필요).
- 먼저 가능한 작업: 도구 JSON Schema·이름/ID 해석 로직·레이트 리밋의 순수 로직과 테스트, 문서.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| MCP-1 | 원격(Streamable HTTP) MCP 서버를 Edge Function으로 배포 | P0 |
| MCP-2 | 토큰 발급·폐기, 원문은 발급 시 1회만, DB는 해시만 | P0 |
| MCP-4 | 모든 호출은 토큰 소유자 `user_id`로 실행, 서버 측 사용자 조건 강제 | P0 |
| MCP-6 | 삭제 도구에 "사용자 확인 필수" 명시, 일괄 삭제 미제공 | P0 |
| MCP-7 | 입력 JSON Schema 검증, Claude가 이해할 오류 메시지 | P0 |
| MCP-9 | 커스텀 커넥터 등록 방법 README 문서화 | P0 |
| MCP-3 | 토큰별 범위: 서비스(일정/할일/가계부) × (읽기 / 읽기·쓰기) | P1 |
| MCP-5 | 모든 호출을 `mcp_logs`에 기록, 설정에서 조회 | P1 |
| MCP-8 | 분당 호출 제한(예: 60회/토큰) | P1 |

## 소유 경로
`supabase/functions/mcp/`, `web/src/features/mcp/`(설정 MCP 탭 UI), `docs/mcp-connector.md`

## 작업 목록

### A. 서버 뼈대 (P0, MCP-1)
- [ ] `supabase/functions/mcp/index.ts`: `@modelcontextprotocol/sdk`(npm 지정자)의 Streamable HTTP 트랜스포트를 Deno Edge Function에서 구동. **stateless** 모드(요청마다 서버 인스턴스 생성)를 우선 검토 — Edge Function은 인스턴스 간 상태를 보장하지 않는다.
- [ ] 라우팅·CORS·`OPTIONS`, 헬스 체크. `initialize`, `tools/list`, `tools/call`이 Claude 커넥터에서 동작하는지 로컬(`supabase functions serve`)과 MCP Inspector로 확인.
- [ ] 함수 설정: `verify_jwt = false`(자체 토큰 인증이므로). 대신 토큰 검증을 모든 요청의 첫 단계로 강제.

### B. 토큰·인증 (P0, MCP-2/4)
- [ ] 토큰 형식: `lm_` + 256비트 랜덤(base64url). **발급 시 원문 1회만 반환**, DB에는 SHA-256 해시(`token_hash`)만 저장. 목록에는 `lm_••••3f9a`처럼 끝 4자리 힌트만(힌트 컬럼 필요 시 추가 마이그레이션 `token_hint`).
- [ ] 발급/폐기 API: Edge Function `mcp-tokens`(또는 `mcp`의 관리 경로, 사용자 JWT 인증) — `POST /tokens`(이름·scopes), `DELETE /tokens/:id`(`revoked_at` 설정). 폐기 즉시 이후 호출 거부.
- [ ] 인증: `Authorization: Bearer lm_...` → 해시 조회(상수 시간 비교) → `revoked_at is null` 확인 → `user_id` 확정 → `last_used_at` 갱신. 실패는 401, 상세 이유를 노출하지 않는다.
- [ ] **user_id 강제(MCP-4)**: service-role 클라이언트는 RLS를 우회하므로, 모든 쿼리 빌더 래퍼가 `user_id`를 **자동 주입**하게 하고(`scoped(userId).from('events')…`), 직접 `.from()` 호출을 금지(코드 리뷰 체크). 단위 테스트: 다른 사용자의 id로 조회·수정·삭제 시도가 모두 실패.
- [ ] 대안(검토): 토큰으로 사용자 JWT를 발급해 RLS 아래에서 실행. 구현이 단순하고 안전하면 채택하고 근거를 인수인계 메모에 기록.

### C. 범위·호출 제한·로그 (P1, MCP-3/5/8)
- [ ] `scopes` jsonb: `{events:'read'|'write'|'none', todos:…, ledger:…}`. `tools/list`는 범위에 맞는 도구만 노출하고, `tools/call`도 서버에서 재검증.
- [ ] 레이트 리밋: 토큰당 60회/분. Edge는 상태가 없으므로 DB 카운터(`mcp_rate` 추가 마이그레이션, 분 단위 버킷 upsert) 또는 `mcp_logs` 카운트로 구현. 초과 시 429 + `Retry-After`와 명확한 메시지.
- [ ] 모든 호출을 `mcp_logs`에 기록: `called_at, token_id, tool, input_summary, status(ok/error), error`. **입력 요약은 민감값을 줄여 저장**(메모 길이 제한, 전체 payload 저장 금지). 로그 실패가 도구 응답을 막지 않게 한다.

### D. 공통 해석기 (P0, MCP-7)
- [ ] 이름 또는 ID 해석: `resolveCategory/Account/Project(input)` — UUID면 ID로, 아니면 이름(사용자 내, 대소문자·공백 무시)으로 조회. **모호하거나 없으면 후보를 포함한 오류**(예: `카테고리 "간식"을 찾을 수 없습니다. 후보: 식비, 기타`)를 반환하고 임의 선택하지 않는다. 순수 로직 + 테스트.
- [ ] 날짜·시간: ISO 8601, 시간대 없으면 `profiles.timezone`으로 해석. 종일 일정 규칙은 02의 `lib/allday.ts` 규칙과 동일하게 구현.
- [ ] 오류 형식: MCP `isError: true` + 한국어 메시지 + 가능한 수정 힌트. 스택 트레이스·내부 SQL 노출 금지.
- [ ] 모든 도구 입력은 JSON Schema(`zod`→JSON Schema 변환 또는 수기)로 검증, 알 수 없는 필드는 거부.

### E. 도구 구현 (PRD §4.8 명세 그대로)

| 서비스 | 도구 | 권한 | 단계 |
|---|---|---|---|
| 일정 | `list_events`, `search_events`, `find_free_time` | 읽기 | 웨이브 2 (P0/P1) |
| 일정 | `create_event`, `update_event`, `delete_event` | 쓰기 | 웨이브 3 |
| 할일 | `list_todos` | 읽기 | 웨이브 2 |
| 할일 | `create_todo`, `update_todo`, `complete_todo`, `delete_todo` | 쓰기 | 웨이브 3 |
| 가계부 | `list_transactions`, `get_summary`, `list_accounts` | 읽기 | 웨이브 2 |
| 가계부 | `add_transaction`, `update_transaction`, `delete_transaction` | 쓰기 | 웨이브 3 |
| 공통 | `get_weather`, `get_today_overview` | 읽기 | 05 완료 후 |

- [ ] **조회 도구(P0)**: 반복 일정은 `recurrence.ts` 규칙으로 전개해 반환. `list_*`는 기본 페이지 크기 제한(예: 100건)과 `truncated` 표시. 소프트 삭제 항목 제외. `find_free_time`은 업무 시간대 기본값(예: 09–18, 주말 제외 여부 입력 가능)과 일정 겹침 계산(순수 로직+테스트).
- [ ] **쓰기 도구**: 웹과 같은 검증(제목 필수, 종료 ≥ 시작, 금액 양의 정수, 이체 시 `to_account`). 생성/수정 결과 전체를 반환해 Claude가 확인 가능. 일정 쓰기 시 구글 양방향이면 07의 반영 경로 호출(07 완료 전엔 TODO + 응답에 "구글 반영 대기" 표시하지 말고 미연결 시 무시).
- [ ] **삭제 도구(MCP-6)**: 도구 `description`에 반드시 "**사용자에게 삭제 의사를 확인한 뒤에만 호출하세요**" 문구. 입력은 단일 `id`만(배열·조건 삭제 금지). 일정·할일은 소프트 삭제, 거래는 즉시 삭제. 삭제 직전 대상의 제목·금액을 응답에 포함해 로그와 사용자 확인에 쓰이게 한다.
- [ ] `complete_todo`는 03의 RPC/규칙(반복 다음 주기 생성)을 사용. `add_transaction`은 04 규칙(카테고리 보관 상태, 계좌 기본값, `source='mcp'`).
- [ ] 도구 설명(description)은 Claude가 올바르게 고르도록 한국어로 구체적으로(언제 쓰는지, 입력 예시, 모호할 때 동작).

### F. 설정 MCP 탭 UI (P1)
- [ ] `features/mcp/components/McpSettings.tsx`(08이 설정 탭에 배치): 목업 이식 — 서버 URL(복사 버튼), 토큰 표(이름·서비스별 범위·마지막 사용·폐기), "새 토큰 발급" 모달(이름·서비스별 범위 선택 → 발급 후 **원문 1회 표시**와 복사, 닫으면 다시 볼 수 없음 안내), 호출 이력(시각·도구·입력 요약·성공/오류), 한도 표시.
- [ ] 폐기는 확인 모달.

### G. 문서 (P0, MCP-9)
- [ ] `docs/mcp-connector.md`: Claude 데스크톱/웹/모바일에서 커스텀 커넥터 등록 단계(서버 URL, 인증 헤더/토큰 입력 방법), 토큰 발급·폐기, 범위 설명, 사용 예시 문장(예: "내일 오후 3시에 치과 일정 잡아줘", "이번 달 식비 얼마 썼어?"), 문제 해결(401/429/모호성 오류). **커넥터가 Bearer 토큰 헤더를 지원하는지**, 안 되면 대안(URL 쿼리 토큰 금지 — 로그 유출 위험, OAuth)을 조사해 사용자에게 보고(PRD §14-8).

## 제공하는 계약
- 배포된 MCP URL과 토큰 발급/폐기/로그 조회 API (08·설정이 사용)
- `McpSettings` 컴포넌트
- `docs/mcp-connector.md`

## 지켜야 할 규칙 · 함정
- **RLS가 없는 서버 실행**이므로 모든 쿼리에 `user_id`를 강제. 하나라도 빠지면 타 사용자 데이터 노출이다.
- 토큰 원문은 로그·DB·에러 메시지 어디에도 남기지 않는다. 비교는 해시로, 상수 시간 비교.
- 삭제 확인 원칙, **일괄 삭제 도구 금지**, 소프트 삭제 준수.
- 모호한 입력은 추측하지 말고 후보와 함께 오류로 돌려준다.
- Edge Function의 실행 시간·콜드스타트 제한: 도구 로직을 가볍게, 구글 호출은 비동기 큐 검토(응답 3초 이내 목표).
- Claude 커넥터가 요구하는 스펙(프로토콜 버전, 세션 헤더 등)은 SDK 버전에 따라 다르다. 구현 전 최신 MCP 스펙/SDK 문서를 확인한다.

## 완료 기준
- [ ] MCP Inspector와 실제 Claude 커넥터에서 `tools/list`·`tools/call`이 동작한다.
- [ ] Claude에서 "점심 12,000원 식비 신한카드로 기록해줘"가 거래를 만들고 웹 내역에 나타난다. (M3 완료 기준)
- [ ] 읽기 전용 토큰으로 쓰기 도구 호출이 거부된다. 폐기한 토큰은 즉시 401.
- [ ] 다른 사용자의 id로 조회·수정·삭제 시도가 실패한다(자동 테스트).
- [ ] 분당 61번째 호출이 429. 모든 호출이 `mcp_logs`에 남고 설정에서 보인다.
- [x] 모호한 카테고리 입력이 후보를 담은 오류를 반환한다. (단위 테스트)
- [x] 함수 테스트·타입 점검 통과, `AGENTS.md`에 명령 추가. (web `npm run lint/build`는 06이 web을 바꾸지 않아 영향 없음; F UI 구현 시 재확인)

## 인수인계 메모
**상태(2026-10-19, 브랜치 feat/mcp, 커밋 2ba9d16):** 서버 뼈대·토큰 발급/폐기·`user_id` 강제·호출 제한·로그·도구 18개 전부 구현. `npm run test:functions`(web/에서) 통과, Deno 없이 tsc 스텁 점검 통과. **실DB·실서버·Inspector·Claude 커넥터 구동은 한 번도 안 해봤다** — 클라우드 배포(사용자 승인) 후 `docs/mcp-connector.md`의 검증 체크리스트로 확인. 미구현: F 설정 MCP 탭 UI(`McpSettings`)·`mcp_logs` 조회 UI(P1).
- **인증 최종안:** 개인 토큰(`lm_`+256비트)을 Claude 커넥터 Request headers(`Authorization: Bearer`)로 전달(사용자 확정, REQUESTS 결정 기록). 해시(SHA-256)만 저장, `token_prefix`(앞 7자)로 목록 식별. 토큰→사용자 JWT 발급 대안은 채택하지 않음(service role + 쿼리 래퍼가 더 단순하고 테스트 가능).
- **user_id 강제:** `lib/scoped.ts`(select/insert/update/remove/rpc 모두 서버 user_id 주입, 허용 테이블·함수 목록 밖은 예외, rpc는 `p_user` 강제). 도구는 `db.from()`을 쓰지 않는다. 예외는 index.ts의 토큰 해시 조회와 `mcp_logs`/`mcp_tokens` 직접 쿼리뿐(둘 다 user_id를 명시). 단위 테스트는 가짜 DB 기준이라 **실DB에서 타 사용자 id 시도 테스트가 아직 없다**(체크리스트에 있음).
- **SDK 대신 직접 구현:** `lib/protocol.ts`가 stateless JSON-RPC(initialize/ping/tools/list/tools/call)를 처리, 응답은 JSON(SSE 없음, GET은 405). Deno에서 SDK를 돌려 볼 수 없어서 선택. 커넥터 호환 문제가 나면 SDK로 교체 검토.
- **호출 제한:** `mcp_logs` 최근 60초 건수 + 1 > 60이면 429 + Retry-After. 카운트와 로그 기록이 원자적이지 않아 동시 호출 시 소폭 초과 가능(개인용 허용). 제한 초과 호출도 로그(rate_limited)에 남아 계속 카운트된다.
- **추가 마이그레이션 없음.** 06은 `complete_todo`(03), `transactions.source`(04) 마이그레이션에 의존 → 원격 DB에 먼저 적용해야 한다.
- **Edge에 복사한 web 로직(규칙 변경 시 양쪽 수정):** `lib/recurrence.ts`(02 expandEvents), `lib/next-occurrence.ts`(03), 종일 저장 규칙(events-write.ts, 02 allday.ts), 거래 검증(ledger-write.ts, 04 checkTx). 일정 전개는 02와 같은 기대값 테스트로 확인.
- **도구별 제한/결정:** (1) 일정 update/delete는 **반복 일정(마스터·예외)을 거부**하고 웹 사용을 안내 — 3가지 범위 수정은 구현하지 않음. (2) `update_*`에서 값을 null로 지우는 것은 불가. (3) create_event 캘린더는 첫 로컬 캘린더(없으면 null). (4) add_transaction 계좌 생략 시 최근 거래 계좌 → 계좌가 하나면 그것 → 아니면 후보 오류. 카테고리는 type과 같은 종류(수입/지출) 안에서만 찾는다. (5) list_transactions/get_summary는 기간 내 1000건 초과 시 기간 축소 오류. (6) find_free_time은 종일 일정을 제외, 업무시간 기본 평일 09–18. (7) 일정 쓰기의 구글 반영은 07 구현 후(양방향이면 `updated_at` 감지로 push) — 별도 호출 없음. (8) get_weather는 `profiles.weather_location` 또는 지오코딩한 첫 결과, 화씨 설정 반영.
- **요청 보류:** `config.toml [functions.mcp] verify_jwt = false`(01) — 반영 전엔 `--no-verify-jwt`로 배포. 테스트 파일은 vitest(`test:functions`)용이며 `fake-db.ts`는 테스트 도우미.
- **07(gcal-sync) 참고 위치(cal1용):** 반복 일정 전개 `supabase/functions/mcp/lib/recurrence.ts`(`expandEvents`, `occurrencesBetween`; rrule은 `deno.json` import map + `import * as` 호환 처리), 종일 저장 규칙 `supabase/functions/mcp/tools/events-write.ts`의 `allDayRange`(start_at=첫날 0시, end_at=마지막 날 다음 날 0시=구글과 같은 exclusive)와 `lib/datetime.ts`(`parseInput`, `formatLocal`, `allDayDates`), 시간 유틸 `supabase/functions/_shared/time.ts`, 쿼리 래퍼 `lib/scoped.ts`, 테스트 도우미 `lib/fake-db.ts`. 토큰 암호화·OAuth는 06에 없음.
- **히스토리 주의:** 커밋 5be91bc에 vitest 캐시(`supabase/functions/node_modules/.vitest-cache`)가 잘못 들어갔다가 다음 커밋에서 제거됨. main 병합 시 squash 권장.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/06-mcp.md 를 읽고 06 mcp 세션을 진행해줘.
브랜치 feat/mcp 에서 작업해줘. 01 계약이 main에 있으면 병합해서 서버 뼈대·토큰·조회 도구부터, 없으면 순수 로직(이름/ID 해석, JSON Schema, free time, 레이트 리밋)과 테스트부터 해줘.
핵심 규칙: 모든 쿼리에 토큰 소유자 user_id 강제, 삭제 도구는 확인 문구 필수·일괄 삭제 금지.
MCP 인증 방식(PRD §14-8)과 Claude 커넥터 호환은 조사 후 나에게 확인해줘.
```
