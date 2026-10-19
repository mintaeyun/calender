"use client";

import { useState } from "react";
import { useTimezone } from "@/lib/profile";
import { addDays, todayKey } from "@/lib/time";
import { useAccounts, useCategories, useCreateRecurring, useDeleteRecurring, useRecurring, useUpdateRecurring } from "../hooks";
import { formatWon, parseAmount } from "../lib/money";
import { cycleLabel, firstRunDate, monthlyTotal, nextPayDate } from "../lib/recurring";
import { useBudgets } from "../hooks";
import { monthOf } from "../lib/month";

/** 고정지출/구독(LED-7): 목록·등록·활성 토글·삭제. 결제일 거래 자동 생성은 DB 함수 run_recurring_payments(cron)가 한다. */
export function LedgerRecurring() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const list = useRecurring().data ?? [];
  const accounts = useAccounts().data ?? [];
  const cats = useCategories("expense").data ?? [];
  const totalBudget = useBudgets(monthOf(today)).data?.find((b) => b.category_id === null);
  const create = useCreateRecurring(), update = useUpdateRecurring(), del = useDeleteRecurring();

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", amount: "", cycle: "monthly" as "monthly" | "yearly", payDay: String(Number(today.slice(8))), payMonth: String(Number(today.slice(5, 7))), categoryId: "", accountId: "" });
  const [err, setErr] = useState("");

  const monthSum = monthlyTotal(list);
  const tomorrow = addDays(today, 1);
  const soon = list.filter((r) => r.active && r.next_run_date === tomorrow);
  const acct = (id: string) => accounts.find((a) => a.account_id === id)?.name ?? "";
  const cat = (id: string | null) => cats.find((c) => c.id === id);

  const submit = () => {
    const a = parseAmount(f.amount);
    const day = Number(f.payDay), mon = Number(f.payMonth);
    if (!f.name.trim()) return setErr("이름을 입력하세요");
    if (!a.ok) return setErr(a.error);
    if (!(day >= 1 && day <= 31)) return setErr("결제일은 1~31이에요");
    const accountId = f.accountId || accounts[0]?.account_id;
    if (!accountId) return setErr("계좌를 먼저 만들어 주세요");
    setErr("");
    const pay_month = f.cycle === "yearly" ? mon : null;
    create.mutate(
      { name: f.name.trim(), amount: a.value, cycle: f.cycle, pay_day: day, pay_month, category_id: f.categoryId || null, account_id: accountId, next_run_date: firstRunDate(f.cycle, day, pay_month, today) },
      { onSuccess: () => { setOpen(false); setF({ ...f, name: "", amount: "" }); }, onError: (e) => setErr((e as Error).message) },
    );
  };
  const inp = "rounded-xl bg-surface-3 px-3 py-2 text-sm outline-none";

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3 rounded-[22px] bg-surface px-[22px] py-2.5">
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_110px_100px_90px] gap-3 border-b border-border py-3 text-xs text-fg-subtle sm:grid">
          <span>이름</span><span>주기</span><span>다음 결제</span><span>계좌</span><span className="text-right">금액</span><span />
        </div>
        {list.map((r) => (
          <div key={r.id} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-surface-3 py-3.5 text-sm sm:grid-cols-[minmax(0,1fr)_120px_110px_110px_100px_90px] ${r.active ? "" : "opacity-50"}`}>
            <span className="flex min-w-0 flex-col gap-0.5"><span className="flex items-center gap-2.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat(r.category_id)?.color ?? "#55555c" }} /><span className="truncate">{r.name}</span>{r.next_run_date === tomorrow && r.active && <span className="text-[11px] text-lime">내일</span>}</span><span className="text-xs text-fg-subtle sm:hidden">{cycleLabel(r.cycle, r.pay_day, r.pay_month)} · 다음 {r.next_run_date.slice(5).replace("-", "/")} · {acct(r.account_id)}</span></span>
            <span className="hidden text-fg-muted sm:block">{cycleLabel(r.cycle, r.pay_day, r.pay_month)}</span>
            <span className="hidden sm:block">{r.next_run_date.slice(5).replace("-", "/")}</span>
            <span className="hidden text-fg-subtle sm:block">{acct(r.account_id)}</span>
            <span className="text-right font-semibold">{formatWon(r.amount)}</span>
            <span className="flex items-center justify-end gap-2.5">
              <button role="switch" aria-checked={r.active} aria-label={`${r.name} 활성`} onClick={() => update.mutate({ id: r.id, patch: r.active ? { active: false } : { active: true, next_run_date: nextPayDate(r.cycle, r.pay_day, r.pay_month, addDays(today, -1)) } })}
                className="relative h-[22px] w-10 rounded-full" style={{ background: r.active ? "var(--lime)" : "#3a3a40" }}>
                <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white" style={{ left: r.active ? 20 : 2 }} />
              </button>
              <button aria-label={`${r.name} 삭제`} className="p-1.5 text-fg-subtle hover:text-danger" onClick={() => { if (confirm(`'${r.name}' 고정지출을 삭제할까요? 이미 등록된 거래는 남아요.`)) del.mutate(r.id); }} >✕</button>
            </span>
          </div>
        ))}
        {list.length === 0 && <div className="p-10 text-center text-[#6c6c73]">등록된 고정지출이 없어요</div>}
        {open ? (
          <div className="grid grid-cols-2 gap-2 py-3">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="이름 (예: 넷플릭스)" className={`${inp} col-span-2`} />
            <input value={f.amount} inputMode="numeric" onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="금액(원)" className={inp} />
            <select value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value as "monthly" | "yearly" })} className={inp}><option value="monthly">매월</option><option value="yearly">매년</option></select>
            {f.cycle === "yearly" && <input value={f.payMonth} inputMode="numeric" onChange={(e) => setF({ ...f, payMonth: e.target.value })} placeholder="결제 월" className={inp} />}
            <input value={f.payDay} inputMode="numeric" onChange={(e) => setF({ ...f, payDay: e.target.value })} placeholder="결제일" className={inp} />
            <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={inp}><option value="">카테고리 없음</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={f.accountId || accounts[0]?.account_id || ""} onChange={(e) => setF({ ...f, accountId: e.target.value })} className={inp}>{accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</select>
            {err && <span className="col-span-2 text-sm text-danger">{err}</span>}
            <button onClick={submit} disabled={create.isPending} className="rounded-xl bg-white py-2 text-sm font-semibold text-black disabled:opacity-60">저장</button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-[#3a3a40] py-2 text-sm">취소</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="py-3 text-left text-sm text-fg-subtle">+ 고정지출 추가</button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 rounded-[22px] bg-surface p-[22px]">
          <span className="text-[13px] text-fg-subtle">월 고정지출 합계</span>
          <span className="text-[30px] font-bold">{formatWon(monthSum)}원</span>
          <span className="text-[13px] text-fg-subtle">{totalBudget ? `월 예산의 ${((monthSum / totalBudget.amount) * 100).toFixed(1)}% · ` : ""}연간 항목 별도</span>
        </div>
        {soon.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[22px] bg-lime px-[22px] py-5 text-[#0b0b0c]">
            <span className="text-[13px] font-bold">내일 결제</span>
            {soon.map((r) => <span key={r.id} className="text-xl font-bold">{r.name} {formatWon(r.amount)}원</span>)}
            <span className="text-[13px]">{acct(soon[0].account_id)} · 결제일에 거래 자동 등록</span>
          </div>
        )}
      </div>
    </div>
  );
}
