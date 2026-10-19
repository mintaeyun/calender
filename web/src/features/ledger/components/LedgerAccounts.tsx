"use client";

import { useState } from "react";
import { useTimezone } from "@/lib/profile";
import { todayKey } from "@/lib/time";
import { useAccounts, useCreateAccount, useTransactions, useTransfer, useUpdateAccount } from "../hooks";
import { formatWon, parseAmount } from "../lib/money";
import { Modal } from "./Modal";

const TYPE_LABEL = { cash: "현금", bank: "은행", card: "카드" } as const;
const CARD_BG = { cash: ["var(--surface-4, #2a2a2e)", "var(--fg)"], bank: ["var(--lime)", "var(--on-accent, #0b0b0c)"], card: ["var(--purple)", "#fff"] } as const;

/** 계좌(LED-8): 잔액은 account_balances 뷰(초기잔액+거래 합계), 순자산(카드 부채는 음수), 계좌 CRUD, 계좌 간 이체. */
export function LedgerAccounts() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const accounts = useAccounts(true).data ?? [];
  const active = accounts.filter((a) => !a.archived);
  const recent = (useTransactions({ type: "transfer" }).data ?? []).slice(0, 5);
  const create = useCreateAccount(), update = useUpdateAccount(), transfer = useTransfer();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [f, setF] = useState({ name: "", type: "bank" as keyof typeof TYPE_LABEL, initial: "0" });
  const [t, setT] = useState({ from: "", to: "", amount: "", memo: "" });
  const [err, setErr] = useState("");

  const net = active.reduce((s, a) => s + a.balance, 0);
  const name = (id: string | null) => accounts.find((a) => a.account_id === id)?.name ?? "";
  const inp = "rounded-xl bg-surface-3 px-3 py-2 text-sm outline-none";

  const addAccount = () => {
    const raw = f.initial.replace(/[,\s원]/g, "");
    const initial = raw === "" ? 0 : Number(raw);
    if (!f.name.trim()) return setErr("이름을 입력하세요");
    if (!Number.isInteger(initial)) return setErr("초기 잔액은 정수여야 해요");
    setErr("");
    create.mutate({ name: f.name.trim(), type: f.type, initial_balance: initial }, {
      onSuccess: () => { setAdding(false); setF({ name: "", type: "bank", initial: "0" }); },
      onError: (e) => setErr(/duplicate|unique/i.test((e as Error).message) ? "이미 있는 계좌 이름이에요" : (e as Error).message),
    });
  };
  const doTransfer = () => {
    const a = parseAmount(t.amount);
    if (!a.ok) return setErr(a.error);
    const from = t.from || active[0]?.account_id;
    setErr("");
    transfer.mutate({ date: today, amount: a.value, from, to: t.to, memo: t.memo.trim() || undefined }, {
      onSuccess: () => { setMoving(false); setT({ from: "", to: "", amount: "", memo: "" }); },
      onError: (e) => setErr((e as Error).message),
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-subtle">순자산</span>
          <span className="text-[44px] font-bold tracking-tight">{net < 0 ? "−" : ""}{formatWon(Math.abs(net))}<span className="text-2xl text-fg-dim">원</span></span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setErr(""); setAdding(true); }} className="rounded-full border border-border-strong px-[18px] py-2.5 text-sm">계좌 추가 +</button>
          <button onClick={() => { setErr(""); setMoving(true); }} disabled={active.length < 2} className="rounded-full border border-border-strong px-[18px] py-2.5 text-sm disabled:opacity-40">계좌 간 이체 ⇄</button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {accounts.map((a) => (
          <div key={a.account_id} className={`flex min-h-[170px] flex-col justify-between gap-7 rounded-[22px] p-[22px] ${a.archived ? "opacity-50" : ""}`} style={{ background: CARD_BG[a.type][0], color: CARD_BG[a.type][1] }}>
            <div className="flex justify-between text-[13px]">
              <span className="font-semibold">{TYPE_LABEL[a.type]}</span>
              <span className="flex gap-2.5 opacity-70">
                <button onClick={() => { const v = prompt("새 이름", a.name)?.trim(); if (v && v !== a.name) update.mutate({ id: a.account_id, patch: { name: v } }); }}>이름</button>
                <button onClick={() => update.mutate({ id: a.account_id, patch: { archived: !a.archived } })}>{a.archived ? "복원" : "보관"}</button>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold">{a.name}</span>
              <span className="text-[26px] font-bold">{a.balance < 0 ? "−" : ""}{formatWon(Math.abs(a.balance))}원</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-[22px] bg-surface px-[22px] py-5">
        <span className="text-[15px] font-semibold">최근 이체</span>
        {recent.map((r) => (
          <div key={r.id} className="flex justify-between border-b border-border py-2 text-sm last:border-0">
            <span>{name(r.account_id)} → {name(r.to_account_id)}</span><span className="text-fg-subtle">{r.date.slice(5).replace("-", "/")} · {formatWon(r.amount)}</span>
          </div>
        ))}
        {recent.length === 0 && <span className="text-sm text-fg-dim">이체 내역이 없어요</span>}
        <span className="text-xs text-fg-dim">카드 결제일 정산은 지원하지 않아요. 카드값 납부는 은행 → 카드 이체로 기록하세요.</span>
      </div>

      {adding && (
        <Modal title="계좌 추가" onClose={() => setAdding(false)} width={420}>
          <div className="flex flex-col gap-2">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="계좌 이름" className={inp} />
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as keyof typeof TYPE_LABEL })} className={inp}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={f.initial} inputMode="numeric" onChange={(e) => setF({ ...f, initial: e.target.value })} placeholder="초기 잔액(원, 카드 부채는 음수)" className={inp} />
            {err && <span className="text-sm text-danger-ink">{err}</span>}
            <button onClick={addAccount} disabled={create.isPending} className="rounded-xl bg-fg py-2.5 font-semibold text-bg disabled:opacity-60">추가</button>
          </div>
        </Modal>
      )}
      {moving && (
        <Modal title="계좌 간 이체" onClose={() => setMoving(false)} width={420}>
          <div className="flex flex-col gap-2">
            <select value={t.from || active[0]?.account_id} onChange={(e) => setT({ ...t, from: e.target.value })} className={inp}>{active.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</select>
            <select value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} className={inp}><option value="">받는 계좌</option>{active.filter((a) => a.account_id !== (t.from || active[0]?.account_id)).map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}</select>
            <input value={t.amount} inputMode="numeric" onChange={(e) => setT({ ...t, amount: e.target.value })} placeholder="금액(원)" className={inp} />
            <input value={t.memo} onChange={(e) => setT({ ...t, memo: e.target.value })} placeholder="메모 (선택)" className={inp} />
            {err && <span className="text-sm text-danger-ink">{err}</span>}
            <button onClick={doTransfer} disabled={transfer.isPending} className="rounded-xl bg-fg py-2.5 font-semibold text-bg disabled:opacity-60">이체</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
