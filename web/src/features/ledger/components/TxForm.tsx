"use client";

import { useEffect, useRef, useState } from "react";
import { useTimezone } from "@/lib/profile";
import { todayKey } from "@/lib/time";
import { suggestMemos, type NewTransaction, type Transaction } from "../api";
import { useAccounts, useCategories, useCreateTransaction, useRecentCategories, useUpdateTransaction } from "../hooks";
import { formatWon, parseAmount, type TxType } from "../lib/money";
import { ReceiptSection } from "./ReceiptSection";

const TYPES: [TxType, string][] = [["expense", "지출"], ["income", "수입"], ["transfer", "이체"]];
const LAST_ACCOUNT_KEY = "ledger:lastAccount";

const readLast = () => { try { return localStorage.getItem(LAST_ACCOUNT_KEY); } catch { return null; } };
const writeLast = (id: string) => { try { localStorage.setItem(LAST_ACCOUNT_KEY, id); } catch { /* 저장 불가 환경 */ } };

/**
 * 거래 입력 폼(빠른 추가·수정 모달 공용). 금액 입력에 자동 포커스, Enter로 저장, 마지막 사용 계좌를 기억한다(1건 10초 이내 목표).
 * tx를 넘기면 수정 모드.
 */
export function TxForm({ tx, onDone }: { tx?: Transaction; onDone: () => void }) {
  const tz = useTimezone();
  const accounts = useAccounts().data ?? [];
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const [type, setType] = useState<TxType>(tx?.type ?? "expense");
  const [amountText, setAmountText] = useState(tx ? formatWon(tx.amount) : "");
  const [date, setDate] = useState(tx?.date ?? todayKey(tz));
  const [categoryId, setCategoryId] = useState<string>(tx?.category_id ?? "");
  const [accountId, setAccountId] = useState<string>(tx?.account_id ?? "");
  const [toAccountId, setToAccountId] = useState<string>(tx?.to_account_id ?? "");
  const [memo, setMemo] = useState(tx?.memo ?? "");
  const [memoHints, setMemoHints] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  const kind = type === "income" ? "income" : "expense";
  const categories = useCategories(kind).data ?? [];
  const recent = useRecentCategories(kind).data ?? [];
  const quickCats = recent.map((id) => categories.find((c) => c.id === id)).filter((c) => !!c);
  const shownCats = quickCats.length ? quickCats : categories.slice(0, 6);

  useEffect(() => { amountRef.current?.focus(); }, []);
  // 계좌 기본값: 마지막 사용 계좌 → 첫 계좌
  useEffect(() => {
    if (accountId || accounts.length === 0) return;
    const last = readLast();
    setAccountId(accounts.find((a) => a.account_id === last)?.account_id ?? accounts[0].account_id);
  }, [accounts, accountId]);
  // 카테고리는 구분을 바꾸면 초기화
  useEffect(() => { if (categoryId && !categories.some((c) => c.id === categoryId) && categories.length) setCategoryId(""); }, [kind, categories]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => { if (memo.length >= 1 && !tx) suggestMemos(memo).then(setMemoHints).catch(() => setMemoHints([])); else setMemoHints([]); }, 200);
    return () => clearTimeout(t);
  }, [memo, tx]);

  const submit = () => {
    const a = parseAmount(amountText);
    if (!a.ok) { setErr(a.error); amountRef.current?.focus(); return; }
    const body: NewTransaction = {
      date, amount: a.value, type, account_id: accountId, memo: memo.trim() || null,
      category_id: type === "transfer" ? null : categoryId || null,
      to_account_id: type === "transfer" ? toAccountId || null : null,
    };
    const opts = { onSuccess: () => { writeLast(accountId); onDone(); }, onError: (e: Error) => setErr(e.message) };
    if (tx) update.mutate({ id: tx.id, tx: body }, opts);
    else create.mutate(body, opts);
  };
  const pending = create.isPending || update.isPending;
  const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm ${on ? "bg-[#3a3a40] font-semibold text-white" : "bg-surface-3 text-fg-subtle"}`;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TYPES.map(([k, l]) => (
          <button type="button" key={k} onClick={() => { setType(k); setErr(""); }} className={`rounded-full px-4 py-[7px] text-sm ${type === k ? "bg-white font-semibold text-black" : "bg-surface-3 text-fg-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="flex items-baseline gap-2">
        <input
          ref={amountRef} inputMode="numeric" value={amountText} aria-label="금액" placeholder="0"
          onChange={(e) => { setErr(""); const d = e.target.value.replace(/[^\d]/g, ""); setAmountText(d ? formatWon(Number(d)) : ""); }}
          className="min-w-0 flex-1 bg-transparent text-[44px] font-bold tracking-tight outline-none placeholder:text-[#3a3a40]"
        />
        <span className="text-2xl text-fg-subtle">원</span>
      </div>

      {type !== "transfer" && (
        <div className="flex flex-wrap items-center gap-2">
          {shownCats.map((c) => (
            <button type="button" key={c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)} className={`${chip(categoryId === c.id)} flex items-center gap-1.5`}>
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: c.color }} />{c.name}
            </button>
          ))}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="카테고리" className="rounded-full bg-surface-3 px-3 py-1.5 text-sm text-fg-muted outline-none">
            <option value="">카테고리 없음</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 text-sm">
        <label className="flex flex-col gap-1 rounded-[14px] bg-surface-3 px-3.5 py-3"><span className="text-xs text-fg-subtle">{type === "transfer" ? "보내는 계좌" : "계좌"}</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="bg-transparent outline-none">
            {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
          </select>
        </label>
        {type === "transfer" ? (
          <label className="flex flex-col gap-1 rounded-[14px] bg-surface-3 px-3.5 py-3"><span className="text-xs text-fg-subtle">받는 계좌</span>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="bg-transparent outline-none">
              <option value="">선택</option>
              {accounts.filter((a) => a.account_id !== accountId).map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 rounded-[14px] bg-surface-3 px-3.5 py-3"><span className="text-xs text-fg-subtle">날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent outline-none" />
          </label>
        )}
        {type === "transfer" && (
          <label className="col-span-2 flex flex-col gap-1 rounded-[14px] bg-surface-3 px-3.5 py-3"><span className="text-xs text-fg-subtle">날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent outline-none" />
          </label>
        )}
        <label className="col-span-2 flex flex-col gap-1 rounded-[14px] bg-surface-3 px-3.5 py-3"><span className="text-xs text-fg-subtle">메모</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" className="bg-transparent outline-none placeholder:text-[#55555c]" />
          {memoHints.length > 0 && (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {memoHints.map((h) => <button type="button" key={h} onClick={() => { setMemo(h); setMemoHints([]); }} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{h}</button>)}
            </span>
          )}
        </label>
      </div>

      {tx && type !== "transfer" && <ReceiptSection transactionId={tx.id} />}

      {err && <span className="text-sm text-danger" role="alert">{err}</span>}
      <button type="submit" disabled={pending} className="rounded-full bg-lime py-3.5 text-base font-bold text-black disabled:opacity-60">{pending ? "저장 중…" : tx ? "수정 저장" : "저장"}</button>
    </form>
  );
}
