// 고정지출 결제일 계산. SQL 함수 next_pay_date()/pay_date_in()과 같은 규칙(말일 보정)을 쓴다.
// 날짜는 'YYYY-MM-DD' 문자열(시간대 변환 없음).

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 해당 연·월의 결제일. 그 달에 없는 일자(31일 등)는 말일로 보정한다. */
export function payDateIn(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDay(year, month)))}`;
}

export type Cycle = "monthly" | "yearly";

/** after 이후(초과)의 다음 결제일. */
export function nextPayDate(cycle: Cycle, payDay: number, payMonth: number | null, after: string): string {
  const y = Number(after.slice(0, 4));
  const m = Number(after.slice(5, 7));
  if (cycle === "yearly") {
    const d = payDateIn(y, payMonth!, payDay);
    return d > after ? d : payDateIn(y + 1, payMonth!, payDay);
  }
  const d = payDateIn(y, m, payDay);
  if (d > after) return d;
  return m === 12 ? payDateIn(y + 1, 1, payDay) : payDateIn(y, m + 1, payDay);
}

/** 새 고정지출의 첫 next_run_date: 오늘(포함) 이후 가장 가까운 결제일. */
export function firstRunDate(cycle: Cycle, payDay: number, payMonth: number | null, today: string): string {
  const prev = new Date(`${today}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return nextPayDate(cycle, payDay, payMonth, prev.toISOString().slice(0, 10));
}

/** 월 환산 고정지출 합계(연 단위는 12로 나눈 값이 아니라 제외 — 목업: "연간 항목 별도"). */
export function monthlyTotal(items: { cycle: Cycle; amount: number; active: boolean }[]): number {
  return items.filter((i) => i.active && i.cycle === "monthly").reduce((s, i) => s + i.amount, 0);
}

export const cycleLabel = (cycle: Cycle, payDay: number, payMonth: number | null) =>
  cycle === "yearly" ? `매년 ${payMonth}월 ${payDay}일` : `매월 ${payDay}일`;
