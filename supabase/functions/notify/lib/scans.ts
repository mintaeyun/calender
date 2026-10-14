// 할일 마감·예산·결제 예정·우천·동기화 오류 알림 계획. 모두 DB 없이 입력 데이터만으로 계산하는 순수 함수다.
// 시각(09:00, 20:00)은 사용자 시간대로 판정한다. 중복 방지는 dedupe_key(멱등 키) + (user_id, dedupe_key) 유니크.
import { zonedParts, zonedToUtc } from "../../_shared/time.ts";
import { inWindow, type Planned, type Window } from "./types.ts";

const DAY = 24 * 60 * 60_000;

/** 'YYYY-MM-DD'의 다음/이전 날 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 사용자 시간대의 'YYYY-MM-DD' 날짜 + 시각 → UTC 시각 */
export function atLocal(date: string, hour: number, minute: number, tz: string): Date {
  return zonedToUtc(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10), hour, minute, tz);
}

export const localDate = (t: Date, tz: string) => {
  const p = zonedParts(t, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

// ── 할일 마감 ───────────────────────────────────────────

export type TodoLike = { id: string; title: string; due_date: string | null; status: string; deleted_at: string | null };

/**
 * 마감 당일 설정 시각(기본 09:00)에 "오늘 마감", 다음 날 같은 시각에 "기한이 지났어요"를 1회씩.
 * 완료·삭제된 할일은 제외. 알림 시점에 이미 완료된 할일은 호출 측이 status 로 걸러진다.
 */
export function planTodoNotifications(todos: TodoLike[], window: Window, tz: string, dueHour = 9): Planned[] {
  const out: Planned[] = [];
  for (const t of todos) {
    if (!t.due_date || t.deleted_at || t.status === "done") continue;
    const dueAt = atLocal(t.due_date, dueHour, 0, tz);
    if (inWindow(dueAt, window)) {
      out.push({ type: "todo_due", title: t.title, body: "오늘이 마감이에요", link: "/todos", dedupe_key: `todo_due:${t.id}:${t.due_date}:today`, scheduled_at: dueAt });
    }
    const overAt = atLocal(shiftDate(t.due_date, 1), dueHour, 0, tz);
    if (inWindow(overAt, window)) {
      out.push({ type: "todo_due", title: t.title, body: "마감일이 지났어요", link: "/todos", dedupe_key: `todo_due:${t.id}:${t.due_date}:over`, scheduled_at: overAt });
    }
  }
  return out;
}

// ── 예산 ────────────────────────────────────────────────

export type BudgetLike = {
  id: string; month: string; category_id: string | null; amount: number;
  spent: number; alerted_80_at: string | null; alerted_100_at: string | null;
};
export type BudgetPlan = { planned: Planned; budgetId: string; flags: ("alerted_80_at" | "alerted_100_at")[] };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 80% 도달(budget_warning)·100% 초과(budget_exceeded)를 예산 행당 각각 1회. 알림 후 호출 측이 flags 컬럼을 now() 로 갱신한다.
 * 한 번에 100%를 넘긴 경우 경고 없이 초과 알림만 보내고 두 플래그를 모두 기록한다.
 */
export function planBudgetNotifications(budgets: BudgetLike[], names: Map<string | null, string>, now: Date): BudgetPlan[] {
  const out: BudgetPlan[] = [];
  for (const b of budgets) {
    if (b.amount <= 0) continue;
    const ratio = b.spent / b.amount;
    const label = names.get(b.category_id) ?? (b.category_id === null ? "총예산" : "예산");
    const month = b.month.slice(0, 7);
    if (ratio >= 1 && !b.alerted_100_at) {
      out.push({
        budgetId: b.id, flags: ["alerted_80_at", "alerted_100_at"].filter((f) => f === "alerted_100_at" || !b.alerted_80_at) as BudgetPlan["flags"],
        planned: { type: "budget_exceeded", title: `${label} 예산을 초과했어요`, body: `${won(b.spent)} 사용 · 예산 ${won(b.amount)} (${won(b.spent - b.amount)} 초과)`, link: "/ledger/budget", dedupe_key: `budget_exceeded:${b.id}:${month}`, scheduled_at: now },
      });
    } else if (ratio >= 0.8 && ratio < 1 && !b.alerted_80_at) {
      out.push({
        budgetId: b.id, flags: ["alerted_80_at"],
        planned: { type: "budget_warning", title: `${label} 예산 80%에 도달했어요`, body: `${won(b.spent)} 사용 · 예산 ${won(b.amount)} (${won(b.amount - b.spent)} 남음)`, link: "/ledger/budget", dedupe_key: `budget_warning:${b.id}:${month}`, scheduled_at: now },
      });
    }
  }
  return out;
}

// ── 결제 예정 ───────────────────────────────────────────

export type RecurringLike = { id: string; name: string; amount: number; next_run_date: string; active: boolean };

/** 결제일 전날 20:00(사용자 시간대)에 "내일 결제" 알림. */
export function planPaymentNotifications(items: RecurringLike[], window: Window, tz: string, hour = 20): Planned[] {
  const out: Planned[] = [];
  for (const r of items) {
    if (!r.active) continue;
    const fireAt = atLocal(shiftDate(r.next_run_date, -1), hour, 0, tz);
    if (!inWindow(fireAt, window)) continue;
    out.push({ type: "payment_due", title: `내일 ${r.name} ${won(r.amount)} 결제`, body: "결제일에 거래가 자동 등록돼요", link: "/ledger/recurring", dedupe_key: `payment_due:${r.id}:${r.next_run_date}`, scheduled_at: fireAt });
  }
  return out;
}

// ── 우천 (WX-5) ─────────────────────────────────────────

export type DailyForecastLike = { date: string; precipProbMax: number; condition: { label: string } };
export const RAIN_THRESHOLD = 60;

/**
 * 장소(location)가 있는 일정이 있는 날에 강수확률 ≥ 60% 이면 전날 20:00 과 당일 07:00 에 알림.
 * v1 은 일정 장소를 지오코딩하지 않고 사용자 기본 지역의 예보를 쓴다.
 * eventDates: 장소 있는 일정이 있는 날짜('YYYY-MM-DD', 사용자 시간대) 집합.
 */
export function planRainNotifications(eventDates: Set<string>, daily: DailyForecastLike[], window: Window, tz: string): Planned[] {
  const out: Planned[] = [];
  for (const d of daily) {
    if (!eventDates.has(d.date) || d.precipProbMax < RAIN_THRESHOLD) continue;
    const label = `${d.condition.label} ${d.precipProbMax}%`;
    const slots: [string, Date][] = [["evening", atLocal(shiftDate(d.date, -1), 20, 0, tz)], ["morning", atLocal(d.date, 7, 0, tz)]];
    for (const [slot, fireAt] of slots) {
      if (!inWindow(fireAt, window)) continue;
      out.push({
        type: "rain_forecast",
        title: slot === "evening" ? "내일 비 예보가 있어요" : "오늘 비 예보가 있어요",
        body: `${label} · 장소가 있는 일정이 있어요. 우산을 챙기세요`,
        link: "/calendar", dedupe_key: `rain_forecast:${d.date}:${slot}`, scheduled_at: fireAt,
      });
    }
  }
  return out;
}

// ── 동기화 오류 ─────────────────────────────────────────

/** google_connections.last_error 가 있으면 재연결 안내. 오류가 계속돼도 하루 1회만(날짜별 멱등 키). */
export function planSyncErrorNotification(conn: { last_error: string | null } | null, now: Date, tz: string): Planned | null {
  if (!conn?.last_error) return null;
  return {
    type: "sync_error", title: "구글 캘린더 동기화에 실패했어요",
    body: "연결이 만료됐을 수 있어요. 설정에서 다시 연결해 주세요", link: "/settings/google",
    dedupe_key: `sync_error:${localDate(now, tz)}`, scheduled_at: now,
  };
}

export const MS_DAY = DAY;
