// 이번 주 요약 (DASH-6 + 주간 요약 줄). 규칙 기반 문구만 만든다(LLM 호출 없음). 순수 로직.
import { addDays } from "@/lib/time";

export type WeekTodo = { due_date: string | null; status: "todo" | "doing" | "done"; title: string };

export type WeekTodoStats = {
  total: number;
  done: number;
  /** 0~1. 이번 주 마감 할일이 없으면 null */
  rate: number | null;
  overdue: number;
  next: { title: string; due: string } | null;
};

/** 이번 주(첫날~+6일) 마감 할일 달성률, 기한초과(주와 무관한 미완료), 다음 마감(오늘 이후 가장 가까운 미완료) */
export function weekTodoStats(todos: WeekTodo[], firstDay: string, today: string): WeekTodoStats {
  const last = addDays(firstDay, 6);
  const inWeek = todos.filter((t) => t.due_date && t.due_date >= firstDay && t.due_date <= last);
  const done = inWeek.filter((t) => t.status === "done").length;
  const open = todos.filter((t) => t.status !== "done" && t.due_date);
  const overdue = open.filter((t) => t.due_date! < today).length;
  const upcoming = open.filter((t) => t.due_date! >= today).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  return {
    total: inWeek.length, done, rate: inWeek.length ? done / inWeek.length : null, overdue,
    next: upcoming ? { title: upcoming.title, due: upcoming.due_date! } : null,
  };
}

export type CategoryAmount = { name: string; amount: number };

/** 지출 TOP N 카테고리 (0원 제외, 금액 내림차순) */
export function topCategories(items: CategoryAmount[], n = 3): (CategoryAmount & { ratio: number })[] {
  const total = items.reduce((s, c) => s + Math.max(0, c.amount), 0);
  return items
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((c) => ({ ...c, ratio: total ? c.amount / total : 0 }));
}

/** 주간 한 줄 요약: 가장 바쁜 요일, 기한초과, 달성률을 규칙으로 조합한다. 말할 내용이 없으면 null. */
export function weekSentence(input: { busiest: { weekdayLabel: string; hours: number } | null; stats: WeekTodoStats }): string | null {
  const parts: string[] = [];
  if (input.busiest) parts.push(`${input.busiest.weekdayLabel}요일에 일정이 가장 몰려 있어요(${input.busiest.hours}시간).`);
  if (input.stats.overdue > 0) parts.push(`기한이 지난 할일이 ${input.stats.overdue}건 있어요.`);
  if (input.stats.rate != null) parts.push(`이번 주 할일 ${input.stats.done}/${input.stats.total} 완료(${Math.round(input.stats.rate * 100)}%).`);
  return parts.length ? parts.join(" ") : null;
}
