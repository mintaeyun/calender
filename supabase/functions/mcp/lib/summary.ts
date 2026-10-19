// get_summary / list_transactions 합계 계산 (순수 로직). 금액은 정수 원, 부호는 type 으로 결정.

export type Tx = {
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category_id: string | null;
  account_id: string;
};
export type Budget = { category_id: string | null; amount: number };

export function totals(txs: Tx[]) {
  let income = 0, expense = 0, transfer = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
    else transfer += t.amount;
  }
  return { income, expense, transfer, net: income - expense };
}

/** 지출을 키(카테고리/계좌 id)별로 합산. 내림차순. */
export function groupExpense(txs: Tx[], by: "category" | "account"): { id: string | null; amount: number }[] {
  const m = new Map<string | null, number>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const k = by === "category" ? t.category_id : t.account_id;
    m.set(k, (m.get(k) ?? 0) + t.amount);
  }
  return [...m].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
}

/** 예산 대비 사용 현황. category_id=null 은 총예산(전체 지출). */
export function budgetUsage(txs: Tx[], budgets: Budget[]) {
  const spent = new Map<string | null, number>();
  let all = 0;
  for (const t of txs) {
    if (t.type !== "expense") continue;
    all += t.amount;
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount);
  }
  return budgets.map((b) => {
    const used = b.category_id === null ? all : (spent.get(b.category_id) ?? 0);
    return {
      category_id: b.category_id, budget: b.amount, spent: used, remaining: b.amount - used,
      percent: Math.round((used / b.amount) * 100),
    };
  });
}

/** 'YYYY-MM' → 해당 월의 시작일·마지막일('YYYY-MM-DD'). 잘못된 값이면 null. */
export function monthRange(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}
