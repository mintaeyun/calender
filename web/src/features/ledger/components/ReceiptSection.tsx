"use client";

import { useRef, useState } from "react";
import { useAddReceipt, useDeleteReceipt, useReceipts } from "../hooks";
import { ACCEPTED_TYPES, MAX_RECEIPTS } from "../lib/receipts";

/** 영수증 첨부(LED-9): 거래당 최대 3장, 비공개 버킷의 서명 URL로 미리보기. 거래를 저장한 뒤(수정 화면)에서만 쓴다. */
export function ReceiptSection({ transactionId }: { transactionId: string }) {
  const { data: list = [], isLoading } = useReceipts(transactionId);
  const add = useAddReceipt();
  const del = useDeleteReceipt();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  const onPick = (files: FileList | null) => {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setErr("");
    add.mutate({ transactionId, file, count: list.length }, { onError: (e) => setErr((e as Error).message) });
  };

  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-surface-3 px-3.5 py-3">
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <span>영수증 {list.length}/{MAX_RECEIPTS}</span>
        <button type="button" disabled={list.length >= MAX_RECEIPTS || add.isPending} onClick={() => input.current?.click()} className="rounded-full border border-border-strong px-3 py-1 text-fg disabled:opacity-40">
          {add.isPending ? "올리는 중…" : "사진 추가 +"}
        </button>
      </div>
      <input ref={input} type="file" accept={ACCEPTED_TYPES.join(",")} capture="environment" className="hidden" onChange={(e) => onPick(e.target.files)} />
      <div className="flex gap-2">
        {isLoading && <span className="text-xs text-fg-dim">불러오는 중…</span>}
        {list.map((r) => (
          <div key={r.id} className="group relative h-20 w-20 overflow-hidden rounded-xl bg-surface-2">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt="영수증" className="h-full w-full object-cover" /></a>
            ) : <span className="flex h-full items-center justify-center text-[11px] text-fg-subtle">표시 불가</span>}
            <button type="button" aria-label="영수증 삭제"
              onClick={() => { if (confirm("이 영수증 사진을 삭제할까요?")) del.mutate(r, { onError: (e) => setErr((e as Error).message) }); }}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px]">✕</button>
          </div>
        ))}
        {!isLoading && list.length === 0 && <span className="text-xs text-fg-dim">첨부된 사진이 없어요</span>}
      </div>
      {err && <span className="text-xs text-danger-ink" role="alert">{err}</span>}
    </div>
  );
}
