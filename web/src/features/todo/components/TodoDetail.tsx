"use client";

import { useEffect, useState } from "react";
import { useAddItem, useDeleteItem, useDeleteTodo, useProjects, useSetTodoTags, useTags, useTodo, useUpdateItem, useUpdateTodo } from "../hooks";
import { PRIORITIES, PRI_LABEL, DAY_OPTIONS, buildRule, dueFull, parseRule, recurrenceLabel, type RecurrenceDraft } from "../lib/display";
import type { Priority } from "../lib/due";

const field = "rounded-lg bg-surface-3 px-2 py-1 text-sm text-fg outline-none focus:ring-1 focus:ring-lime";

/** 상세 패널: 필드 인라인 편집(변경 즉시 저장), 체크리스트, 메모, 반복. */
export function TodoDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { data: t } = useTodo(id);
  const projects = useProjects().data ?? [];
  const tags = useTags().data ?? [];
  const update = useUpdateTodo();
  const setTags = useSetTodoTags();
  const addItem = useAddItem();
  const updItem = useUpdateItem();
  const delItem = useDeleteItem();
  const del = useDeleteTodo();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newItem, setNewItem] = useState("");
  const [rec, setRec] = useState<RecurrenceDraft>({ freq: "NONE", byday: [], until: "" });

  useEffect(() => {
    if (!t) return;
    setTitle(t.title); setNotes(t.notes ?? ""); setRec(parseRule(t.recurrence_rule));
  }, [t?.id, t?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <div className="rounded-[22px] bg-surface p-[22px] text-sm text-fg-subtle">불러오는 중…</div>;

  const patch = (p: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id: t.id, patch: p });
  const saveRec = (next: RecurrenceDraft, due = t.due_date) => { setRec(next); patch({ recurrence_rule: buildRule(next, due) }); };
  const tagIds = t.todo_tags.map((x) => x.tag_id);
  const items = t.todo_items;
  const donePct = items.length ? `${items.filter((i) => i.done).length}/${items.length}` : "";

  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-surface p-[22px]">
      <div className="flex items-center justify-between text-[13px] text-fg-subtle">
        <span>상세</span>
        <button
          onClick={() => { if (confirm("이 할일을 삭제할까요?")) del.mutate(t.id, { onSuccess: onDeleted }); }}
          className="hover:text-danger"
        >삭제</button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { const v = title.trim(); if (v && v !== t.title) patch({ title: v }); else setTitle(t.title); }}
        className="bg-transparent text-[22px] font-bold tracking-tight outline-none"
        aria-label="제목"
      />
      <div className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
        <span className="text-fg-subtle">마감일</span>
        <span className="flex items-center gap-2">
          <input type="date" value={t.due_date ?? ""} onChange={(e) => { const v = e.target.value || null; patch({ due_date: v, ...(t.recurrence_rule ? { recurrence_rule: buildRule(rec, v) } : {}) }); }} className={field} />
          <span className="text-xs text-fg-subtle">{dueFull(t.due_date)}</span>
        </span>
        <span className="text-fg-subtle">우선순위</span>
        <select value={t.priority} onChange={(e) => patch({ priority: e.target.value as Priority })} className={`${field} w-24`}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
        </select>
        <span className="text-fg-subtle">프로젝트</span>
        <select value={t.project_id ?? ""} onChange={(e) => patch({ project_id: e.target.value || null })} className={`${field} w-40`}>
          <option value="">없음</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-fg-subtle">태그</span>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((g) => {
            const on = tagIds.includes(g.id);
            return (
              <button key={g.id} onClick={() => setTags.mutate({ todoId: t.id, tagIds: on ? tagIds.filter((x) => x !== g.id) : [...tagIds, g.id] })}
                className={`rounded-full px-2.5 py-1 text-xs ${on ? "bg-[#3a3a40] text-white" : "bg-surface-2 text-fg-subtle"}`}>{g.name}</button>
            );
          })}
          {tags.length === 0 && <span className="text-xs text-fg-subtle">태그 없음</span>}
        </div>
        <span className="text-fg-subtle">반복</span>
        <div className="flex flex-col gap-1.5">
          <select value={rec.freq} onChange={(e) => saveRec({ ...rec, freq: e.target.value as RecurrenceDraft["freq"], byday: [] })} className={`${field} w-28`}>
            <option value="NONE">없음</option><option value="DAILY">매일</option><option value="WEEKLY">매주</option>
            <option value="MONTHLY">매월</option><option value="YEARLY">매년</option>
          </select>
          {rec.freq === "WEEKLY" && (
            <div className="flex gap-1">
              {DAY_OPTIONS.map(([code, label]) => (
                <button key={code} onClick={() => saveRec({ ...rec, byday: rec.byday.includes(code) ? rec.byday.filter((c) => c !== code) : [...rec.byday, code] })}
                  className={`h-7 w-7 rounded-full text-xs ${rec.byday.includes(code) ? "bg-lime text-black" : "bg-surface-2 text-fg-subtle"}`}>{label}</button>
              ))}
            </div>
          )}
          {rec.freq !== "NONE" && (
            <label className="flex items-center gap-2 text-xs text-fg-subtle">종료
              <input type="date" value={rec.until} onChange={(e) => saveRec({ ...rec, until: e.target.value })} className={field} />
            </label>
          )}
          {t.recurrence_rule && <span className="text-xs text-fg-subtle">{recurrenceLabel(t.recurrence_rule)} · 완료하면 다음 주기가 만들어져요</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3.5">
        <span className="text-[13px] text-fg-subtle">체크리스트 {donePct}</span>
        {items.map((i) => (
          <div key={i.id} className="group flex items-center gap-2.5 text-sm">
            <button aria-label="체크" onClick={() => updItem.mutate({ id: i.id, patch: { done: !i.done } })}
              className="flex h-4 w-4 items-center justify-center rounded border-[1.5px] border-[#55555c] text-[10px]">{i.done ? "✓" : ""}</button>
            <span className={`flex-1 ${i.done ? "text-[#6c6c73] line-through" : ""}`}>{i.text}</span>
            <button aria-label="항목 삭제" onClick={() => delItem.mutate(i.id)} className="text-fg-subtle opacity-0 group-hover:opacity-100">✕</button>
          </div>
        ))}
        {items.length === 0 && <span className="text-sm text-[#6c6c73]">체크리스트 없음</span>}
        <form onSubmit={(e) => { e.preventDefault(); const v = newItem.trim(); if (!v) return; addItem.mutate({ todoId: t.id, text: v, positions: items.map((i) => i.position) }); setNewItem(""); }}>
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="+ 항목 추가" className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-[#6c6c73]" />
        </form>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3.5">
        <span className="text-[13px] text-fg-subtle">메모</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (t.notes ?? "")) patch({ notes: notes || null }); }}
          rows={4} placeholder="메모 없음" className="resize-y bg-transparent text-sm leading-relaxed text-[#d6d6da] outline-none placeholder:text-[#6c6c73]" />
      </div>
    </div>
  );
}
