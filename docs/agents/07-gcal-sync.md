# 07. gcal-sync — 구글 캘린더 연동

> 먼저 `00-overview.md`를 읽는다. 02의 `events` CRUD가 안정된 뒤 시작. **웨이브 3** (M4).

## 목표
Google OAuth로 계정을 연결하고, 선택한 캘린더의 일정을 앱으로 가져오며(기본), 옵션으로 양방향 동기화한다. 일정 유실·중복 0건이 목표다. 동기화 대상은 **일정뿐**(할일·가계부 제외).

## 선행 조건 / 의존
- 01: `google_connections`, `calendars`, `events` 테이블(구글 매핑 컬럼, 반복 예외 컬럼), `_shared/`, 설정 라우트.
- 02: `events` CRUD 동작, 반복 예외 모델(`recurring_event_id`, `original_start_at`, `exdates`), 종일 저장 규칙(`lib/allday.ts`). **구글의 종일·반복 예외 의미와 02의 저장 규칙을 맞춘다.**
- 05: 동기화 오류 알림(`createNotification`).
- 사용자(필수, 시작 전): Google Cloud 프로젝트, Calendar API 활성화, OAuth 클라이언트(웹), 리디렉션 URI 등록, client id/secret을 Edge secrets에 설정, **동의 화면 게시 상태 결정**(PRD §14-4, 권고: 프로덕션(미검증) 전환 — "테스트" 상태는 refresh token이 7일 후 만료).
- 사용자: 토큰 암호화 키(32바이트) 생성 후 Edge secret `TOKEN_ENC_KEY`로 등록.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| GCAL-1 | OAuth 2.0 연결/해제. 해제 시 토큰 즉시 삭제 + 구글 측 revoke | P1 |
| GCAL-2 | 동기화 대상 캘린더 선택(복수) | P1 |
| GCAL-3 | 최초 연결 시 가져오기(과거 1개월 ~ 미래 1년) | P1 |
| GCAL-4 | syncToken 증분 동기화(변경·삭제 반영) | P1 |
| GCAL-5 | 동기화 방향: 가져오기만 / 양방향, **기본 가져오기만** | P1 |
| GCAL-6 | 양방향: 앱에서 만든·수정·삭제한 일정을 구글에 반영, ID 매핑 유지 | P1 |
| GCAL-7 | 충돌 시 `updated`가 최근인 쪽 채택, 덮어쓴 내용 로그 | P1 |
| GCAL-8 | 트리거: 수동 버튼, 앱 진입 시, 5~15분 주기 (웹훅은 P2) | P1 |
| GCAL-9 | 구글 유래 일정 아이콘/색 구분, 반복은 구글 RRULE 그대로 | P1 |
| GCAL-10 | 마지막 동기화 시각·오류·재연결 안내 표시 | P1 |
| GCAL-11 | 할일·가계부는 동기화하지 않음 (마감일 내보내기는 P2 옵션) | P2 |

> 이 영역은 모두 P1이다. 우선 **가져오기 전용**(GCAL-1~5, 8~10)을 끝내 안정화하고, 그다음 양방향(GCAL-6, 7)을 한다.

## 소유 경로
`supabase/functions/gcal-sync/`, `web/src/features/google/`

## 작업 목록

### A. OAuth 연결 (GCAL-1)
- [x] 스코프: `calendar.events`, `calendar.readonly`(캘린더 목록용) — 최소 권한. 요청 파라미터 `access_type=offline`, `prompt=consent`(refresh token 확보), `include_granted_scopes`.
- [x] 흐름: 설정 → "연결" → Edge `gcal-sync/oauth/start`가 `state`(CSRF, 서버 서명/DB 저장 + 만료)를 만들어 구글 동의 화면으로 → 콜백 `gcal-sync/oauth/callback`에서 `state` 검증 후 code 교환 → `refresh_token`을 **AES-256-GCM으로 암호화**(`TOKEN_ENC_KEY`, 랜덤 nonce)해 `google_connections.refresh_token_enc`에 저장 → 설정 화면으로 리다이렉트. 사용자 식별은 `state`에 묶인 JWT 사용자.
- [x] access token은 저장하지 않고 필요할 때 refresh token으로 교환(짧은 메모리 캐시만).
- [x] 연결 해제: 구글 revoke 엔드포인트 호출 → `google_connections` 삭제(토큰 즉시 삭제) → 해당 캘린더의 동기화 중단. 가져온 일정은 유지/삭제 중 선택하는 확인 모달(기본 유지). (01의 계정 삭제 훅이 이 함수를 호출한다.)
- [x] 비밀값(client secret, 암호화 키)은 Edge secrets에만. 로그에 토큰·code 출력 금지.

### B. 캘린더 선택·최초 가져오기 (GCAL-2/3)
- [x] `calendarList.list`로 목록 조회 → 설정 UI에서 체크(목업: 업무/개인/공휴일/가족, 일정 수·읽기 전용 표시). 선택 시 `calendars` 행 생성/갱신(`source='google'`, `google_calendar_id`, `sync_enabled`, 색상 매핑).
- [x] 최초 가져오기: `events.list`(`singleEvents=false`로 반복 원본과 예외를 그대로 가져오기), `timeMin = now−1개월`, `timeMax = now+1년`, `showDeleted`는 최초엔 false. 페이지네이션(`nextPageToken`) 전부 처리, 마지막 페이지의 `nextSyncToken`을 `sync_token_by_calendar[calendarId]`에 저장.
- [x] 변환: 구글 이벤트 → `events` upsert, 키 `(user_id, google_event_id)`. `google_etag` 저장, 종일(`start.date`)/시간(`start.dateTime`+tz) 변환은 02의 저장 규칙과 일치시킴, `recurrence`(RRULE 줄) → `events.rrule`, 예외 인스턴스는 `recurringEventId`/`originalStartTime` → `recurring_event_id`/`original_start_at`. 취소(`status=cancelled`)는 소프트 삭제.
- [x] 대량 import는 배치 upsert(청크 500)로, 실행 시간 제한을 넘지 않게 분할/재개 가능하게(캘린더별·페이지별 진행 상태 저장).

### C. 증분 동기화 (GCAL-4)
- [x] `events.list`에 `syncToken`을 주어 변경분만 조회, 응답의 새 `nextSyncToken` 저장. 삭제(`cancelled`)는 `deleted_at` 설정.
- [x] **410 Gone**(syncToken 만료): 해당 캘린더의 syncToken을 버리고 전체 재동기화 후 로컬에 없는 구글 일정은 소프트 삭제하지 말고(오탐 방지) 구글 쪽에 존재하는 것만 upsert, 구글에서 사라진 `google_event_id`는 재동기화 완료 후 비교해 삭제 처리.
- [x] 동기화는 캘린더 단위 락(동시 실행 방지): `google_connections`에 `sync_lock_until` 같은 컬럼(추가 마이그레이션) 또는 advisory lock.
- [x] 일시 오류(429/5xx)는 지수 백오프 재시도, 영구 오류(401 `invalid_grant`, 권한 철회)는 `last_error` 기록 후 중단.

### D. 트리거 (GCAL-8)
- [x] 수동: 설정 "지금 동기화" 버튼 → `gcal-sync/sync` 호출.
- [x] 앱 진입 시: 마지막 동기화가 N분(예: 5분) 이상 지났으면 백그라운드 호출(앱 레이아웃에서 한 번, 01 소유 파일 수정은 `REQUESTS.md`로 요청 — 또는 `features/google`의 훅을 08/01이 마운트).
- [x] 주기: pg_cron 15분마다 `net.http_post`로 `gcal-sync/sync-all` 호출(연결된 사용자 순회). 서비스 키/내부 호출 인증은 `_shared/auth.ts`의 내부 토큰 헤더.
- [x] 웹훅(push channel)은 P2 — 건너뜀. 채널 만료 갱신까지 포함하므로 안정화 후 별도 검토.

### E. 설정 UI (GCAL-10, GCAL-9)
- [x] `features/google/components/GoogleSettings.tsx`(08이 설정 탭에 배치): 목업 이식 — 연결 상태(이메일·"연결됨 · 마지막 동기화 오늘 13:32"), 지금 동기화, 연결 해제, 동기화 방향 세그먼트(가져오기만/양방향)와 설명, 캘린더 체크 목록, 동기화 정책 안내문.
- [x] 오류 표시: `last_error` 분류(토큰 만료/권한 철회/네트워크)별 한국어 메시지 + **재연결 버튼**. 토큰 만료 시 설정과 알림(05)에 재연결 안내. (구글 OAuth "테스트" 상태의 7일 만료가 대표 원인임을 안내 문구에 반영.)
- [x] 일정 출처 표시용 훅 `useEventSource(event)` 또는 필드 규칙을 02에 제공: 구글 유래 일정은 `G` 배지/아이콘, 읽기 전용 캘린더(공휴일)는 수정·드래그 불가 → 02 컴포넌트가 `calendars.source`와 `read_only` 속성을 참조하도록 계약(필요 시 `calendars.read_only` 컬럼 추가 마이그레이션).

### F. 양방향 (GCAL-5/6/7) — 가져오기 안정화 후
- [x] 방향 전환 UI: `google_connections.sync_direction in ('import','both')`. **기본 import**. 양방향 전환 시 확인 모달(앱에서 만든 일정이 구글에 생성됨을 명시).
- [x] 로컬 → 구글: `updated_at > last_synced_at`인 `events`(구글 캘린더에 속한 것, 또는 "구글에도 만들기" 선택된 로컬 캘린더)를 push. 생성(`events.insert`) 후 `google_event_id`/`google_etag` 저장, 수정(`events.patch`)은 **`If-Match: etag`**로 낙관적 동시성, 412 발생 시 충돌 처리로. 삭제는 구글 일정 삭제 확인 모달(PRD §14-5: 양방향 모드에서만 삭제 반영).
- [x] 앱에서 만든 일정이 구글로 갔다가 다시 가져오기에서 **중복 생성되지 않도록** `google_event_id` 매핑을 push 직후 저장하고, 가져오기 upsert 키로 사용. `extendedProperties.private.appEventId`에 로컬 id를 넣어 보조 매칭.
- [x] 충돌(GCAL-7): 같은 일정이 양쪽에서 변경되면 `updated` 시각이 최근인 쪽 채택, 진 쪽의 이전 값을 `google_sync_log`(추가 마이그레이션: `event_id, direction, before jsonb, after jsonb, reason, at`)에 기록. 설정에 최근 충돌 로그 보기(간단 목록).
- [x] 반복 일정 쓰기: 02의 "이번만/이후/전체" 결과를 구글의 예외 인스턴스/UNTIL 분할로 변환. 구글 유래 반복 일정은 RRULE을 변환하지 않고 그대로 보낸다. 지원하기 어려운 조합은 안전하게 막고(읽기 전용 처리) 사유를 표시.
- [x] 06 MCP/02 UI의 일정 변경이 push되도록 `updated_at` 기반 감지에 의존(별도 호출 불필요). 즉시 반영이 필요하면 `gcal-sync/push?eventId=` 엔드포인트를 06에 제공.

### G. P2
- [ ] GCAL-11: 할일 마감일을 구글에 종일 일정으로 내보내는 옵션(기본 꺼짐).
- [ ] 웹훅: `events.watch` 채널, 만료 갱신, 알림 수신 시 증분 동기화.

## 제공하는 계약
- Edge 엔드포인트: `oauth/start`, `oauth/callback`, `sync`, `sync-all`, `disconnect`, `calendars`
- `GoogleSettings` 컴포넌트, `useGoogleConnection()`(상태·마지막 동기화·오류)
- 구글 출처/읽기 전용 표기 규칙(02가 참조)
- `google_sync_log` 및 `last_error` 규칙(05가 알림에 사용)

## 지켜야 할 규칙 · 함정
- **OAuth "테스트" 게시 상태면 refresh token이 7일 후 만료**된다. 사용자에게 프로덕션(미검증) 전환을 안내하고, 만료(`invalid_grant`) 시 반드시 재연결 안내를 표시한다.
- 암호화 키·client secret을 코드·커밋·로그에 남기지 않는다. 키 회전 가능성을 고려해 암호문에 키 버전 접두사를 둔다.
- 초기엔 **가져오기 전용**. 양방향은 데이터 손상 위험이 크므로 가져오기가 안정화된 뒤 켠다(PRD §14-2).
- 종일 일정의 종료 날짜는 구글에서 **exclusive**다 — 02의 규칙과 어긋나면 하루씩 밀린다.
- 410 재동기화 시 로컬 변경이 유실되지 않게(양방향이면 먼저 push) 순서를 지킨다.
- Edge Function 시간 제한 → 대량 작업은 분할·재개 가능하게.
- 토큰 해제 시 구글 revoke 실패해도 로컬 토큰은 반드시 삭제.

## 완료 기준
- [ ] 구글 계정을 연결하고 캘린더를 선택하면 과거 1개월~미래 1년 일정이 앱에 나타나고, 구글 앱에서 만든/수정/삭제한 일정이 15분 이내(수동 동기화는 즉시) 반영된다. 중복·유실 없음.
- [ ] 반복 일정과 예외 인스턴스, 종일(여러 날) 일정이 구글과 같은 날짜로 표시된다.
- [ ] syncToken을 인위적으로 무효화(410)해도 전체 재동기화로 복구된다.
- [ ] 연결 해제 시 `google_connections`의 토큰이 삭제되고 구글 측 권한이 revoke된다.
- [ ] 토큰 만료 시 설정에 재연결 안내가 뜬다.
- [ ] (양방향) 앱에서 만든 일정이 구글에 생성되고 가져오기 후에도 중복되지 않는다. 같은 일정을 양쪽에서 수정하면 최근 수정 쪽이 채택되고 로그가 남는다. (M4 완료 기준: 5분 내 반영)
- [ ] `npm run lint`, `npm run build` 통과. `AGENTS.md`에 테스트/로컬 실행 명령 추가.

## 인수인계 메모
**상태(2026-10-21): 가져오기 A→E + 양방향 F 구현 완료(feat/gcal-sync → main), P2 G 미착수. 원격 마이그레이션 미적용·함수 미배포 → 실제 구글 연동은 미검증(스텁 기반 테스트만).**
- 검증됨: 순수 로직·엔진·핸들러 vitest 59개(npm run test:functions), web 단위 테스트(errors), Deno 코드 tsc(typecheck/tsconfig.json), lint/build. 미검증: 실제 Google OAuth·Calendar API, PostgREST 쿼리(db.ts: upsert onConflict id + missing=default, or() 락), pg_cron/Vault 호출.
- 추가 마이그레이션(원격 적용 전 승인 필요): 20261020100000_gcal_sync.sql (google_connections.sync_lock_until, events.google_synced_at, calendars.google_access_role/read_only, invoke_gcal_sync() + cron 15분), 20261020100100_gcal_stale_fn.sql (gcal_soft_delete_stale). 적용 후 database.types.ts 재생성(npm run db:types:remote) — web/src/features/google/api.ts 의 unknown 캐스트 제거 가능. 적용 전에는 설정 > Google 탭(연결 후)에서 calendars.read_only 조회가 실패한다.
- 배포: secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / TOKEN_ENC_KEY(base64 32바이트, 키 회전은 TOKEN_ENC_KEY_V2 + TOKEN_ENC_CURRENT) / (선택) ALLOWED_RETURN_ORIGINS(기본 http://localhost:3000). supabase/config.toml 에 [functions.gcal-sync] verify_jwt=false (콜백에 JWT 없음; 경로별 자체 인증). 리디렉션 URI: <SUPABASE_URL>/functions/v1/gcal-sync/oauth/callback. cron 은 notify 와 같은 Vault 비밀값(project_url, service_role_key) 사용.
- 설계 결정: sync_direction 값은 스키마의 import_only / two_way (문서의 import/both 아님). 충돌 로그는 새 테이블 대신 기존 sync_logs 사용. OAuth state 는 DB 대신 HMAC 서명(10분 만료)으로 무상태 구현. 락은 사용자(연결) 단위 sync_lock_until(3분). 일시 오류(429/5xx/네트워크)는 last_error 를 바꾸지 않고 sync_logs 에만 기록 — last_error 는 재연결이 필요한 영구 오류(invalid_grant 등)만(05 가 하루 1회 알림).
- 변환 규칙: 종일은 구글 end.date(exclusive)를 그대로 end_at 으로 저장(02 규칙과 동일). recurrence 의 RRULE 줄은 접두사만 제거해 events.rrule 에, EXDATE 줄은 events.exdates 에. 예외 인스턴스(recurringEventId)는 recurring_event_id/original_start_at 로, 마스터가 응답에 없으면 events.get 으로 가져오고 끝내 없으면 독립 일정으로 보존. 반복의 한 인스턴스 취소는 마스터 exdates 에 합집합으로 추가(마스터가 나중에 갱신돼도 유지). color 는 건드리지 않고(캘린더 색), 구글 알림(reminders)은 가져오지 않는다.
- 상태 저장: google_connections.sync_token_by_calendar[googleCalendarId] = { syncToken, mode, pageToken?, windowMin/Max, startedAt } (옛 문자열 형식도 읽음). 410 이면 전체 재동기화 후 google_synced_at 이 시작 시각보다 오래된 일정만 소프트 삭제(중간에 끊겨도 오탐 삭제 없음).
- 앱 연결: SettingsShell 의 google 탭을 GoogleSettings 로 교체(08 소유 파일, TODO 주석 지시대로), AppShell 에 GoogleAutoSync 마운트(앱 진입 시 5분 초과면 1회 동기화), lib/auth.ts deleteAccount 가 계정 삭제 전에 disconnectGoogle 호출. 02 는 구글 일정을 계속 읽기 전용으로 취급(lib/colors.ts isReadOnlyEvent).
- **mycal 한정(사용자 요구)**: 구글 calendarList 에서 이름이 "mycal"(공백·대소문자 무시 정확 일치, lib/target.ts; secret GOOGLE_TARGET_CALENDAR 로 변경 가능)인 캘린더 하나만 저장·동기화한다. 다른 캘린더는 앱에 가져오지 않고, 없으면 설정 탭이 한국어로 안내한다(?google=no_target).
- **양방향(F) 설계**: 기본 방향은 처음 연결 시 two_way(재연결은 기존 값 유지, 설정에서 가져오기만으로 되돌릴 수 있고 양방향 전환 시 확인 모달). 값은 스키마의 import_only/two_way.
  - 변경 감지: events.google_synced_at = "구글과 마지막으로 맞춘 시점의 updated_at". 동기화 코드는 google_synced_at 에 'infinity' 를 써서 트리거(events_zz_gcal_stamp)가 그 행의 updated_at 으로 바꾸게 한다. 앱·MCP 가 나중에 고치면 updated_at > google_synced_at → 푸시 후보(RPC gcal_push_candidates). 서버/DB 시계를 섞어 비교하지 않는다. 가져오기의 "사라진 일정" 판단도 시계 대신 events.google_seen_run(실행 id)로 한다.
  - 순서: 양방향이면 sync 마다 push → pull. push 는 신규(구글 id 없는 로컬 일정, push_local 이 켜져 있을 때·로컬 캘린더만)·수정·소프트 삭제를 mycal 로 보낸다. 생성 전 extendedProperties.private.appEventId 로 중복 확인, 수정·삭제는 If-Match: etag.
  - 충돌(GCAL-7): 412 면 updated 가 더 최근인 쪽 채택, 진 쪽 값은 sync_logs(kind=conflict, detail.winner/overwritten)에 기록. 구글에서 먼저 삭제됐는데 앱에서 고친 경우는 데이터 보존을 위해 다시 만든다. 삭제 vs 구글 수정은 더 최근 쪽. 가져오기 시 아직 푸시되지 않은 로컬 변경 행은 구글 값으로 덮어쓰지 않는다.
  - 삭제(§14-5): 양방향에서만 구글에 반영. 앱의 삭제 확인 모달(단일/반복 범위 선택)에 "Google 캘린더(mycal)에서도 삭제됩니다" 문구를 표시한다.
  - 반복: 마스터는 RRULE + EXDATE(시간=TZID 벽시계, 종일=VALUE=DATE, 종일 UNTIL 은 날짜 형식)로 보내고, 02 의 "이번만" 예외 행은 구글 인스턴스 id(마스터id_원래시작)를 patch 한다. "이후 전체" 분할은 마스터 UNTIL + 새 마스터로 자연스럽게 표현된다. 마스터가 아직 구글에 없으면 예외는 건너뛰고 다음에 보낸다.
  - 앱 캘린더(업무/개인/운동)의 일정이 push 돼도 calendar_id 는 그대로다(가져오기는 구글 id 로 사용자 전체에서 행을 찾아 갱신, 캘린더 이동 없음). 02 의 읽기 전용 판정(lib/colors.ts isReadOnlyEvent): read_only 캘린더 또는 구글 캘린더 소속이면서 가져오기만일 때.
  - 즉시 반영: 일정 저장·삭제·이동 후 클라이언트가 POST gcal-sync/push 를 1.5초 모아서 호출(features/google/push.ts triggerPush). 실패하거나 락이 걸려 있으면 다음 sync(앱 진입·15분 cron)가 보낸다.
  - **06 MCP 규칙**: MCP 의 일정 쓰기는 service role 이라 별도 호출이 필요 없다 — events 를 수정/소프트 삭제하면 updated_at 이 갱신되어 다음 sync 가 구글로 보낸다. 단, MCP 는 google_event_id / google_etag / google_updated_at / google_synced_at / google_seen_run 을 직접 쓰지 않는다(수정 시 해당 컬럼 제외). 즉시 반영이 필요하면 후속으로 service role 용 push 엔드포인트를 추가한다.
- 추가 마이그레이션(양방향, 원격 미적용): 20261021100000_gcal_two_way.sql — events.google_seen_run, google_connections.push_local(기본 true; 클라이언트 select/update 권한 부여), 트리거 events_zz_gcal_stamp, RPC gcal_push_candidates / gcal_soft_delete_stale_run. 적용 순서: 이 마이그레이션 → database.types.ts 재생성(npm run db:types:remote; web/src/features/google/api.ts 의 `as never` 캐스트 제거) → gcal-sync 재배포. 마이그레이션 전에 웹이 먼저 배포돼도 getConnection 은 push_local 없이 읽도록 폴백한다. 옛 gcal_soft_delete_stale 함수는 더 이상 쓰지 않는다.
- 미검증(실연동 필요): Google events.patch/insert 의 null 필드 삭제 동작, 인스턴스 id(마스터id_원래시작) patch 가 예외를 만드는 동작, privateExtendedProperty 검색, 종일 반복 UNTIL 날짜 형식 수용, If-Match 412. 실연동 점검 절차에 양방향 항목을 추가했다.

## 실연동 점검 절차 (배포 후)

사전: 마이그레이션 2개 적용됨, Edge secrets(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENC_KEY) 등록, `npx supabase functions deploy gcal-sync`, 구글 콘솔 리디렉션 URI 등록 + 동의 화면 "프로덕션(미검증)". 로컬 웹은 `npm run dev`(http://localhost:3000, ALLOWED_RETURN_ORIGINS 기본값과 일치).
1. `GET <SUPABASE_URL>/functions/v1/gcal-sync/health` → `{"ok":true}` (배포·라우팅 확인).
2. 설정 > Google 캘린더 → "Google 계정 연결" → 구글 동의(캘린더 권한 모두 허용) → 설정 화면으로 복귀하며 "연결했어요" 안내와 자동 첫 동기화. 기본 캘린더(primary)만 체크돼 있어야 한다.
3. 캘린더 목록에서 가져올 캘린더 체크(체크하면 즉시 동기화). 공휴일 같은 읽기 전용 캘린더는 "읽기 전용" 표시.
4. "지금 동기화" → 마지막 동기화 시각 갱신. /calendar 에서 구글 일정이 G 배지로 보이고(수정·드래그 불가), 종일·여러 날 일정이 구글과 같은 날짜인지, 반복 일정(예외·삭제된 회차 포함)이 구글과 같은지 대조.
5. 구글 앱에서 일정 하나를 수정·삭제·추가 → 앱에서 "지금 동기화"(또는 15분 대기) → 반영, 중복 없음.
6. (양방향) 설정에서 "양방향" 확인 → 앱 /calendar 에서 새 일정(예: 업무 캘린더)을 만들고 1~2초 뒤 구글 mycal 에 같은 일정이 생기는지 확인 → 앱에서 제목·시간 수정 → 구글에 반영 → 구글 앱에서 같은 일정 수정 후 앱 "지금 동기화" → 앱에 반영(중복 없음) → 앱에서 삭제(확인 문구 "Google 캘린더(mycal)에서도 삭제됩니다") → 구글에서도 삭제. 반복 일정: 앱에서 매주 월·수 반복 생성 → 구글에서 같은 요일 반복, 앱에서 "이번만" 수정/삭제 → 구글에 해당 회차만 반영. 충돌 확인: 양쪽에서 같은 일정을 고친 뒤 동기화 → 나중에 고친 쪽 채택, `select kind, detail from sync_logs where kind = 'conflict' order by created_at desc limit 5;` 에 덮어쓴 값 기록.
7. 연결 해제 → google_connections 행 삭제, https://myaccount.google.com/permissions 에서 앱 권한 사라짐 확인. 다시 연결해도 일정이 중복되지 않아야 한다(google_event_id 로 갱신).
실패 시 확인할 곳:
- 화면의 오류 배너(last_error): invalid_grant = 토큰 만료/철회(동의 화면 "테스트" 상태면 7일), forbidden = 권한 거부, invalid_client = client id/secret 불일치.
- Edge Function 로그: Supabase Dashboard > Edge Functions > gcal-sync > Logs (오류 코드만 기록, 토큰·code 는 로그에 남기지 않는다). 콜백이 "state 가 올바르지 않거나 만료" 텍스트를 보이면 연결을 처음부터 다시(10분 제한).
- DB: `select kind, detail, created_at from sync_logs order by created_at desc limit 20;` (일시 오류·캘린더 404 기록), `select last_synced_at, last_error, sync_lock_until, sync_token_by_calendar from google_connections;` (락이 3분 넘게 남아 있으면 이전 실행이 비정상 종료한 것 — 자동 해제됨). 전체 재동기화를 강제하려면 해당 캘린더의 sync_token_by_calendar 키를 지우고 동기화.
- cron: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'gcal-sync-all') order by start_time desc limit 5;` 와 Vault 비밀값(project_url, service_role_key) 존재 여부.
- 리디렉션 URI 불일치(redirect_uri_mismatch)는 구글 콘솔의 URI 와 위 콜백 URL 을 글자 단위로 비교.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/07-gcal-sync.md 를 읽고 07 gcal-sync 세션을 진행해줘.
브랜치 feat/gcal-sync 에서 작업해줘. 02 calendar 의 events CRUD와 종일/반복 저장 규칙이 main에 있는지 먼저 확인하고, 없으면 알려줘.
시작 전에 Google OAuth 클라이언트와 TOKEN_ENC_KEY secret이 준비됐는지 나에게 확인해줘(동의 화면 게시 상태 포함).
먼저 가져오기 전용(A→E)을 끝내고 안정화한 뒤 양방향(F)을 진행해줘.
```
