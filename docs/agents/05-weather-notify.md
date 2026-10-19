# 05. weather-notify — 날씨 · 알림

> 먼저 `00-overview.md`를 읽는다. 날씨(`weather`)는 웨이브 2, 알림(`notify`)은 02·04의 데이터가 생긴 뒤 웨이브 3에서 마무리한다.

## 목표
외부 날씨 API를 서버에서만 호출·캐시해 앱 전체에 날씨를 공급하고, 일정·할일·예산·결제·우천·동기화 오류 알림을 생성·표시·발송하는 알림 시스템을 만든다.

## 선행 조건 / 의존
- 01: `weather_cache`, `notifications`, `notification_settings`, `profiles.weather_location`, `_shared/`, 헤더의 알림 배지 자리.
- 02: `events`, `event_reminders`, `recurrence.ts`(반복 전개) — 일정 시작 알림·우천 알림에 필요.
- 03: `todos`(마감 알림). 04: `budget_usage()`, `recurring_payments`(예산·결제 알림). 07: 동기화 오류(`google_connections.last_error`).
- 사용자: 웹 푸시용 VAPID 키 생성(선택, NOTI-2 웹 푸시 시점).
- 가능한 먼저 작업: 날씨 전체(W 섹션)는 02~04와 독립이므로 웨이브 2에서 바로 한다.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| WX-1 | 설정에서 기본 지역을 도시 검색으로 지정 | P0 |
| WX-2 | 대시보드 현재 날씨 + 오늘 시간별 예보 | P0 |
| WX-4 | 서버(Edge)에서만 외부 API 호출, 지역별 30~60분 캐시 | P0 |
| WX-7 | API 장애 시 마지막 캐시를 "업데이트 시각"과 함께 표시 | P0 |
| WX-3 | 캘린더 날짜 셀 일별 예보(7일) | P1 |
| WX-5 | 위치 있는 일정이 있는 날 비·눈(강수확률 ≥60%) 시 전날 저녁/당일 아침 알림 | P1 |
| WX-6 | 미세먼지(PM2.5/PM10) 등급 | P2 |
| NOTI-1 | 알림 종류: 일정 시작, 할일 마감, 예산 임박/초과, 결제 예정, 우천, 동기화 오류 | P1 |
| NOTI-2 | 채널: 앱 내 알림함, 웹 푸시(P1), 이메일(P2) | P1 |
| NOTI-3 | 종류별 on/off, 기본 알림 시간, 방해금지 시간대 | P1 |
| NOTI-4 | 알림함: 읽음, 전체 읽음, 삭제 | P1 |

## 소유 경로
`supabase/functions/weather/`, `supabase/functions/notify/`, `web/src/features/weather/`, `web/src/features/notifications/`

## 작업 목록

### W. 날씨

#### W1. Edge Function `weather` (P0)
- [x] `supabase/functions/weather/`: 입력 `lat, lon`(또는 `location_key`), 출력 정규화 JSON(`current`, `hourly[24]`, `daily[7]`, `fetched_at`, `stale`).
- [x] **`WeatherProvider` 인터페이스**로 추상화: `getForecast({lat,lon}) → NormalizedForecast`. 구현체 `OpenMeteoProvider`(기본, 키 불필요). 기상청 교체를 위해 제공처 선택은 환경변수 `WEATHER_PROVIDER`. 제공처 결정(PRD §14-1)은 권고안(Open-Meteo)으로 시작하고 사용자에게 확인한다.
- [x] 정규화 필드: 기온, 체감, 상태 코드(맑음/구름/비/눈 등 → 한국어 라벨·아이콘 키), 강수확률, 최고/최저, 시간별 강수확률, 일별 요약. (목업 표현: `18° 맑음 · 체감 17° · 19시 비 60%`, 캘린더 셀 `비 60%`/`17°`.)
- [x] **캐시**(WX-4): `weather_cache(location_key, payload, fetched_at)`. `location_key`는 위경도를 소수 둘째 자리 정도로 반올림한 값(같은 구역 사용자 공유). `fetched_at`이 30~60분 이내면 외부 호출 없이 캐시 반환. 동시 요청 폭주 방지(캐시 미스 시 단일 갱신).
- [x] **장애 폴백**(WX-7): 외부 호출 실패/타임아웃(5초) 시 마지막 캐시를 `stale: true`와 `fetched_at`과 함께 반환. 캐시도 없으면 명확한 오류 코드(`WEATHER_UNAVAILABLE`).
- [x] 비밀값(키가 필요한 제공처로 바뀔 때)은 Edge secrets에만.
- [x] 인증된 사용자만 호출(JWT 검증, `_shared/auth.ts`). 레이트 리밋 고려.

#### W2. 지역 검색·설정 (P0)
- [x] 도시 검색: Open-Meteo Geocoding(서버 경유 함수 `weather` 내 `?action=geocode&q=`) → 후보 목록(이름·행정구역·lat/lon). 선택 시 `profiles.weather_location`(name, lat, lon) 저장. "현재 위치" 버튼(브라우저 geolocation, 거부 시 안내).
- [x] 설정 → 날씨 탭 컴포넌트 `features/weather/components/WeatherSettings.tsx`를 export(08이 설정 화면에 배치). 온도 단위(℃/℉)는 `profiles.temp_unit`.

#### W3. 프론트 훅·위젯 (P0)
- [x] `features/weather/hooks.ts`: `useWeather()` → `{current, hourly, daily, updatedAt, stale, isLoading}`. `staleTime` 10분. 오류 시 이전 데이터 유지.
- [x] `components/WeatherBadge.tsx`: 대시보드 상단 칩(목업) — 기온·상태·체감·다음 강수 시각. `components/HourlyForecast.tsx`: 오늘 시간별.
- [x] "마지막 업데이트 13:10" 표기와 `stale` 시 안내 문구(한국어).
- [x] `useDailyWeather(range)` — 02 캘린더 셀용(WX-3, P1): `Map<'YYYY-MM-DD', {icon, label, tempOrPop}>`. 예보 7일 밖은 undefined.

#### W4. 미세먼지 (P2)
- [ ] 에어코리아 연동(키 필요, secrets). 별도 Provider/엔드포인트로 두고 등급(좋음/보통/나쁨/매우나쁨)을 `WeatherBadge`에 병기. 키 없으면 비활성.

### N. 알림

#### N1. 알림 데이터·설정 (P1)
- [x] `notifications`(`type,title,body,link,read_at,scheduled_at`) 생성 헬퍼 `createNotification()`를 `_shared`가 아닌 `supabase/functions/notify/lib/`에 둔다(소유 경로). 종류 enum: `event`, `todo`, `budget`, `pay`, `rain`, `sync`.
- [x] `notification_settings`: 종류별 on/off, 기본 알림 시간(일정 10분 전·할일 마감 당일 09:00), 방해금지(23:00–07:00). 설정 UI `NotificationSettings.tsx`(목업 토글 6개 + 채널 + 방해금지) export(08이 배치).
- [x] **방해금지**: 해당 시간대에 생성된 푸시는 보류했다가 종료 시각에 발송(앱 내 알림함 기록은 항상 남김).

#### N2. Edge Function `notify` 스캔 (P1)
- [x] pg_cron 5분마다 `notify` 호출(UTC 기준 `*/5 * * * *`). 한 번 실행에서 아래를 스캔해 **중복 없이**(멱등 키: `type + source_id + occurrence`) 알림 생성:
  - 일정 시작: `event_reminders.minutes_before`로 계산한 알림 시각이 [이전 실행, 지금] 구간에 든 일정. **반복 일정은 02의 `recurrence.ts`(`npm:rrule`)로 전개**해 인스턴스별 알림. 종일 일정 규칙은 02 인수인계 메모 참조.
  - 할일 마감: 마감 당일 설정 시각(기본 09:00) / 기한초과.
  - 예산: 04의 `budget_usage()`로 80%·100% 첫 도달 시 1회(`budgets.alerted_*_at` 갱신).
  - 결제 예정: `recurring_payments.next_run_date`가 내일인 항목을 전날 20:00.
  - 우천(WX-5): 위치(`events.location`)가 있는 일정이 있는 날, 해당 지역 캐시 예보의 강수확률 ≥60%이면 전날 저녁/당일 아침 알림. 지역 해석은 일정 `location`을 지오코딩하는 대신 v1은 **사용자 기본 지역의 예보**를 사용(결정 사항으로 인수인계 메모에 기록).
  - 동기화 오류: `google_connections.last_error`가 새로 생기면 재연결 안내 알림(07 협의).
- [x] 각 스캔 함수는 `last_run` 기준 구간 처리로 누락·중복 방지, 실패해도 다른 스캔이 계속된다. 로그를 남긴다.

#### N3. 알림함·배지 (P1)
- [x] `/notifications` 화면 컴포넌트(08이 라우트 연결, 또는 라우트가 01 껍데기면 05가 채워도 되는지 `REQUESTS.md`로 확인): 목업 `Notifications` 이식 — 종류 칩 색, 제목·본문·시각, 읽지 않음 점, 모두 읽음, 개별 읽음/삭제(NOTI-4).
- [x] 헤더 배지용 `useUnreadCount()` 훅(+ Supabase Realtime 구독으로 실시간 갱신). 01의 헤더가 이 훅을 사용하도록 `REQUESTS.md`로 연결 요청.
- [x] 알림 클릭 시 `link`로 이동하며 읽음 처리.

#### N4. 웹 푸시 (P1)
- [x] Service Worker + Push API, VAPID 키(공개키는 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, 비밀키는 Edge secrets), 구독 저장(`push_subscriptions` 추가 마이그레이션). 구독 권한 요청은 사용자 동작(버튼) 후에만. 만료된 구독(410) 자동 삭제.
- [x] 알림 생성 시 활성 구독으로 푸시 발송(방해금지 반영).

#### N5. 이메일 (P2)
- [x] 채널 UI는 "이메일 (준비 중)" 유지. 구현은 PRD §14-6 결정 후.

## 제공하는 계약
- Edge `weather` 응답 형식(정규화 스키마) 문서화 → `features/weather/types.ts`
- `useWeather()`, `useDailyWeather(range)` 훅, `WeatherBadge`, `WeatherSettings`
- `createNotification()` 헬퍼, `useUnreadCount()`, `NotificationSettings`, 알림함 컴포넌트
- 06 MCP의 `get_weather`, `get_today_overview`가 `weather` Edge 로직(또는 provider 모듈)을 재사용하도록 `supabase/functions/weather/provider.ts`를 import 가능한 모듈로 분리

## 지켜야 할 규칙 · 함정
- 외부 날씨 API는 **서버에서만** 호출. 클라이언트에서 직접 호출 금지.
- 캐시 TTL 30~60분. 장애 시 stale 표시를 반드시.
- cron/타임스탬프는 UTC, 사용자 알림 시각(09:00, 20:00, 방해금지)은 사용자 TZ로 변환해 판정.
- 알림은 **멱등**이어야 한다(5분마다 실행되므로 같은 알림이 중복 생성되면 안 됨).
- 푸시 구독/VAPID 비밀키를 클라이언트나 로그에 노출하지 않는다.
- 일정 `location`은 자유 텍스트라 정확한 지역 판정이 어렵다 → v1은 기본 지역 예보 사용(과장하지 말고 설정 화면에 명시).

## 완료 기준
- [ ] 대시보드(또는 임시 페이지)에서 현재 날씨·시간별 예보가 보이고, 같은 지역 반복 호출이 캐시를 쓴다(외부 호출 로그로 확인).
- [ ] 외부 API를 차단하면 stale 캐시와 업데이트 시각이 표시된다.
- [ ] 지역을 검색해 저장하면 날씨가 해당 지역으로 바뀐다.
- [ ] 10분 후 시작하는 일정 알림이 5분 스캔 내에 1건만 생성되고, 방해금지 시간엔 푸시가 보류된다.
- [ ] 예산 80% 도달 시 알림이 1회만 생성된다.
- [ ] 알림함에서 읽음/전체 읽음/삭제가 동작하고 헤더 배지가 갱신된다.
- [ ] `npm run lint`, `npm run build` 통과. `AGENTS.md`에 함수 로컬 실행/테스트 명령 추가.

## 인수인계 메모
**상태(2026-10-14, 브랜치 feat/weather-notify):** WX-1·2·3·4·7, NOTI-1~4 코드 구현. web 테스트 54개(`npm test`)·functions 테스트 36개(`npm run test:functions`)·lint·build 통과. **실DB·실서버 검증 미실시**(Docker·Deno·Supabase 배포 없음). Edge 엔트리(`weather/index.ts`, `notify/index.ts`, `notify/lib/run.ts`, `push.ts`)는 Deno 없이 tsc 스텁으로 타입만 점검(feat/ledger의 database.types 기준 통과) — **배포·실행은 한 번도 안 해봤다**.
- **의존:** run.ts는 04 ledger의 `budget_usage()`·`budgets.alerted_*_at`·`transactions` 변경과 03/04 타입을 쓴다. feat/ledger가 main에 들어온 뒤 병합해야 타입이 맞는다. 일정 알림은 02(main 병합됨)의 규칙을 따른다.
- **날씨:** 제공처 Open-Meteo 확정(사용자 결정). `WEATHER_PROVIDER` 환경변수로 교체 지점만 둠(기상청 미구현). 정규화 스키마는 `supabase/functions/weather/provider.ts`(Edge)와 `web/src/features/weather/types.ts`(웹)에 같은 모양으로 둠 — 한쪽을 바꾸면 다른 쪽도. 캐시 TTL 30분(`CACHE_TTL_MS`), 키 `location_key`=lat,lon 소수 둘째 자리 반올림. 외부 호출 5초 타임아웃, 동시 요청은 인스턴스 안에서만 합침(인스턴스 간 중복 호출은 가능). 장애 시 stale 캐시 + `stale:true`, 캐시도 없으면 503 `WEATHER_UNAVAILABLE`. WX-6(미세먼지)는 구조만 구현(아래 WX-6 항목).
- **알림 멱등 키(`notifications.dedupe_key`, unique(user_id,dedupe_key)):** 일정 `event_start:<id>:<발생 ISO>:<분>`, 할일 `todo_due:<id>:<마감일>:today|over`, 예산 `budget_warning|budget_exceeded:<budget id>:<YYYY-MM>`, 결제 `payment_due:<recurring id>:<결제일>`, 우천 `rain_forecast:<날짜>:evening|morning`, 동기화 `sync_error:<날짜>`.
- **스캔 방식 결정:** last_run 테이블 대신 "지금 − 15분 ~ 지금" 창을 5분마다 훑고 dedupe_key로 중복을 막는다(한두 번 실패해도 놓치지 않음, 장기 중단 시 그동안의 알림은 버려짐). 기본 알림 시각: 할일 09:00, 결제 전날 20:00, 우천 전날 20:00·당일 07:00(모두 사용자 시간대).
- **일정 알림 규칙:** 알림(event_reminders)을 지정한 일정만 알린다. `notification_settings.default_reminder_minutes`는 새 일정의 기본 선택값(02 폼 연동)이지 알림 없는 일정에 자동 적용하지 않는다. 일정 전개는 `notify/lib/events.ts`에 02 `recurrence.ts`/`allday.ts`와 같은 규칙으로 별도 구현했고, `events.test.ts`가 web 구현과의 일치(parity)를 검증한다 — 02의 규칙을 바꾸면 이 테스트가 깨지므로 같이 고친다.
- **우천 판정 결정(v1):** 일정 `location`을 지오코딩하지 않고 **사용자 기본 지역(profiles.weather_location)의 예보**를 쓴다. 장소가 있는 일정(반복 포함)이 있는 날 강수확률 ≥ 60%. 설정 화면에 안내 문구 있음.
- **푸시:** 구독은 `notification_settings.push_subscriptions`(jsonb, endpoint 기준 중복 제거)에 저장(별도 테이블 아님 — 01 스키마). 방해금지에 걸린 건 앱 내 기록만 남기고 `delivered_at`을 비워 두었다가 방해금지가 끝난 스캔에서 발송(최근 24시간분). 404/410 구독은 자동 삭제. **필요한 값(사용자):** VAPID 키 쌍 — 공개키 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(web), `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`(Edge secrets). 없으면 푸시는 건너뛰고 설정 화면에 안내. 서비스 워커는 `web/public/push-sw.js`(푸시 전용; 앱 셸 캐싱/PWA는 08). `npm:web-push`의 Deno 호환은 미검증.
- **추가 마이그레이션:** `20261014120000_notify_cron.sql`(pg_net + `invoke_notify()` + cron `*/5 * * * *`; **Vault에 project_url, service_role_key 시크릿을 먼저 넣어야 동작** — 값은 사용자가 직접), `20261014120100_notifications_realtime.sql`(notifications를 supabase_realtime publication에 추가). 원격 DB에는 미적용.
- **프론트 제공물:** `features/weather`: useWeather/useDailyWeather/useWeatherLocation/useTempUnit, WeatherBadge, HourlyForecast, WeatherSettings. `features/notifications`: NotificationInbox, NotificationSettings, useUnreadCount(헤더 `components/layout/useUnreadCount.ts`가 재export), createNotification 헬퍼는 서버 쪽이 `notify/lib/run.ts`의 upsert 로 대체(별도 헬퍼 미작성). 라우트 연결·설정 탭 배치·캘린더 날씨 슬롯은 REQUESTS에 08·02 앞으로 요청해 둠.
- **공용 변경:** `web/vitest.functions.config.ts`(functions 테스트용, rrule·@ alias), `package.json`의 `test:functions`. `supabase/functions/notify/deno.json`은 rrule import map.
- **06 MCP 재사용:** `weather/provider.ts`(순수)·`weather/service.ts`(getForecast, 캐시 주입)·`weather/deps.ts`(createProvider, dbCacheStore)를 import 할 수 있다.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/05-weather-notify.md 를 읽고 05 weather-notify 세션을 진행해줘.
브랜치 feat/weather-notify 에서 작업해줘. 날씨(W 섹션)는 다른 세션과 독립이니 01 계약이 main에 들어오면 바로 시작하고, 알림 스캔(N2)은 02·03·04 데이터가 생긴 뒤 마무리해줘.
날씨 제공처(Open-Meteo)는 PRD 권고안으로 시작하되 확정 전에 나에게 확인해줘. 소유 경로 밖은 REQUESTS.md로 요청해줘.
```

- **WX-6 미세먼지(2026-10-19, 구조만):** `weather/air.ts` — 등급 판정(PM2.5 15/35/75, PM10 30/80/150), `AirQualityProvider` 인터페이스, `createAirProvider(key)`(키 없으면 null). `GET weather?action=air&lat&lon` 은 `AIRKOREA_API_KEY` 가 없으면 `{enabled:false}`, 키가 있어도 에어코리아 호출부는 미구현이라 503 `AIR_UNAVAILABLE`. 웹은 `useAirQuality()`가 비활성/장애 시 null 이라 `WeatherBadge`가 아무것도 그리지 않는다(활성 시 `미세먼지 좋음/보통/나쁨` 병기). **남은 일(키 발급 후):** WGS84→TM 변환, 근접 측정소 조회, 실시간 측정값 조회를 `AirKoreaProvider.getAir`에 구현. 키는 사용자에게 요청 필요(Edge secrets `AIRKOREA_API_KEY`).
