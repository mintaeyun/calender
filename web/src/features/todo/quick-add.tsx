"use client";

import { useState } from "react";
import type { QuickAddFormProps } from "@/components/layout/QuickAdd";
import { useTimezone } from "@/lib/profile";
import { useCreateTodo, useProjects } from "./hooks";
import { PRIORITIES, PRI_LABEL } from "./lib/display";
import { addDays, todayIn, type Priority } from "./lib/due";

/** 빠른 추가 모달의 '할일' 탭. 저장에 성공하면 onClose(). */
export function QuickAddForm({ onClose }: QuickAddFormProps) {
  const tz = useTimezone();
  const today = todayIn(tz);
  const create = useCreateTodo();
  const projects = useProjects().data ?? [];
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>(today);
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const v = title.trim();
    if (!v) { setErr("제목을 입력하세요"); return; }
    create.mutate(
      { input: { title: v, due_date: due || null, priority, project_id: projectId || null } },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  };

  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bg-[#3a3a40] font-semibold text-white" : "bg-surface-2 text-fg-subtle"}`;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-4">
      <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setErr(""); }} placeholder="무엇을 해야 하나요?" className="bg-transparent text-2xl font-bold outline-none placeholder:text-[#55555c]" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDue(today)} className={chip(due === today)}>오늘</button>
        <button type="button" onClick={() => setDue(addDays(today, 1))} className={chip(due === addDays(today, 1))}>내일</button>
        <button type="button" onClick={() => setDue("")} className={chip(due === "")}>마감 없음</button>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" className="rounded-full bg-surface-2 px-3 py-2 text-sm text-fg-muted outline-none" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-fg-subtle">우선순위</span>
        {PRIORITIES.map((p) => <button type="button" key={p} onClick={() => setPriority(p)} className={chip(priority === p)}>{PRI_LABEL[p]}</button>)}
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="프로젝트" className="ml-auto rounded-full bg-surface-2 px-3 py-2 text-sm text-fg-muted outline-none">
          <option value="">프로젝트 없음</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {err && <span className="text-sm text-danger">{err}</span>}
      <button type="submit" disabled={create.isPending} className="rounded-full bg-lime py-3.5 text-base font-bold text-black disabled:opacity-60">{create.isPending ? "저장 중…" : "저장"}</button>
    </form>
  );
}
