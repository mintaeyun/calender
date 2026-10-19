"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis } from "recharts";
import { useTimezone } from "@/lib/profile";
import { todayKey } from "@/lib/time";
import { monthRange } from "../api";
import { useCategories, useTransactions } from "../hooks";
import { addMonths, monthLabel, monthOf } from "../lib/month";
import { formatWon } from "../lib/money";
import { categoryDiffs, categoryShares, monthlyTrend, monthOverMonth, type CategoryAmount } from "../lib/stats";
import { MonthNav } from "./MonthNav";

const FALLBACK = "var(--fg-faint, #55555c)";

/** 통계(LED-5): 카테고리 도넛, 최근 6개월 추이(만원), 전월 대비(같은 기간 1–N일). 이체는 제외. */
export function LedgerStats() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const [month, setMonth] = useState(monthOf(today));
  const cats = useCategories("expense", true).data ?? [];

  const trendFrom = monthRange(addMonths(month, -5)).from;
  const { to } = monthRange(month);
  // 6개월치 지출을 한 번에 가져와 월·카테고리로 나눈다(개인용 규모).
  const q = useTransactions({ from: trendFrom, to, type: "expense" });
  const rows = q.data ?? [];

  const prevMonth = addMonths(month, -1);
  // 같은 기간 비교: 선택한 달이 이번 달이면 오늘 일자까지, 지난 달이면 말일까지
  const cutoff = month === monthOf(today) ? Number(today.slice(8, 10)) : 31;
  const inMonth = (d: string, m: string, maxDay = 31) => monthOf(d) === m && Number(d.slice(8)) <= maxDay;

  const { current, previous, monthTotals, curTotal } = useMemo(() => {
    const sumBy = (m: string, maxDay = 31): CategoryAmount[] => {
      const map = new Map<string, number>();
      for (const t of rows) if (inMonth(t.date, m, maxDay)) map.set(t.category_id ?? "none", (map.get(t.category_id ?? "none") ?? 0) + t.amount);
      return [...map].map(([id, amount]) => ({ name: id, amount }));
    };
    const totals = new Map<string, number>();
    for (const t of rows) totals.set(monthOf(t.date), (totals.get(monthOf(t.date)) ?? 0) + t.amount);
    const cur = sumBy(month);
    return { current: cur, previous: sumBy(prevMonth, cutoff), monthTotals: [...totals].map(([m, amount]) => ({ month: m, amount })), curTotal: cur.reduce((s, c) => s + c.amount, 0) };
  }, [rows, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string) => (id === "none" ? "미분류" : cats.find((c) => c.id === id)?.name ?? "기타");
  const colorOf = (id: string) => cats.find((c) => c.id === id)?.color ?? FALLBACK;
  const shares = categoryShares(current);
  const trend = monthlyTrend(monthTotals, month, 6);
  const curSameCats: CategoryAmount[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of rows) if (inMonth(t.date, month, cutoff)) map.set(t.category_id ?? "none", (map.get(t.category_id ?? "none") ?? 0) + t.amount);
    return [...map].map(([name, amount]) => ({ name, amount }));
  }, [rows, month, cutoff]); // eslint-disable-line react-hooks/exhaustive-deps
  const diffs = categoryDiffs(curSameCats, previous).slice(0, 3);
  const total = monthOverMonth(curSameCats.reduce((s, c) => s + c.amount, 0), previous.reduce((s, c) => s + c.amount, 0));

  const pctText = (pct: number | null, diff: number) => (pct === null ? (diff === 0 ? "0%" : "신규") : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`);
  const pctColor = (diff: number) => (diff > 0 ? "text-danger" : diff < 0 ? "text-lime" : "");

  return (
    <div className="flex flex-col gap-3.5">
      <MonthNav month={month} onChange={setMonth} />
      {q.isError && <span className="text-sm text-danger">{(q.error as Error).message}</span>}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-5 rounded-[22px] bg-surface p-6">
          <span className="text-[17px] font-semibold">카테고리별 지출</span>
          <div className="flex flex-wrap items-center gap-7">
            <div className="relative h-[200px] w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shares} dataKey="amount" nameKey="name" innerRadius={65} outerRadius={100} stroke="none" isAnimationActive={false}>
                    {shares.map((s) => <Cell key={s.name} fill={colorOf(s.name)} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-fg-subtle">{Number(month.slice(5))}월 지출</span>
                <span className="text-xl font-bold">{(curTotal / 10000).toFixed(1)}만</span>
              </div>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-2.5">
              {/* 색 외에 이름·금액·비율을 항상 병기 */}
              {shares.map((s) => (
                <div key={s.name} className="grid grid-cols-[14px_1fr_auto_52px] items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(s.name) }} /><span>{nameOf(s.name)}</span>
                  <span className="font-semibold">{formatWon(s.amount)}</span><span className="text-right text-[13px] text-fg-subtle">{(s.ratio * 100).toFixed(1)}%</span>
                </div>
              ))}
              {shares.length === 0 && !q.isLoading && <span className="text-sm text-[color:var(--fg-dim,#6c6c73)]">{monthLabel(month)} 지출이 없어요</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-4 rounded-[22px] bg-surface p-6">
            <div className="flex justify-between"><span className="text-[17px] font-semibold">월별 지출 추이</span><span className="text-[13px] text-fg-subtle">단위 만원</span></div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.map((t) => ({ label: `${Number(t.month.slice(5))}월`, v: Math.round(t.amount / 10000), cur: t.month === month }))} margin={{ top: 18, bottom: 0 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--fg-subtle)", fontSize: 13 }} />
                  <Bar dataKey="v" radius={10} isAnimationActive={false} label={{ position: "top", fill: "var(--fg-muted)", fontSize: 12 }}>
                    {trend.map((t) => <Cell key={t.month} fill={t.month === month ? "var(--lime)" : "var(--chart-muted, #2e2a40)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-[22px] bg-surface p-6">
            <span className="text-[17px] font-semibold">전월 대비 (같은 기간 1–{cutoff}일)</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[{ label: "전체", d: total }, ...diffs.map((d) => ({ label: nameOf(d.name), d }))].map(({ label, d }) => (
                <div key={label} className="flex flex-col gap-1 rounded-[14px] bg-surface-3 p-3.5">
                  <span className="text-[13px] text-fg-subtle">{label}</span>
                  <span className={`text-xl font-bold ${pctColor(d.diff)}`}>{pctText(d.pct, d.diff)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
