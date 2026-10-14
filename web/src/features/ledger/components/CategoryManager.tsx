"use client";

import { useState } from "react";
import { useArchiveCategory, useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from "../hooks";

const COLORS = ["oklch(0.55 0.22 290)", "oklch(0.68 0.17 290)", "oklch(0.9 0.19 125)", "oklch(0.7 0.12 230)", "oklch(0.75 0.16 25)", "#55555c", "#d6d6da"];

/** 카테고리 CRUD(LED-10). 거래가 있는 카테고리는 삭제 대신 보관 처리한다. 설정 화면(08)에서도 재사용 가능. */
export function CategoryManager() {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const list = useCategories(kind, true).data ?? [];
  const create = useCreateCategory(), update = useUpdateCategory(), archive = useArchiveCategory(), del = useDeleteCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [msg, setMsg] = useState("");

  const onErr = (e: Error) => setMsg(/duplicate|unique/i.test(e.message) ? "이미 있는 이름이에요" : e.message);
  const add = () => {
    const v = name.trim();
    if (!v) return;
    setMsg("");
    create.mutate({ name: v, kind, color }, { onSuccess: () => setName(""), onError: onErr });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex gap-2">
        {([["expense", "지출"], ["income", "수입"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 ${kind === k ? "bg-white font-semibold text-black" : "bg-surface-3 text-fg-muted"}`}>{l}</button>
        ))}
      </div>
      <ul className="flex flex-col">
        {list.map((c) => (
          <li key={c.id} className={`flex items-center gap-2.5 border-b border-border py-2.5 ${c.archived ? "opacity-50" : ""}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
            <span className="flex-1">{c.name}{c.archived && <span className="ml-2 text-xs text-fg-subtle">보관됨</span>}</span>
            <button onClick={() => { const v = prompt("새 이름", c.name)?.trim(); if (v && v !== c.name) update.mutate({ id: c.id, patch: { name: v } }, { onError: onErr }); }} className="text-xs text-fg-subtle">이름</button>
            <button onClick={() => archive.mutate({ id: c.id, archived: !c.archived })} className="text-xs text-fg-subtle">{c.archived ? "복원" : "보관"}</button>
            <button
              onClick={() => {
                if (!confirm(`'${c.name}' 카테고리를 삭제할까요? 거래가 있으면 삭제 대신 보관돼요.`)) return;
                del.mutate(c.id, { onSuccess: (r) => setMsg(r === "archived" ? `'${c.name}'에 거래가 있어 삭제하지 않고 보관했어요` : `'${c.name}'을(를) 삭제했어요`), onError: onErr });
              }}
              className="text-xs text-fg-subtle hover:text-danger"
            >삭제</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="새 카테고리 이름" className="min-w-0 flex-1 rounded-xl bg-surface-3 px-3 py-2 outline-none" />
        <button onClick={add} className="rounded-xl bg-white px-4 font-semibold text-black">추가</button>
      </div>
      <div className="flex gap-1.5">
        {COLORS.map((c) => <button key={c} aria-label="색 선택" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-white" : ""}`} style={{ background: c }} />)}
      </div>
      {msg && <span className="text-xs text-lime" role="status">{msg}</span>}
    </div>
  );
}
