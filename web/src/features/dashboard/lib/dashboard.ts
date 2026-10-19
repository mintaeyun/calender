// 대시보드 순수 로직 (DASH-1~3). React·DB 비의존. 시각은 UTC Date, 날짜는 사용자 시간대 'YYYY-MM-DD'.
import { matchesFilter, type DueFields } from "@/features/todo/lib/due";

export function greeting(hour: number): string {
  if (hour < 5) return "늦은 시간이에요";
  if (hour < 12) return "좋은 아침이에요";
  if (hour < 18) return "좋은 오후예요";
  return "좋은 저녁이에요";
}

/** 남은 시간 문구: '곧' / '35분 후' / '1시간 20분 후' / '2시간 후' */
export function remainingLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return "곧";
  if (min < 60) return `${min}분 후`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}시간 ${m}분 후` : `${h}시간 후`;
}

export type DayEvent = { key: string; title: string; start: Date; end: Date; allDay: boolean; location: string | null };

export type TodayEvents = {
  allDay: DayEvent[];
  past: DayEvent[];
  /** 아직 시작하지 않은 첫 시간 일정 (진행 중인 일정이 있으면 그것) */
  next: DayEvent | null;
  later: DayEvent[];
};

/** 오늘의 일정 분류. 지난 일정은 흐리게, 다음 일정은 강조(DASH-1). 입력은 시작 순으로 정렬되어 있지 않아도 된다. */
export function classifyToday(events: DayEvent[], now: Date): TodayEvents {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const allDay = sorted.filter((e) => e.allDay);
  const timed = sorted.filter((e) => !e.allDay);
  const t = now.getTime();
  const past = timed.filter((e) => e.end.getTime() <= t && e.start.getTime() < t);
  const rest = timed.filter((e) => !past.includes(e));
  return { allDay, past, next: rest[0] ?? null, later: rest.slice(1) };
}

export type DashTodo = DueFields & { id: string; title: string; priority: "high" | "medium" | "low" };

const PRI = { high: 0, medium: 1, low: 2 } as const;

/**
 * 오늘의 할일 (DASH-2): 오늘 마감 + 기한초과(미완료). 오늘 마감인 완료 항목도 남겨 'N / M' 을 센다.
 * 정렬: 기한초과 → 미완료 → 완료, 같은 그룹은 우선순위.
 */
export function todayTodos<T extends DashTodo>(todos: T[], today: string): { items: T[]; done: number; total: number } {
  const items = todos
    .filter((t) => matchesFilter(t, "today", today) || (t.status === "done" && t.due_date === today))
    .sort((a, b) => rank(a, today) - rank(b, today) || PRI[a.priority] - PRI[b.priority]);
  return { items, done: items.filter((t) => t.status === "done").length, total: items.length };
}

const rank = (t: DueFields, today: string) => (t.status === "done" ? 2 : t.due_date && t.due_date < today ? 0 : 1);

export type SpendPoint = { date: string; amount: number };

/**
 * 이번 달 지출과 비교 기준(전월 같은 기간) (DASH-3). 이번 달 일자까지(day)만 전월과 비교해 공정하게 본다.
 * 전월 지출 행은 'YYYY-MM-DD' 날짜로 거른다.
 */
export function previousMonthSamePeriod(prevExpenseRows: SpendPoint[], prevMonth: string, day: number): number {
  const last = `${prevMonth}-${String(day).padStart(2, "0")}`;
  return prevExpenseRows.filter((r) => r.date <= last).reduce((s, r) => s + r.amount, 0);
}

/** 이전 달 'YYYY-MM' */
export function prevMonthOf(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type BudgetBar = { name: string; amount: number; ratio: number };

/** 지출 구성 바: 금액 큰 순으로 상위 N개 + 나머지 묶음 + 남은 예산. 예산이 없으면 remaining=null. */
export function spendingBar(byCategory: { name: string; amount: number }[], total: number, budget: number | null, top = 3) {
  const sorted = [...byCategory].filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, top);
  const restAmount = sorted.slice(top).reduce((s, c) => s + c.amount, 0);
  const parts: BudgetBar[] = head.map((c) => ({ name: c.name, amount: c.amount, ratio: total ? c.amount / total : 0 }));
  if (restAmount > 0) parts.push({ name: "기타", amount: restAmount, ratio: total ? restAmount / total : 0 });
  const remaining = budget == null ? null : budget - total;
  return { parts, remaining, usedRatio: budget ? total / budget : null };
}
