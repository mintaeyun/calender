"use client";

import { useState } from "react";
import { useTimezone } from "@/lib/profile";
import { todayKey } from "@/lib/time";
import { useBudgets, useBudgetUsage, useCategories, useCopyBudgets, useDeleteBudget, useSetBudget } from "../hooks";
import { addMonths, daysLeftInMonth, monthLabel, monthOf } from "../lib/month";
import { formatWon, parseAmount } from "../lib/money";
import { budgetState, dailyAllowance } from "../lib/stats";
import { MonthNav } from "./MonthNav";

const BAR = { ok: "var(--purple)", warn: "var(--lime)", over: "var(--danger)" } as const;

/** 예산(LED-6): 총예산·카테고리 예산 편집, 소진율(80% 라임 / 100% 경고), 하루 사용 가능액, 지난달 불러오기. */
export function LedgerBudget() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const [month, setMonth] = useState(monthOf(today));
  const budgets = useBudgets(month);
  const usage = useBudgetUsage(month);
  const cats = useCategories("expense").data ?? [];
  const setBudget = useSetBudget(), delBudget = useDeleteBudget(), copy = useCopyBudgets();
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");

  const rows = budgets.data ?? [];
  const use = (cid: string | null) => usage.data?.find((u) => u.category_id === cid);
  const total = rows.find((b) => b.category_id === null);
  const catRows = rows.filter((b) => b.category_id !== null);
  const left = daysLeftInMonth(month, today);

  const save = (categoryId: string | null, text: string, done?: () => void) => {
    const a = parseAmount(text);
    if (!a.ok) { setErr(a.error); return; }
    setErr("");
    setBudget.mutate({ month, categoryId, amount: a.value }, { onSuccess: done, onError: (e) => setErr((e as Error).message) });
  };
  const editAmount = (categoryId: string | null, cur: number | null) => {
    const t = prompt("예산 금액(원)", cur ? String(cur) : "");
    if (t != null && t.trim()) save(categoryId, t);
  };

  const tu = total ? use(null) : undefined;
  const tState = total && tu ? budgetState(tu.spent, total.amount) : "ok";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} onChange={setMonth} />
        <button
          onClick={() => copy.mutate({ from: addMonths(month, -1), to: month }, { onSuccess: (n) => setMsg(n ? `지난달 예산 ${n}건을 불러왔어요` : "불러올 예산이 없어요"), onError: (e) => setErr((e as Error).message) })}
          className="rounded-full border border-[color:var(--border-strong,#3a3a40)] px-4 py-2 text-sm"
        >지난달 예산 불러오기</button>
      </div>
      {(err || msg) && <span className={`text-sm ${err ? "text-danger" : "text-lime"}`} role="status">{err || msg}</span>}

      <div className="flex flex-col gap-3.5 rounded-[22px] bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold">{monthLabel(month)} 총예산</span>
          {total && tu && <span className="text-sm text-fg-subtle">남은 {left}일 · 하루 {formatWon(dailyAllowance(tu.spent, total.amount, left))}원 사용 가능</span>}
        </div>
        {total && tu ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-[40px] font-bold tracking-tight">{formatWon(tu.spent)}</span>
              <span className="text-xl text-[color:var(--fg-dim,#6c6c73)]">/ {formatWon(total.amount)}원</span>
              <span className="ml-2 text-[15px] font-semibold" style={{ color: tState === "over" ? "var(--danger)" : "var(--lime)" }}>{(tu.ratio * 100).toFixed(1)}%</span>
            </div>
            <div className="relative h-3.5 overflow-hidden rounded-[7px] bg-[var(--surface-4,#2a2a2e)]">
              <div className="h-full" style={{ width: `${Math.min(100, tu.ratio * 100)}%`, background: BAR[tState] }} />
              <div className="absolute inset-y-0 left-[80%] w-0.5 bg-fg" />
            </div>
            <div className="flex justify-between text-xs text-fg-subtle"><span>0</span><span>80% 도달 시 알림 · 100% 초과 시 알림</span><span>{formatWon(total.amount)}</span></div>
            <div className="flex gap-3 text-sm text-fg-subtle">
              <button onClick={() => editAmount(null, total.amount)}>금액 수정</button>
              <button onClick={() => { if (confirm("총예산을 삭제할까요?")) delBudget.mutate(total.id); }} className="hover:text-danger">삭제</button>
            </div>
          </>
        ) : (
          <button onClick={() => editAmount(null, null)} className="w-fit rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">총예산 설정</button>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {catRows.map((b) => {
          const u = use(b.category_id);
          const cat = cats.find((c) => c.id === b.category_id);
          const spent = u?.spent ?? 0;
          const st = budgetState(spent, b.amount);
          const p = (spent / b.amount) * 100;
          return (
            <div key={b.id} className="flex flex-col gap-2.5 rounded-[20px] bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base font-semibold"><span className="h-[9px] w-[9px] rounded-sm" style={{ background: cat?.color ?? "var(--fg-faint, #55555c)" }} />{cat?.name ?? "보관된 카테고리"}</span>
                <span className="rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st === "over" ? "var(--danger)" : st === "warn" ? "var(--lime)" : "#2a2a2e", color: st === "ok" ? "#d6d6da" : "#0b0b0c" }}>{Math.round(p)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-[var(--surface-4,#2a2a2e)]"><div className="h-full" style={{ width: `${Math.min(100, p)}%`, background: BAR[st] }} /></div>
              <div className="flex justify-between text-[13px] text-fg-subtle"><span>{formatWon(spent)} 사용</span><span>예산 {formatWon(b.amount)}</span></div>
              <span className="text-xs" style={{ color: st === "over" ? "var(--danger)" : st === "warn" ? "var(--lime)" : "#8d8d94" }}>
                {st === "over" ? `${formatWon(spent - b.amount)}원 초과` : st === "warn" ? "80% 도달" : `${formatWon(b.amount - spent)}원 남음`}
              </span>
              <div className="flex gap-3 text-xs text-fg-subtle">
                <button onClick={() => editAmount(b.category_id, b.amount)}>수정</button>
                <button onClick={() => { if (confirm("이 카테고리 예산을 삭제할까요?")) delBudget.mutate(b.id); }} className="hover:text-danger">삭제</button>
              </div>
            </div>
          );
        })}
        {adding ? (
          <div className="flex flex-col gap-2 rounded-[20px] border border-dashed border-border p-5 text-sm">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="rounded-xl bg-surface-3 px-3 py-2 outline-none">
              <option value="">카테고리 선택</option>
              {cats.filter((c) => !catRows.some((b) => b.category_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={newAmt} inputMode="numeric" onChange={(e) => setNewAmt(e.target.value)} placeholder="예산 금액(원)" className="rounded-xl bg-surface-3 px-3 py-2 outline-none" />
            <div className="flex gap-2">
              <button onClick={() => { if (!newCat) { setErr("카테고리를 선택하세요"); return; } save(newCat, newAmt, () => { setAdding(false); setNewCat(""); setNewAmt(""); }); }} className="flex-1 rounded-xl bg-fg py-2 font-semibold text-bg">저장</button>
              <button onClick={() => setAdding(false)} className="flex-1 rounded-xl border border-[color:var(--border-strong,#3a3a40)] py-2">취소</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex min-h-[130px] items-center justify-center rounded-[20px] border-[1.5px] border-dashed border-border p-5 text-sm text-fg-subtle">+ 카테고리 예산 추가</button>
        )}
      </div>
    </div>
  );
}
