// 내역 필터 ↔ URL 쿼리 변환, 날짜별 그룹. 순수 로직.
import type { Transaction, TxFilter } from "../api";
import { summarize } from "./summary";
import { parseAmount, type TxType } from "./money";

export type UiFilter = { type: "all" | TxType; from: string; to: string; categoryId: string; accountId: string; min: string; max: string };

export const defaultFilter = (today: string): UiFilter => ({ type: "all", from: `${today.slice(0, 7)}-01`, to: today, categoryId: "", accountId: "", min: "", max: "" });

export function fromParams(p: URLSearchParams, today: string): UiFilter {
  const d = defaultFilter(today);
  const t = p.get("type");
  return {
    type: t === "expense" || t === "income" || t === "transfer" ? t : "all",
    from: p.get("from") ?? d.from, to: p.get("to") ?? d.to,
    categoryId: p.get("cat") ?? "", accountId: p.get("acct") ?? "", min: p.get("min") ?? "", max: p.get("max") ?? "",
  };
}

/** 기본값과 다른 항목만 쿼리로 남긴다. */
export function toParams(f: UiFilter, today: string): URLSearchParams {
  const d = defaultFilter(today);
  const p = new URLSearchParams();
  if (f.type !== "all") p.set("type", f.type);
  if (f.from !== d.from) p.set("from", f.from);
  if (f.to !== d.to) p.set("to", f.to);
  if (f.categoryId) p.set("cat", f.categoryId);
  if (f.accountId) p.set("acct", f.accountId);
  if (f.min) p.set("min", f.min);
  if (f.max) p.set("max", f.max);
  return p;
}

const amountOrUndef = (s: string) => { const r = parseAmount(s); return r.ok ? r.value : undefined; };

export function toApiFilter(f: UiFilter): TxFilter {
  return {
    from: f.from || undefined, to: f.to || undefined, type: f.type === "all" ? undefined : f.type,
    categoryId: f.categoryId || undefined, accountId: f.accountId || undefined,
    minAmount: amountOrUndef(f.min), maxAmount: amountOrUndef(f.max),
  };
}

export type DayGroup = { date: string; rows: Transaction[]; expense: number; income: number };

/** 날짜별 그룹(입력이 날짜 내림차순이라고 가정하지 않고 정렬한다). 그룹 합계는 이체 제외. */
export function groupByDate(rows: Transaction[]): DayGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const t of rows) map.set(t.date, [...(map.get(t.date) ?? []), t]);
  return [...map].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, rs]) => {
    const s = summarize(rs);
    return { date, rows: rs, expense: s.expense, income: s.income };
  });
}
