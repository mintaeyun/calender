// 내보내기용 행 변환(일정·할일·거래). 화면에 보이는 한국어 값으로 바꾼다. 순수 함수.

export type Table = { header: string[]; rows: (string | number | boolean)[][] };

/** UTC ISO → 사용자 시간대의 'YYYY-MM-DD HH:mm' */
export function localDateTime(iso: string, tz: string): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
const localDate = (iso: string, tz: string) => localDateTime(iso, tz).slice(0, 10);

// ── 일정 ────────────────────────────────────────────────
export type EventIn = { title: string; start_at: string; end_at: string; all_day: boolean; location: string | null; notes: string | null; rrule: string | null; calendar_id: string | null };

/** 종일 일정의 end_at 은 마지막 날 다음 00:00(exclusive)이므로, 내보낼 때는 마지막 날(포함)을 쓴다. */
export function eventsTable(events: EventIn[], calendarName: (id: string | null) => string, tz: string): Table {
  return {
    header: ["제목", "시작", "종료", "종일", "장소", "메모", "반복(RRULE)", "캘린더"],
    rows: events.map((e) => {
      const start = e.all_day ? localDate(e.start_at, tz) : localDateTime(e.start_at, tz);
      const end = e.all_day ? localDate(new Date(new Date(e.end_at).getTime() - 1000).toISOString(), tz) : localDateTime(e.end_at, tz);
      return [e.title, start, end, e.all_day ? "예" : "아니오", e.location ?? "", e.notes ?? "", e.rrule ?? "", calendarName(e.calendar_id)];
    }),
  };
}

// ── 할일 ────────────────────────────────────────────────
export type TodoIn = {
  title: string; due_date: string | null; priority: string; status: string; project_id: string | null; notes: string | null;
  completed_at: string | null; recurrence_rule: string | null; todo_tags: { tag_id: string }[];
};
const PRI = { high: "상", medium: "중", low: "하" } as Record<string, string>;
const STATUS = { todo: "대기", doing: "진행 중", done: "완료" } as Record<string, string>;

export function todosTable(todos: TodoIn[], projectName: (id: string | null) => string, tagName: (id: string) => string, tz: string): Table {
  return {
    header: ["제목", "마감일", "우선순위", "상태", "프로젝트", "태그", "메모", "완료 시각", "반복(RRULE)"],
    rows: todos.map((t) => [
      t.title, t.due_date ?? "", PRI[t.priority] ?? t.priority, STATUS[t.status] ?? t.status, projectName(t.project_id),
      t.todo_tags.map((x) => tagName(x.tag_id)).join(" "), t.notes ?? "", t.completed_at ? localDateTime(t.completed_at, tz) : "", t.recurrence_rule ?? "",
    ]),
  };
}

// ── 거래 ────────────────────────────────────────────────
export type TxIn = { date: string; type: "income" | "expense" | "transfer"; amount: number; category_id: string | null; account_id: string; to_account_id: string | null; memo: string | null };
export const TX_TYPE_LABEL = { expense: "지출", income: "수입", transfer: "이체" } as const;

/** 가져오기와 같은 열 이름을 쓴다(내보낸 파일을 그대로 다시 가져올 수 있게). 금액은 항상 양의 정수, 부호는 구분이 결정. */
export const TX_HEADER = ["날짜", "구분", "금액", "카테고리", "계좌", "받는 계좌", "메모"];

export function transactionsTable(txs: TxIn[], categoryName: (id: string | null) => string, accountName: (id: string | null) => string): Table {
  return {
    header: TX_HEADER,
    rows: txs.map((t) => [t.date, TX_TYPE_LABEL[t.type], t.amount, t.type === "transfer" ? "" : categoryName(t.category_id), accountName(t.account_id), t.type === "transfer" ? accountName(t.to_account_id) : "", t.memo ?? ""]),
  };
}

export const todayStamp = (tz: string, now = new Date()) => localDate(now.toISOString(), tz).replaceAll("-", "");
