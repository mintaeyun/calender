"use client";

import Link from "next/link";
import { useTimezone } from "@/lib/profile";
import { dateKey } from "@/lib/time";
import { useArchive, usePurgeTodo, useRestoreTodo } from "../hooks";
import { dueFull } from "../lib/display";

/** 완료 보관함(TODO-7): 완료 시각순 조회, 복원, 영구 삭제(확인 필수). */
export function ArchivePage() {
  const tz = useTimezone();
  const { data = [], isLoading, isError, error } = useArchive();
  const restore = useRestoreTodo();
  const purge = usePurgeTodo();

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[30px]">완료 보관함 <span className="text-fg-subtle">{data.length}</span></h1>
        <Link href="/todos" className="text-sm text-fg-subtle">← 할일로</Link>
      </div>
      {isError && <div className="text-sm text-danger">{(error as Error).message}</div>}
      <div className="flex flex-col rounded-[22px] bg-surface px-5 py-2.5">
        {isLoading && <div className="p-10 text-center text-[color:var(--fg-dim,#6c6c73)]">불러오는 중…</div>}
        {data.map((t) => (
          <div key={t.id} className="flex items-center gap-3.5 border-b border-border py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[15px] line-through opacity-60">{t.title}</span>
              <span className="text-xs text-fg-subtle">
                {t.completed_at ? `${dateKey(t.completed_at, tz)} 완료` : "완료"}{t.due_date ? ` · 마감 ${dueFull(t.due_date)}` : ""}
              </span>
            </div>
            <button onClick={() => restore.mutate(t.id)} className="rounded-full border border-[color:var(--border-strong,#3a3a40)] px-3.5 py-1.5 text-sm">복원</button>
            <button onClick={() => { if (confirm(`'${t.title}'을(를) 영구 삭제할까요? 되돌릴 수 없어요.`)) purge.mutate(t.id); }} className="rounded-full px-3.5 py-1.5 text-sm text-danger">영구 삭제</button>
          </div>
        ))}
        {!isLoading && data.length === 0 && <div className="p-10 text-center text-[15px] text-[color:var(--fg-dim,#6c6c73)]">완료한 할일이 없어요</div>}
      </div>
    </div>
  );
}
