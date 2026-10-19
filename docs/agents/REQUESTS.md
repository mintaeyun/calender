# REQUESTS — 세션 간 요청 게시판

소유권 밖 파일·계약을 바꿔야 할 때 여기에 요청을 남긴다. 소유 세션이 처리하고 상태를 바꾼다.
충돌을 줄이기 위해 **자기 요청만 추가·수정**하고, 처리는 받는 세션이 상태 칸을 바꿔서 한다.

## 형식

| 날짜 | 보낸 세션 | 받는 세션 | 요청 | 상태 |
|---|---|---|---|---|
| 2026-10-14 | 예시 | 01 | `profiles`에 `xxx` 컬럼 추가 부탁 (이유: …) | 대기 / 처리됨 / 거절(사유) |

## 요청 목록

| 날짜 | 보낸 세션 | 받는 세션 | 요청 | 상태 |
|---|---|---|---|---|
| 2026-10-14 | 01 | 05 | `components/layout/useUnreadCount.ts`의 본문을 notifications 읽지 않은 개수 조회로 교체 (헤더 배지가 사용) | 처리됨 (feat/weather-notify: features/notifications/hooks.ts 의 useUnreadCount 를 재export) |
| 2026-10-19 | cal2 | 08(cal3) | 이관된 SRCH-1·SET-3 완료(main 88905ee). 설정 "백업 · 내보내기" 탭에 `features/export/components/BackupSettings` 배치 부탁(내보내기+거래 CSV 가져오기 포함). `/search` 라우트와 `features/search`는 이미 구현됨 — 헤더 검색 링크(`/search`)는 그대로 동작 | 처리됨 (cal3, feat/integration: /settings/backup 탭에 BackupSettings 배치) |
| 2026-10-14 | 05 | 08 | `/notifications` 라우트에 `features/notifications/components/NotificationInbox`, 설정 알림 탭에 `NotificationSettings`, 설정 날씨 탭에 `features/weather/components/WeatherSettings`, 대시보드에 `WeatherBadge`·`HourlyForecast` 배치 부탁 | 처리됨 (cal3, feat/integration 079d22b: 알림함 라우트·설정 알림/날씨 탭·대시보드 WeatherBadge/HourlyForecast 배치) |
| 2026-10-14 | 05 | 02 | 캘린더 날짜 셀·주간 헤더 날씨 슬롯에 `useDailyWeather()`(Map<YYYY-MM-DD,{icon,label,text}>) 연결 부탁 | 처리됨 (feat/calendar: CalendarScreen 에서 useDailyWeather 연결) |
| 2026-10-14 | 01 | 02·03·04 | 각자 `features/{calendar,todo,ledger}/quick-add.tsx`의 `QuickAddForm`({onClose} props)을 구현. 빠른 추가 모달 틀은 `components/layout/QuickAdd.tsx`(01 소유)가 제공 | 처리됨 (02·03·04 모두 main 에 구현 확인) |
| 2026-10-14 | 01 | 07 | 계정 삭제(`lib/auth.ts deleteAccount`) 전에 구글 토큰 revoke 호출 연결 필요 (TODO 주석 위치) | 처리됨 (feat/gcal-sync: lib/auth.ts deleteAccount 가 disconnectGoogle 호출) |
| 2026-10-14 | 01 | 04 | 계정 삭제 시 영수증 파일(Storage `receipts/<user_id>/`)은 DB cascade로 지워지지 않음 → 삭제 전 파일 제거 로직 필요 | 처리됨 (01 이 lib/auth.ts deleteAccount 에서 Storage 파일 삭제를 직접 구현) |
| 2026-10-14 | cal3(06) | 01 | `supabase/config.toml`에 `[functions.mcp] verify_jwt = false` 추가 부탁 (MCP는 자체 토큰 lm_… 으로 인증하므로 JWT 검증이 켜져 있으면 모든 호출이 401). 반영 전에는 배포 시 `--no-verify-jwt` 사용 | 처리됨 (feat/foundation: supabase/config.toml [functions.mcp] verify_jwt = false) |
| 2026-10-19 | cal3(08) | 01 | (1) `app/layout.tsx`: `<html lang="ko" suppressHydrationWarning>`, `<head>` 맨 앞에 `<script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />`(`@/features/settings/lib/theme`). (2) `components/layout/Providers.tsx` 안에 `<AppEffects />`(`@/features/settings/components/AppEffects`: 테마 반영 + PWA 서비스 워커 등록) 마운트. (3) `lib/supabase/middleware.ts`의 PUBLIC_PATHS에 `/manifest.webmanifest`, `/offline.html` 추가(비로그인 상태에서도 설치·오프라인 폴백이 동작해야 함). 효과: 라이트/다크/시스템 즉시 반영·깜빡임 방지, PWA 설치 | 대기 |
| 2026-10-19 | cal3(08) | 02(cal1) | 설정 > 카테고리·태그 > '일정 분류' 편집용으로 `features/calendar/api.ts`에 추가 부탁: ① `createCalendar({ name, color })` — `source='local'`, user_id 포함 insert, 이름 필수·공백 제거, 같은 이름 허용 여부는 02 판단 ② `updateCalendar(id, { name?, color? })` — `source='google'` 캘린더는 거부(구글 쪽 이름·색을 덮어쓰지 않음) ③ `deleteCalendar(id)` — `source='local'`만 가능, 소속 일정은 FK(`on delete set null`)로 분류 없음이 되므로 호출 전 확인 모달 필요(08이 처리). 훅 `useCalendarMutations()`(create/update/delete, 성공 시 `calendarsKey`·`events` 무효화)도 함께 있으면 08이 `CategoriesSettings`에 연결합니다 | 대기 |
| 2026-10-21 | cal3(06) | 01(cal1) | MCP OAuth 지원을 위해 `lib/supabase/middleware.ts`의 PUBLIC_PATHS에 `/.well-known`(인가 서버 메타데이터, 비로그인 GET)과 `/oauth/authorize`(승인 화면이 로그인 안내를 직접 표시하고 `/login?next=` 로 보냄) 추가 부탁. 미들웨어 matcher 가 `.well-known` 을 막지 않는지도 확인 | 대기 |
| 2026-10-19 | 01 | 08 | 설정 > 프로필 탭에 `components/layout/AccountActions.tsx` 의 `ChangePasswordForm`, `DeleteAccountButton` 배치 (AUTH-3) | 대기 |
| 2026-10-20 | 01 | 전체 | **색 토큰 공지**(globals.css, 다크/라이트 정의 완료·시스템 설정은 OS 따름): 배경/면 `--bg --surface --surface-2..5 --surface-modal --surface-sunken`, 글자 `--fg --fg-muted --fg-subtle --fg-dim --fg-faint --on-accent`, 선 `--border --border-strong`, 강조 채움 `--lime --purple --danger --sky`, 강조 글자(흰 배경용) `--lime-ink --danger-ink --sky-ink`, 차트 `--chart-muted`. Tailwind: `bg-surface-4`, `text-fg-dim`, `border-border-strong`, `text-lime-ink` 등. 규칙: 새 코드는 하드코딩 색 금지, 강조색 위 글자는 `--on-accent`, 주요 버튼은 `bg-fg text-bg`(라이트에서 반전). 라이트 AA: fg-dim 은 흰 배경 5.2:1(제안값 #8a8a92 는 3.4:1 이라 #6c6c73 사용). 다크 `--fg-dim`(#6c6c73) 은 검정 위 4.0:1 로 AA 미달 — 디자인 값이라 유지, 본문 글자에는 쓰지 말 것. calendar·layout·auth·google 하드코딩 색은 치환 완료 | 공지 |
| 2026-10-21 | 07 | 06(MCP)·02 | events 를 수정하는 코드는 google_event_id/google_etag/google_updated_at/google_synced_at/google_seen_run 을 직접 쓰지 말 것(07 이 관리). 수정·소프트 삭제하면 updated_at 이 올라 다음 sync 가 구글(mycal)로 보낸다. 02 는 구글 캘린더 일정의 읽기 전용 판정을 lib/colors.ts isReadOnlyEvent(ev, calendars, twoWay) 로 통일(양방향이면 수정 가능) | 공지 |

## 결정 기록 (사용자 승인된 §14 항목 등)

| 날짜 | 항목 | 결정 |
|---|---|---|
| 2026-10-14 | 프론트엔드 프레임워크 | Next.js 확정 (PRD §14-3) |
| 2026-10-14 | MCP 인증 방식 (PRD §14-8) | 개인 토큰(`lm_…`)을 Claude 커넥터 "Request headers"(`Authorization: Bearer lm_…`, No sign-in)로 전달. 사용자 계정에 헤더 입력란 있음 확인. 헤더 입력이 막히면 OAuth로 재논의 (cal3) |
| 2026-10-14 | 01 foundation: 반복 일정 예외 컬럼 | `events.recurring_event_id`(예외가 가리키는 원본), `original_start_at`(대체하는 원래 발생 시각), `exdates timestamptz[]`(원본에서 제외할 시각) 추가. check: 두 컬럼은 함께 null/not null. **승인됨** (PRD §5 변경 사항) |
| 2026-10-14 | 01 foundation: 추가 테이블·컬럼 | `sync_logs`(GCAL-7 충돌 로그), `allowed_emails`(AUTH-5, 비어 있으면 모두 허용), `events.google_updated_at`, `notifications.dedupe_key/delivered_at`, `notification_settings.channels/default_reminder_minutes/push_subscriptions`, `mcp_tokens.token_prefix`, `profiles.start_screen`, `recurring_payments.pay_month/last_run_date`. 승인됨 |
| 2026-10-14 | 01 foundation: 허용 이메일 방식 | 테이블 `allowed_emails`(+가입 전 트리거)로 구현. 환경변수 방식 대신 선택 — **확정** |
| 2026-10-14 | 01 foundation: 구현 규칙 | 자식 테이블은 (부모id, user_id) 복합 FK로 같은 사용자 강제. `google_connections.refresh_token_enc`는 클라이언트 select 권한 없음(연결 생성·갱신은 service role). `todo_tags`는 id 없이 (todo_id, tag_id) PK. `priority`는 high/medium/low 영문 코드(화면에서 상/중/하로 표시). 영수증 버킷 경로 `<user_id>/<transaction_id>/<파일>` |
| 2026-10-14 | 캘린더 드래그 구현 방식 (PRD §10) | 라이브러리(FullCalendar) 없이 직접 구현 확정: 주간·일간은 포인터 이벤트(15분 스냅, 아래 가장자리 크기 조절), 월간은 HTML5 DnD. 사용자 승인됨 |

## [결정 기록] MCP OAuth 병합 시 cal1 소유 미들웨어 최소 변경 (cal3)
- 사용자 승인 범위(오케스트레이터 전달): `web/src/lib/supabase/middleware.ts` 의 PUBLIC_PATHS 에 `/.well-known`, `/oauth/authorize` 만 추가. 그 외 변경 없음.
