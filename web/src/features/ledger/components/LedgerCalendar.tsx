"use client";

import { useMemo, useState } from "react";
import { useTimezone } from "@/lib/profile";
import { todayKey, WEEKDAYS_KO } from "@/lib/time";
import { monthRange } from "../api";
import { useAccounts, useCategories, useTransactions } from "../hooks";
import { daysInMonth, firstWeekday, monthOf } from "../lib/month";
import { compactWon, formatSigned, formatWon } from "../lib/money";
import { MonthNav } from "./MonthNav";

/** 월별 달력(LED-4): 날짜별 수입(+)/지출(−) 합계, 날짜를 누르면 그날 거래 목록. */
export function LedgerCalendar() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const [month, setMonth] = useState(monthOf(today));
  const [sel, setSel] = useState<string | null>(null);
  const { from, to } = monthRange(month);
  const q = useTransactions({ from, to });
  const categories = useCategories(undefined, true).data ?? [];
  const accounts = useAccounts(true).data ?? [];

  const byDay = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const t of q.data ?? []) {
      if (t.type === "transfer") continue; // 이체는 합계에서 제외
      const d = m.get(t.date) ?? { income: 0, expense: 0 };
      if (t.type === "income") d.income += t.amount; else d.expense += t.amount;
      m.set(t.date, d);
    }
    return m;
  }, [q.data]);

  const lead = firstWeekday(month);
  const days = daysInMonth(month);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const selRows = (q.data ?? []).filter((t) => t.date === sel);

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3 rounded-[22px] bg-surface p-5">
        <MonthNav month={month} onChange={(m) => { setMonth(m); setSel(null); }} />
        {q.isError && <span className="text-sm text-danger">{(q.error as Error).message}</span>}
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-fg-subtle">{WEEKDAYS_KO.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const s = byDay.get(d);
            return (
              <button key={d} onClick={() => setSel(d)} aria-label={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일${s ? ` 수입 ${formatWon(s.income)}원 지출 ${formatWon(s.expense)}원` : ""}`} aria-pressed={sel === d} className={`flex min-h-[60px] min-w-0 flex-col items-end gap-0.5 overflow-hidden rounded-xl p-1 text-[10px] sm:min-h-[72px] sm:p-2 sm:text-xs ${sel === d ? "bg-[var(--surface-4,#2a2a2e)]" : "bg-surface-2"} ${d === today ? "outline outline-1 outline-lime" : ""}`}>
                <span className="text-fg-muted">{Number(d.slice(8))}</span>
                {s?.income ? <span className="text-lime"><span className="hidden sm:inline">+{formatWon(s.income)}</span><span className="sm:hidden">+{compactWon(s.income)}</span></span> : null}
                {s?.expense ? <span><span className="hidden sm:inline">−{formatWon(s.expense)}</span><span className="sm:hidden">−{compactWon(s.expense)}</span></span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-[22px] bg-surface p-5">
        <span className="text-sm font-semibold">{sel ? `${Number(sel.slice(5, 7))}월 ${Number(sel.slice(8))}일 거래` : "날짜를 선택하세요"}</span>
        {sel && selRows.length === 0 && <span className="text-sm text-[color:var(--fg-dim,#6c6c73)]">거래가 없어요</span>}
        {selRows.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-xs text-fg-subtle">{t.type === "transfer" ? "이체" : categories.find((c) => c.id === t.category_id)?.name ?? "미분류"} · {accounts.find((a) => a.account_id === t.account_id)?.name}</span><br />
              {t.memo ?? ""}
            </span>
            <span className={t.type === "income" ? "font-semibold text-lime" : "font-semibold"}>{formatSigned(t.amount, t.type)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
