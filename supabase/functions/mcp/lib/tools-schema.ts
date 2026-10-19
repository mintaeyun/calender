// MCP 도구 정의(이름·설명·입력 스키마·필요 범위). PRD §4.8 명세 기준. 구현은 tools/ 에서 이 정의를 참조한다.
import type { Schema } from "./validate.ts";

export type Service = "calendar" | "todo" | "ledger" | "common";
export type Access = "read" | "write";
// mcp_tokens.scopes 와 같은 키(calendar/todo/ledger). 값: none|read|write
export type Scopes = { calendar: "none" | "read" | "write"; todo: "none" | "read" | "write"; ledger: "none" | "read" | "write" };

export type ToolDef = {
  name: string;
  service: Service;
  access: Access;
  description: string;
  inputSchema: Schema;
};

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string, extra: Partial<Schema> = {}): Schema => ({ type: "string", description, ...extra });
const dt = (d: string): Schema => str(d, { format: "date-or-time" }); // 날짜만 주면 시작=그날 0시, 끝=그날 끝
const day = (d: string): Schema => str(d, { format: "date" });
const id = (d = "대상 ID(UUID)"): Schema => str(d, { format: "uuid" });

const CONFIRM_DELETE = "**삭제는 되돌리기 어렵습니다. 반드시 사용자에게 삭제 의사를 확인한 뒤에만 호출하세요.** 한 번에 하나만 삭제할 수 있습니다.";
const AMBIGUOUS = "이름이 모호하면 후보가 담긴 오류가 반환되므로, 임의로 고르지 말고 사용자에게 물어보세요.";

export const TOOLS: ToolDef[] = [
  {
    name: "list_events", service: "calendar", access: "read",
    description: "기간 내 일정을 조회합니다. 반복 일정은 해당 기간의 발생분으로 펼쳐서 돌려줍니다. 예: 이번 주 일정 확인. 결과가 많으면 truncated=true로 표시됩니다.",
    inputSchema: obj({ start: dt("조회 시작(ISO 8601, 시간대 없으면 사용자 시간대)"), end: dt("조회 끝(ISO 8601)"), calendar: str(`캘린더 이름 또는 ID. ${AMBIGUOUS}`) }, ["start", "end"]),
  },
  {
    name: "search_events", service: "calendar", access: "read",
    description: "제목·장소·메모에서 키워드로 일정을 검색합니다. 기간을 주지 않으면 최근 1개월~미래 1년을 검색합니다.",
    inputSchema: obj({ query: str("검색어", { minLength: 1, maxLength: 100 }), start: dt("검색 시작"), end: dt("검색 끝") }, ["query"]),
  },
  {
    name: "find_free_time", service: "calendar", access: "read",
    description: "기간 내에서 지정한 길이 이상 비어 있는 시간 구간을 찾습니다. 기본은 평일 09:00–18:00(사용자 시간대)입니다. 일정 잡기 전에 가능한 시간을 제안할 때 사용하세요.",
    inputSchema: obj({
      start: dt("탐색 시작"), end: dt("탐색 끝"),
      duration_min: { type: "integer", description: "필요한 길이(분)", minimum: 5, maximum: 1440 },
      work_start_hour: { type: "integer", description: "업무 시작 시(기본 9)", minimum: 0, maximum: 23 },
      work_end_hour: { type: "integer", description: "업무 종료 시(기본 18)", minimum: 1, maximum: 24 },
      include_weekends: { type: "boolean", description: "주말 포함 여부(기본 false)" },
    }, ["start", "end", "duration_min"]),
  },
  {
    name: "create_event", service: "calendar", access: "write",
    description: "일정을 만듭니다. 종일 일정은 all_day=true로 하고 start/end에 날짜(YYYY-MM-DD)를 주세요(end는 마지막 날 포함). 생성된 일정 전체를 반환하니 사용자에게 확인해 주세요.",
    inputSchema: obj({
      title: str("제목", { minLength: 1, maxLength: 200 }), start: str("시작(ISO 8601 날짜·시간, 종일이면 YYYY-MM-DD)", { minLength: 10 }),
      end: str("종료(ISO 8601, 시작 이후)", { minLength: 10 }), all_day: { type: "boolean", description: "종일 여부" },
      location: str("장소", { maxLength: 200 }), notes: str("메모", { maxLength: 2000 }),
      reminders: { type: "array", description: "시작 몇 분 전에 알릴지 목록", items: { type: "integer", minimum: 0, maximum: 40320 }, maxItems: 5 },
    }, ["title", "start", "end"]),
  },
  {
    name: "update_event", service: "calendar", access: "write",
    description: "일정의 일부 필드를 수정합니다. 바꿀 필드만 넘기세요. 반복 일정의 일부만 바꾸는 수정은 지원하지 않으니, 필요하면 사용자에게 웹 앱에서 하도록 안내하세요.",
    inputSchema: obj({
      id: id("일정 ID"), title: str("제목", { minLength: 1, maxLength: 200 }), start: str("시작"), end: str("종료"),
      all_day: { type: "boolean" }, location: str("장소", { maxLength: 200 }), notes: str("메모", { maxLength: 2000 }),
    }, ["id"]),
  },
  {
    name: "delete_event", service: "calendar", access: "write",
    description: `일정을 삭제합니다(휴지통으로 이동, 30일 후 영구 삭제). ${CONFIRM_DELETE}`,
    inputSchema: obj({ id: id("일정 ID") }, ["id"]),
  },
  {
    name: "list_todos", service: "todo", access: "read",
    description: `할일을 조회합니다. status를 생략하면 미완료(todo·doing)만 돌려줍니다. ${AMBIGUOUS}`,
    inputSchema: obj({ status: str("상태(기본: todo·doing 미완료 전체)", { enum: ["todo", "doing", "done", "all"] }), due_before: day("이 날짜까지 마감인 것만"), project: str("프로젝트 이름 또는 ID") }),
  },
  {
    name: "create_todo", service: "todo", access: "write",
    description: `할일을 만듭니다. 마감일은 날짜(YYYY-MM-DD). ${AMBIGUOUS}`,
    inputSchema: obj({
      title: str("제목", { minLength: 1, maxLength: 200 }), due: day("마감일"),
      priority: str("우선순위", { enum: ["low", "medium", "high"] }), project: str("프로젝트 이름 또는 ID"), notes: str("메모", { maxLength: 2000 }),
    }, ["title"]),
  },
  {
    name: "update_todo", service: "todo", access: "write",
    description: "할일의 일부 필드를 수정합니다. 바꿀 필드만 넘기세요. 완료 처리는 complete_todo를 쓰세요.",
    inputSchema: obj({
      id: id("할일 ID"), title: str("제목", { minLength: 1, maxLength: 200 }), due: day("마감일"),
      priority: str("우선순위", { enum: ["low", "medium", "high"] }), project: str("프로젝트 이름 또는 ID"), notes: str("메모", { maxLength: 2000 }),
    }, ["id"]),
  },
  {
    name: "complete_todo", service: "todo", access: "write",
    description: "할일을 완료 처리합니다. 반복 할일이면 다음 주기가 자동으로 만들어집니다.",
    inputSchema: obj({ id: id("할일 ID") }, ["id"]),
  },
  {
    name: "delete_todo", service: "todo", access: "write",
    description: `할일을 삭제합니다(휴지통으로 이동). ${CONFIRM_DELETE}`,
    inputSchema: obj({ id: id("할일 ID") }, ["id"]),
  },
  {
    name: "list_transactions", service: "ledger", access: "read",
    description: `기간 내 거래 내역과 수입·지출 합계를 조회합니다. ${AMBIGUOUS}`,
    inputSchema: obj({
      start: day("시작일"), end: day("종료일"), category: str("카테고리 이름 또는 ID"), account: str("계좌 이름 또는 ID"),
      type: str("종류", { enum: ["income", "expense", "transfer"] }),
    }, ["start", "end"]),
  },
  {
    name: "add_transaction", service: "ledger", access: "write",
    description: `거래를 기록합니다. amount는 양의 정수 원 단위이고 부호는 type으로 정합니다(income/expense/transfer). 이체는 to_account가 필요합니다. 계좌를 생략하면 기본 계좌를 씁니다. 예: "점심 12,000원 식비 신한카드" → type=expense, amount=12000, category=식비, account=신한카드. ${AMBIGUOUS}`,
    inputSchema: obj({
      date: day("거래일"), amount: { type: "integer", description: "금액(원, 1 이상 정수)", minimum: 1, maximum: 100_000_000_000 },
      type: str("종류", { enum: ["income", "expense", "transfer"] }), category: str("카테고리 이름 또는 ID"),
      account: str("계좌 이름 또는 ID"), to_account: str("이체 받는 계좌(이체일 때 필수)"), memo: str("메모", { maxLength: 500 }),
    }, ["date", "amount", "type"]),
  },
  {
    name: "update_transaction", service: "ledger", access: "write",
    description: "거래의 일부 필드를 수정합니다. 바꿀 필드만 넘기세요.",
    inputSchema: obj({
      id: id("거래 ID"), date: day("거래일"), amount: { type: "integer", minimum: 1, maximum: 100_000_000_000 },
      type: str("종류", { enum: ["income", "expense", "transfer"] }), category: str("카테고리 이름 또는 ID"),
      account: str("계좌 이름 또는 ID"), to_account: str("이체 받는 계좌"), memo: str("메모", { maxLength: 500 }),
    }, ["id"]),
  },
  {
    name: "delete_transaction", service: "ledger", access: "write",
    description: `거래를 즉시 삭제합니다(복구 불가). ${CONFIRM_DELETE}`,
    inputSchema: obj({ id: id("거래 ID") }, ["id"]),
  },
  {
    name: "get_summary", service: "ledger", access: "read",
    description: "월별 수입·지출, 카테고리별 합계, 예산 대비 사용 현황을 돌려줍니다. 예: 이번 달 식비 얼마 썼어?",
    inputSchema: obj({ month: str("YYYY-MM", { minLength: 7, maxLength: 7 }), group_by: str("묶는 기준", { enum: ["category", "account"] }) }, ["month"]),
  },
  {
    name: "list_accounts", service: "ledger", access: "read",
    description: "계좌 목록과 현재 잔액(초기 잔액 + 거래 합계)을 돌려줍니다.",
    inputSchema: obj({}),
  },
  {
    name: "get_weather", service: "common", access: "read",
    description: "날씨를 조회합니다. location을 생략하면 설정한 기본 위치를 씁니다.",
    inputSchema: obj({ location: str("지역명", { maxLength: 100 }), date: day("날짜(기본 오늘)") }),
  },
  {
    name: "get_today_overview", service: "common", access: "read",
    description: "하루의 일정·할일·날씨·지출 요약을 한 번에 돌려줍니다. 하루 브리핑 요청에 사용하세요. 권한이 없는 서비스는 요약에서 빠집니다.",
    inputSchema: obj({ date: day("날짜(기본 오늘)") }),
  },
];

const RANK = { none: 0, read: 1, write: 2 } as const;

// 도구 호출 가능 여부. common 도구는 하나라도 읽기 이상 범위가 있으면 허용(없는 서비스는 요약에서 제외).
export function toolAllowed(tool: ToolDef, scopes: Scopes): boolean {
  if (tool.service === "common") return Object.values(scopes).some((s) => RANK[s] >= 1);
  return RANK[scopes[tool.service]] >= (tool.access === "write" ? 2 : 1);
}

export const visibleTools = (scopes: Scopes): ToolDef[] => TOOLS.filter((t) => toolAllowed(t, scopes));
