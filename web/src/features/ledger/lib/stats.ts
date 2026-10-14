// 통계 계산. 서버 집계 결과를 입력으로 받는 순수 함수. 이체는 호출 전에 제외한다(자산 이동일 뿐).

export type CategoryAmount = { name: string; amount: number };
export type CategoryShare = CategoryAmount & { ratio: number };

/** 카테고리별 비율(0~1). 금액 내림차순, 합계가 0이면 모두 0. 비율 합은 반올림 오차 외에 1이다. */
export function categoryShares(items: CategoryAmount[]): CategoryShare[] {
  const total = items.reduce((s, i) => s + i.amount, 0);
  return [...items]
    .sort((a, b) => b.amount - a.amount)
    .map((i) => ({ ...i, ratio: total === 0 ? 0 : i.amount / total }));
}

export type Diff = { diff: number; pct: number | null };

/** 전월 대비. 전월이 0원이면 증감률(pct)은 null — 0으로 나누지 않는다. */
export function monthOverMonth(current: number, previous: number): Diff {
  return { diff: current - previous, pct: previous === 0 ? null : ((current - previous) / previous) * 100 };
}

/** 카테고리별 전월 대비. 어느 한쪽에만 있는 카테고리도 포함한다. */
export function categoryDiffs(current: CategoryAmount[], previous: CategoryAmount[]): (Diff & { name: string; current: number; previous: number })[] {
  const cur = new Map(current.map((c) => [c.name, c.amount]));
  const prev = new Map(previous.map((c) => [c.name, c.amount]));
  const names = new Set([...cur.keys(), ...prev.keys()]);
  return [...names]
    .map((name) => ({ name, current: cur.get(name) ?? 0, previous: prev.get(name) ?? 0, ...monthOverMonth(cur.get(name) ?? 0, prev.get(name) ?? 0) }))
    .sort((a, b) => b.current - a.current);
}

/** 'YYYY-MM' 기준 최근 n개월(오래된 순). 데이터가 없는 달은 0으로 채운다. */
export function monthlyTrend(rows: { month: string; amount: number }[], endMonth: string, n = 6): { month: string; amount: number }[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.amount]));
  let [y, m] = endMonth.split("-").map(Number);
  const out: { month: string; amount: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift({ month: `${y}-${String(m).padStart(2, "0")}`, amount: byMonth.get(`${y}-${String(m).padStart(2, "0")}`) ?? 0 });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export type BudgetState = "ok" | "warn" | "over";

/** 소진율 상태: 80% 이상 warn(라임), 100% 이상 over(경고색). 예산 0 이하이면 ok. */
export function budgetState(spent: number, budget: number): BudgetState {
  if (budget <= 0) return "ok";
  const r = spent / budget;
  return r >= 1 ? "over" : r >= 0.8 ? "warn" : "ok";
}

/** 남은 일수 기준 하루 사용 가능액(원, 내림). 초과 상태이거나 남은 일수가 0이면 0. */
export function dailyAllowance(spent: number, budget: number, daysLeft: number): number {
  if (daysLeft <= 0 || spent >= budget) return 0;
  return Math.floor((budget - spent) / daysLeft);
}
