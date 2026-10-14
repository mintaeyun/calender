import type { TxType } from "./money";

export type Summary = { income: number; expense: number; net: number; count: number };

/** 수입/지출/순액/건수. 이체는 수입·지출 합계에서 제외(건수에는 포함). */
export function summarize(rows: { type: TxType; amount: number }[]): Summary {
  let income = 0, expense = 0;
  for (const t of rows) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }
  return { income, expense, net: income - expense, count: rows.length };
}
