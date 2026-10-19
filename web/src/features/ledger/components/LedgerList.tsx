"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimezone } from "@/lib/profile";
import { todayKey, WEEKDAYS_KO, weekdayOf } from "@/lib/time";
import { summarize, type Transaction } from "../api";
import { useAccounts, useCategories, useDeleteTransaction, useReceiptCounts, useTransactions } from "../hooks";
import { fromParams, groupByDate, toApiFilter, toParams, type UiFilter } from "../lib/filters";
import { formatSigned, formatWon } from "../lib/money";
import { CategoryManager } from "./CategoryManager";
import { Modal } from "./Modal";
import { TxForm } from "./TxForm";

const TYPE_TABS: [UiFilter["type"], string][] = [["all", "전체"], ["expense", "지출"], ["income", "수입"], ["transfer", "이체"]];
const chipBase = "rounded-full bg-surface-2 px-3.5 py-2 text-sm text-fg-muted outline-none";

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${WEEKDAYS_KO[weekdayOf(d)]})`;

export function LedgerList() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filter = useMemo(() => fromParams(new URLSearchParams(params.toString()), today), [params, today]);
  const setFilter = (patch: Partial<UiFilter>) => {
    const qs = toParams({ ...filter, ...patch }, today).toString();
    router.replace(qs ? `${path}?${qs}` : path);
  };

  const q = useTransactions(toApiFilter(filter));
  const categories = useCategories(undefined, true).data ?? [];
  const accounts = useAccounts(true).data ?? [];
  const del = useDeleteTransaction();
  const receiptCount = useReceiptCounts((q.data ?? []).filter((t) => t.type !== "transfer").map((t) => t.id)).data;
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [managing, setManaging] = useState(false);

  const rows = q.data ?? [];
  const sum = summarize(rows);
  const groups = groupByDate(rows);
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  const acct = (id: string | null) => accounts.find((a) => a.account_id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {TYPE_TABS.map(([k, label]) => (
          <button key={k} aria-pressed={filter.type === k} onClick={() => setFilter({ type: k })} className={`rounded-full px-4 py-[9px] text-sm ${filter.type === k ? "bg-fg font-semibold text-bg" : "bg-surface-2 text-fg-muted"}`}>{label}</button>
        ))}
        <span className="mx-1 h-6 w-px bg-[var(--surface-4,#2a2a2e)]" />
        <input type="date" aria-label="시작일" value={filter.from} onChange={(e) => setFilter({ from: e.target.value })} className={chipBase} />
        <span className="text-fg-subtle">–</span>
        <input type="date" aria-label="종료일" value={filter.to} onChange={(e) => setFilter({ to: e.target.value })} className={chipBase} />
        <select aria-label="카테고리" value={filter.categoryId} onChange={(e) => setFilter({ categoryId: e.target.value })} className={chipBase}>
          <option value="">카테고리 · 전체</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (보관)" : ""}</option>)}
        </select>
        <select aria-label="계좌" value={filter.accountId} onChange={(e) => setFilter({ accountId: e.target.value })} className={chipBase}>
          <option value="">계좌 · 전체</option>
          {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
        </select>
        <input inputMode="numeric" aria-label="최소 금액" placeholder="최소 금액" value={filter.min} onChange={(e) => setFilter({ min: e.target.value })} className={`${chipBase} w-28`} />
        <span className="text-fg-subtle">~</span>
        <input inputMode="numeric" aria-label="최대 금액" placeholder="최대 금액" value={filter.max} onChange={(e) => setFilter({ max: e.target.value })} className={`${chipBase} w-28`} />
        <button onClick={() => setManaging(true)} className="ml-auto text-[13px] text-fg-subtle">카테고리 관리</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([["수입", `${formatWon(sum.income)}원`], ["지출", `${formatWon(sum.expense)}원`], [`필터 결과 · ${sum.count}건`, `${sum.net >= 0 ? "+" : "−"}${formatWon(Math.abs(sum.net))}원`]] as const).map(([label, v], i) => (
          <div key={label} className="flex flex-col gap-1 rounded-[18px] bg-surface px-5 py-4">
            <span className="text-[13px] text-fg-subtle">{label}</span>
            <span className={`text-[26px] font-bold ${i === 2 ? "text-lime" : ""}`}>{v}</span>
          </div>
        ))}
      </div>

      {q.isError && <div className="rounded-2xl bg-surface p-4 text-sm text-danger">거래를 불러오지 못했어요. {(q.error as Error).message}</div>}

      <div className="flex flex-col rounded-[22px] bg-surface px-[22px] pb-3.5 pt-2">
        {q.isLoading && <div className="p-10 text-center text-[color:var(--fg-dim,#6c6c73)]">불러오는 중…</div>}
        {groups.map((g) => (
          <div key={g.date} className="flex flex-col">
            <div className="flex justify-between border-b border-border pb-2 pt-4 text-[13px] text-fg-subtle">
              <span className="font-semibold text-fg-muted">{dayLabel(g.date)}</span>
              <span>{g.income > 0 && `수입 ${formatWon(g.income)} · `}지출 {formatWon(g.expense)}</span>
            </div>
            {g.rows.map((t) => {
              const c = cat(t.category_id);
              return (
                <button key={t.id} onClick={() => setEditing(t)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-surface-3 py-3 text-left text-sm sm:grid-cols-[140px_minmax(0,1fr)_160px_120px] sm:gap-y-0">
                  <span className="order-3 flex w-fit items-center gap-1.5 rounded-full bg-[var(--surface-4,#2a2a2e)] px-2.5 py-1 text-xs sm:order-none">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: t.type === "transfer" ? "var(--fg-subtle)" : c?.color ?? "var(--fg-faint, #55555c)" }} />
                    {t.type === "transfer" ? "이체" : c?.name ?? "미분류"}
                  </span>
                  <span className="order-1 flex min-w-0 items-center gap-2 truncate sm:order-none">
                    {t.type === "transfer" ? `${acct(t.account_id)} → ${acct(t.to_account_id)}` : t.memo ?? ""}
                    {t.type === "transfer" && t.memo ? ` · ${t.memo}` : ""}
                    {t.source === "mcp" && <span className="text-[11px] text-fg-subtle">· Claude에서 기록</span>}
                    {t.recurring_id && <span className="text-[11px] text-fg-subtle">· 고정지출</span>}
                    {receiptCount?.get(t.id) ? <span className="text-[11px] text-fg-subtle" aria-label="영수증 있음">📎{receiptCount.get(t.id)}</span> : null}
                  </span>
                  <span className="order-4 truncate text-right text-[13px] text-fg-subtle sm:order-none sm:text-left">{t.type === "transfer" ? "" : acct(t.account_id)}</span>
                  <span className={`order-2 text-right font-semibold sm:order-none ${t.type === "income" ? "text-lime" : t.type === "transfer" ? "text-fg-subtle" : ""}`}>{formatSigned(t.amount, t.type)}</span>
                </button>
              );
            })}
          </div>
        ))}
        {!q.isLoading && groups.length === 0 && <div className="p-10 text-center text-[15px] text-[color:var(--fg-dim,#6c6c73)]">조건에 맞는 거래가 없어요</div>}
      </div>

      {editing && (
        <Modal title="거래 수정" onClose={() => setEditing(null)}>
          <TxForm tx={editing} onDone={() => setEditing(null)} />
          <button onClick={() => { setDeleting(editing); setEditing(null); }} className="rounded-full border border-[color:var(--border-strong,#3a3a40)] py-2.5 text-sm text-danger">삭제</button>
        </Modal>
      )}
      {deleting && (
        <Modal title="거래를 삭제할까요?" onClose={() => setDeleting(null)} width={420}>
          <p className="text-sm text-fg-muted">{deleting.memo || "메모 없음"} · {formatSigned(deleting.amount, deleting.type)}원<br />삭제하면 되돌릴 수 없어요.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeleting(null)} className="flex-1 rounded-full border border-[color:var(--border-strong,#3a3a40)] py-3 text-sm">취소</button>
            <button disabled={del.isPending} onClick={() => del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} className="flex-1 rounded-full bg-danger py-3 text-sm font-bold text-[color:var(--on-accent,#0b0b0c)] disabled:opacity-60">삭제</button>
          </div>
          {del.isError && <span className="text-sm text-danger">{(del.error as Error).message}</span>}
        </Modal>
      )}
      {managing && <Modal title="카테고리 관리" onClose={() => setManaging(false)}><CategoryManager /></Modal>}
    </div>
  );
}
