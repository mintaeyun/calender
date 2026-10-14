// 마감일 분류·필터·정렬 순수 로직. 마감일은 date('YYYY-MM-DD')이며 시간대 변환을 하지 않는다.
// "오늘" 판정에만 사용자 시간대를 쓴다.

export type TodoStatus = "todo" | "doing" | "done";
export type Priority = "high" | "mid" | "low";
export type DueKind = "over" | "today" | "later" | "none" | "past";
export type TodoFilter = "today" | "upcoming" | "overdue" | "all" | "done";
export type TodoSort = "due" | "priority" | "created";

export type DueFields = { due_date: string | null; status: TodoStatus };
export type SortFields = DueFields & { priority: Priority; created_at: string };

export const DEFAULT_TZ = "Asia/Seoul";

/** 사용자 시간대 기준 오늘 날짜('YYYY-MM-DD'). */
export function todayIn(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 목업의 over/today/later/none/past 분류. 완료된 지난 마감은 past. */
export function dueKind(t: DueFields, today: string): DueKind {
  if (!t.due_date) return "none";
  if (t.due_date < today) return t.status === "done" ? "past" : "over";
  return t.due_date === today ? "today" : "later";
}

/** 필터 판정. 오늘 = 오늘 마감 + 기한초과(미완료). */
export function matchesFilter(t: DueFields, filter: TodoFilter, today: string): boolean {
  const k = dueKind(t, today);
  switch (filter) {
    case "today": return k === "today" || k === "over";
    case "upcoming": return k === "later" && t.status !== "done";
    case "overdue": return k === "over";
    case "all": return t.status !== "done";
    case "done": return t.status === "done";
  }
}

const PRI_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/** 정렬 비교 함수. 마감 없음은 뒤로. 같은 키면 마감 → 우선순위 → 생성일 순. */
export function compareTodos(sort: TodoSort) {
  const byDue = (a: SortFields, b: SortFields) =>
    a.due_date === b.due_date ? 0 : a.due_date === null ? 1 : b.due_date === null ? -1 : a.due_date < b.due_date ? -1 : 1;
  const byPri = (a: SortFields, b: SortFields) => PRI_RANK[a.priority] - PRI_RANK[b.priority];
  const byCreated = (a: SortFields, b: SortFields) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  const order = { due: [byDue, byPri, byCreated], priority: [byPri, byDue, byCreated], created: [byCreated, byDue, byPri] }[sort];
  return (a: SortFields, b: SortFields) => {
    for (const f of order) { const r = f(a, b); if (r) return r; }
    return 0;
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** '10/16' 형태 라벨. 오늘/어제/내일은 이름으로. */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "-";
  if (dueDate === today) return "오늘";
  if (dueDate === addDays(today, -1)) return "어제";
  if (dueDate === addDays(today, 1)) return "내일";
  return `${Number(dueDate.slice(5, 7))}/${Number(dueDate.slice(8, 10))}`;
}
