# 04. ledger — 가계부

> 먼저 `00-overview.md`를 읽는다. 01의 계약 커밋 후 본격 시작. **웨이브 2.**

## 목표
거래 등록·내역부터 통계, 예산, 고정지출, 계좌까지 가계부 전체를 실데이터로 구현한다. 목업(`components/screens/Ledger.tsx`, 빠른 추가의 지출 탭)을 이식한다. 하루 사용이 가능한 MVP(M2)의 핵심이다.

## 선행 조건 / 의존
- 01: `transactions`, `categories`, `accounts`, `budgets`, `recurring_payments`, `receipts` 테이블·RLS, `account_balances` 뷰, 기본 카테고리·"현금" 계좌, 라우트 `/ledger/*`, `QuickAddProvider`.
- 05(후속): 예산 80/100%·결제 예정 알림은 05 `notify`가 04가 제공하는 SQL 함수/뷰를 스캔해 생성한다.
- 계약 전에 가능한 작업: UI 이식, 통계 계산 순수 로직(카테고리 비율, 전월 대비, 월별 추이)과 테스트.

## 담당 요구사항
| ID | 내용 | 우선순위 |
|---|---|---|
| LED-1 | 거래 필드: 날짜(기본 오늘), 금액(양의 정수 원), 구분(수입/지출/이체), 카테고리, 계좌, 메모 | P0 |
| LED-2 | 거래 등록·수정·삭제, 최근 사용 카테고리·메모 자동완성 | P0 |
| LED-3 | 내역 목록: 기간·구분·카테고리·계좌·금액 범위 필터, 필터 결과 합계 | P0 |
| LED-10 | 카테고리 CRUD(수입/지출, 색, 아이콘). 거래가 있는 카테고리는 삭제 대신 보관 | P0 |
| LED-4 | 월별 달력 보기: 날짜별 수입/지출 합계 | P1 |
| LED-5 | 통계: 카테고리 비율(도넛), 월별 추이, 전월 대비 | P1 |
| LED-6 | 예산: 월 총예산·카테고리별, 80%·100% 도달 알림 | P1 |
| LED-7 | 고정지출/구독: 결제일에 거래 자동 생성, 하루 전 알림 | P1 |
| LED-8 | 계좌: 유형, 초기잔액, 현재잔액(계산), 계좌 간 이체 | P1 |
| LED-9 | 영수증 사진 첨부(Storage), 거래당 최대 3장 | P2 |

## 소유 경로
`web/src/app/ledger/`, `web/src/features/ledger/` (`api.ts`, `hooks.ts`, `components/`, `lib/`)

## 작업 목록

### A. 거래 데이터 계층 (P0)
- [x] `api.ts`: `listTransactions(filter)`(기간·type·category·account·금액 범위, 날짜 내림차순), `createTransaction`, `updateTransaction`, `deleteTransaction`(**하드 삭제**), `getSummary(filter)`(수입/지출/순액/건수 — DB 집계 쿼리 또는 RPC로 서버 측 합산).
- [x] 금액은 정수 원. 입력 파서는 쉼표·"원"·공백을 제거하고 정수만 허용, 0·음수·소수 거부(`lib/money.ts` + 테스트). 표시는 `toLocaleString('ko-KR')`. 부호는 `type`으로 결정(목업: 지출 `−`, 수입 `+`, 이체 `⇄`).
- [x] 이체는 `to_account_id` 필수·`category` 없음. 같은 계좌 간 이체 거부.
- [x] 자동완성: 최근 사용 카테고리 TOP N, 메모 prefix 추천(최근 거래에서 distinct) — `listRecentCategories()`, `suggestMemos(prefix)`.

### B. 내역 화면 (P0)
- [x] `components/LedgerList.tsx`: 목업의 필터 칩 4종(구분 탭 + 기간/카테고리/계좌/금액 범위), 요약 카드 3개(수입/지출/필터 결과 순액·건수), 날짜별 그룹+그룹 합계, 행(카테고리 칩·메모·계좌·금액). 필터는 URL 쿼리에 동기화.
- [x] 거래 클릭 → 수정 모달, 삭제 시 **확인 모달 후 즉시 삭제**(소프트 삭제 아님).
- [x] 빠른 추가: `features/ledger/quick-add.tsx`를 'tx'로 등록. 큰 금액 입력, 구분 토글, 최근 카테고리 칩, 계좌·날짜(기본 오늘)·메모. **1건 10초 이내** 입력(G4)이 목표: 금액 포커스 자동, Enter 저장, 마지막 사용 계좌 기억.
- [x] 거래 `badge`("Claude에서 기록")는 MCP가 `memo`/출처 필드로 표시할 수 있게 추가 컬럼 `source`(`web`/`mcp`)를 추가 마이그레이션으로 제안 → 06과 합의(`REQUESTS.md`).

### C. 카테고리 CRUD (P0)
- [x] `listCategories(kind)`, `createCategory`, `updateCategory`, `archiveCategory`, `deleteCategory`. **거래가 있으면 삭제 대신 `archived=true`** (삭제 시도 시 보관 처리 안내). 보관된 카테고리는 입력 목록에서 제외하되 과거 거래에는 그대로 표시.
- [x] 이름 유일성(사용자 내) 추가 마이그레이션 `unique(user_id, kind, name)` — MCP의 이름 해석 때문.
- [x] 설정 → 카테고리·태그(08)가 재사용하도록 api export.

### D. 월 달력 (P1)
- [x] `/ledger/calendar`: 날짜 셀에 수입(+)/지출(−) 합계. 날짜 클릭 시 해당 일 거래 목록. 일별 합계는 서버 집계(`group by date`).

### E. 통계 (P1)
- [x] `/ledger/stats`: 카테고리별 도넛(Recharts `PieChart`, 목업 색), 범례(금액·비율), 월별 추이 막대(최근 6개월, 단위 만원), 전월 대비(전체·카테고리, 같은 기간 1–N일 비교).
- [x] 계산은 `lib/stats.ts` 순수 함수 + 테스트(0 나누기, 전월 0원, 합계 일치). 서버 집계 결과를 입력으로 받는다.
- [x] 차트 색 접근성: 색 외에 범례 텍스트를 항상 병기.

### F. 예산 (P1)
- [x] `budgets`: `month`(date, 매월 1일), `category_id null`=총예산, `amount`. 총예산/카테고리 예산 편집 UI(+ 카테고리 예산 추가 카드).
- [x] 소진율 표시: 진행바, 80% 도달·100% 초과 상태 색(목업: ≥80% 라임, ≥100% 경고), "N원 남음 / N원 초과", 남은 일수 기준 하루 사용 가능액.
- [x] **알림 계약**: SQL 함수 `budget_usage(p_user uuid, p_month date)` → `(category_id, budget, spent, ratio)` 를 추가 마이그레이션으로 제공. 05 `notify`가 거래 insert 이후 스캔해 80%·100% 첫 도달 시 1회만 알림을 만든다(중복 방지를 위해 `budgets`에 `alerted_80_at`, `alerted_100_at` 컬럼을 추가하는 것을 05와 합의).
- [x] 월이 바뀌면 이전 달 예산을 복사하는 "지난달 예산 불러오기" 버튼.

### G. 고정지출 (P1)
- [x] `recurring_payments` CRUD UI(이름·금액·주기 월/년·결제일·카테고리·계좌·활성 토글). 월 고정지출 합계, "내일 결제" 카드.
- [x] **자동 등록**: pg_cron 매일 00:10(KST 기준 시간대에 유의 — Supabase cron은 UTC, 15:10 UTC) → `next_run_date <= today`인 활성 항목에 대해 `transactions` insert(`recurring_id` 설정) + `next_run_date` 갱신. 하나의 SQL 함수 `run_recurring_payments()`로 트랜잭션 처리, **멱등**(같은 `recurring_id`+날짜 중복 insert 방지 unique 인덱스), 누락 일수 보정(여러 날 밀린 경우 모두 생성). 말일 처리(31일·2월 29/30/31일 → 말일).
- [x] 결제 하루 전 알림은 05가 `recurring_payments`를 스캔한다(04는 데이터·`next_run_date` 정확성만 보장).

### H. 계좌 (P1)
- [x] `/ledger/accounts`: 계좌 카드(은행/현금/카드), 현재잔액은 `account_balances` 뷰, 순자산(카드 부채는 음수). 계좌 CRUD(보관), 초기잔액.
- [x] 계좌 간 이체 모달 → `transfer` 거래 1건 생성(`account_id`→`to_account_id`). 최근 이체 목록.
- [x] v1은 단순 이체만, 카드 결제일 정산은 제외(PRD §14-7).

### I. 영수증 (P2)
- [x] `receipts` 버킷(비공개)에 업로드, 서명 URL로 표시, 거래당 최대 3장(DB·UI 모두 제한), 거래 삭제 시 파일도 삭제. 이미지 용량 제한·압축.

## 제공하는 계약
- `features/ledger/api.ts`(`listTransactions`, `createTransaction`, `getSummary`, `listAccounts`, `listCategories`, `searchTransactions`)
- SQL 함수 `budget_usage`, `run_recurring_payments`
- 'tx' 빠른 추가 컴포넌트
- 대시보드용 쿼리: 이번 달 지출/수입/잔액/예산 소진율, 최근 거래 5건, 지출 TOP3 카테고리 (08이 사용)

## 지켜야 할 규칙 · 함정
- 금액: 정수 원, 소수점·음수 불가. DB `check (amount > 0)`와 클라이언트 검증 모두.
- 계좌 잔액은 **저장하지 않는다**. 항상 뷰에서 계산.
- 거래 삭제는 즉시(하드) 삭제이지만 반드시 확인 모달.
- 날짜는 `date`(거래일). 월 경계 계산에 사용자 TZ의 "오늘"을 쓴다.
- 통계에서 이체는 지출·수입 합계에서 제외한다(자산 이동일 뿐).
- cron은 UTC로 동작한다.

## 완료 기준
- [ ] 웹에서 지출 1건을 10초 이내에 등록할 수 있고 내역·합계·계좌 잔액에 즉시 반영된다.
- [ ] 필터(기간·구분·카테고리·계좌·금액 범위) 결과와 합계가 SQL 직접 집계와 일치한다.
- [ ] 거래가 있는 카테고리 삭제 시도가 보관 처리된다.
- [ ] 고정지출이 결제일에 자동 등록되고 같은 날 두 번 실행해도 중복되지 않는다(SQL 테스트).
- [ ] `lib/money.ts`, `lib/stats.ts` 단위 테스트 통과.
- [ ] `npm run lint`, `npm run build` 통과. `AGENTS.md`에 테스트 명령 추가.

## 인수인계 메모
**상태(2026-10-14, 브랜치 feat/ledger):** LED-1~8, 10 구현. 단위 테스트 26개·lint·build 통과. **실DB 연동 검증 미실시**(Docker·Supabase 없음). LED-9 영수증은 2026-10-19 구현.
- **추가 마이그레이션:** `20261014110000_ledger_fns.sql` — `transactions.source`(web/mcp, 기본 web), `budgets.alerted_80_at/alerted_100_at`, 함수 `budget_usage(p_user, p_month)`, `pay_date_in`, `next_pay_date`, `run_recurring_payments(p_today)`, pg_cron `run-recurring-payments`(`10 15 * * *` = 00:10 KST). PGlite로 검증: 말일 보정(31일→2/28,3/31), 밀린 날 일괄 생성, 재실행 시 0건(멱등), 비활성 제외, 연간, 예산 집계(이체·수입·타월 제외). cron 등록 줄은 PGlite에 pg_cron이 없어 제외하고 검증함 — 실DB 적용 시 pg_cron 확장 필요(01 마이그레이션이 이미 create extension).
- **budget_usage 시그니처:** `budget_usage(p_user uuid default null, p_month date default null) → (category_id, budget bigint, spent bigint, ratio numeric)`. category_id null = 총예산. 로그인 사용자는 auth.uid()가 우선, service role(05 notify·06 MCP)은 p_user 필수. 지출(type=expense)만 집계. 05 알림: `alerted_80_at/alerted_100_at`를 notify가 갱신(예산 행당 1회).
- **run_recurring_payments:** service_role만 실행 가능(일반 사용자 권한 없음). 사용자 시간대(`profiles.timezone`) 기준 오늘로 판정. `(recurring_id,date)` 유니크 인덱스(01 스키마)로 중복 방지. 생성 거래의 source는 web.
- **database.types.ts:** Docker가 없어 해당 부분만 수기 수정(web·_shared 동일). Supabase 연결 후 `supabase gen types --project-id`로 재생성 필요.
- **서버 집계 대신 클라이언트 합산:** 필터 결과·요약·통계는 `listTransactions`(1000건 단위 페이지 조회)로 가져와 `lib/summary.ts`/`lib/stats.ts`로 계산. 개인용 규모 가정이며, 결과가 SQL 직접 집계와 일치하는지는 실DB 연결 후 확인 필요(완료 기준).
- **통계 규칙:** 이체는 수입·지출 합계에서 제외. 전월 대비는 이번 달이면 오늘 일자까지, 지난 달이면 말일까지 같은 기간 비교.
- **차트:** recharts 추가(통계 화면만 번들 108kB).
- **제공 계약:** `features/ledger/api.ts` — listTransactions/createTransaction/getSummary/listAccounts/listCategories/searchTransactions/getMonthOverview(이번 달 수입·지출·최근 5건·지출 TOP3)/budgetUsage. CategoryManager 컴포넌트는 설정 화면(08)에서 재사용 가능.
- **알려진 제한:** 목업 `screens/Ledger.tsx`·`lib/data.ts` 일부는 구 목업 App.tsx가 참조 중이라 삭제하지 않음. 내역 행의 영수증 표시/첨부 UI 없음.

## 시작 프롬프트
```
docs/agents/00-overview.md 와 docs/agents/04-ledger.md 를 읽고 04 ledger 세션을 진행해줘.
브랜치 feat/ledger 에서 작업하고, 01 foundation 계약이 main에 있으면 병합해서 시작해줘. 아직 없으면 UI 이식과 순수 로직(money.ts, stats.ts)+테스트부터 해줘.
소유 경로 밖은 수정하지 말고, 필요하면 docs/agents/REQUESTS.md에 남겨줘. P0 → P1 → P2 순서를 지켜줘.
```

- **LED-9 영수증(2026-10-19):** 새 마이그레이션 없음(01의 receipts 테이블·비공개 버킷·정책·3장 제한 트리거 사용). 업로드는 캔버스로 긴 변 1600px JPEG(0.8) 압축 후 `<user_id>/<transaction_id>/<uuid>.jpg` 에 저장, DB 기록이 실패하면(3장 초과 등) 올린 파일을 지운다. 원본 10MB·이미지 형식 검사(`lib/receipts.ts`), 서명 URL 1시간. 거래 삭제(`deleteTransaction`) 시 영수증 파일을 먼저 지운다. 계정 삭제 시 파일 제거는 01이 `lib/auth.ts`에서 이미 구현해 중복 구현하지 않았다. UI: 거래 수정 모달의 `ReceiptSection`(수정 화면에서만, 이체 제외), 내역 행에 📎N. HEIC는 브라우저가 디코딩 못 하면 안내 문구와 함께 거부(미검증). 실제 업로드·정책은 실DB 연결 후 확인 필요.
