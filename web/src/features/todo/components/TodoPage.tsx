"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuickAdd } from "@/components/layout/QuickAdd";
import { useTimezone } from "@/lib/profile";
import { useProjects, useTags, useToggleDone, useTodos } from "../hooks";
import { compareTodos, dueKind, dueLabel, matchesFilter, todayIn, type TodoFilter, type TodoSort } from "../lib/due";
import { PRI_COLORS, PRI_LABEL, recurrenceLabel } from "../lib/display";
import { Kanban } from "./Kanban";
import { TodoDetail } from "./TodoDetail";
import { ProjectTagPanel } from "./ProjectTagPanel";

export const FILTERS: [TodoFilter, string][] = [["today", "오늘"], ["upcoming", "예정"], ["overdue", "기한초과"], ["all", "전체"], ["done", "완료"]];
const SORTS: [TodoSort, string][] = [["due", "마감순"], ["priority", "우선순위순"], ["created", "생성일순"]];

export function TodoPage() {
  const tz = useTimezone();
  const today = todayIn(tz);
  const { openQuick } = useQuickAdd();
  const todosQ = useTodos();
  const projects = useProjects().data ?? [];
  const tags = useTags().data ?? [];
  const toggle = useToggleDone();

  const [view, setView] = useState<"list" | "kanban">("list");
  const [filter, setFilter] = useState<TodoFilter>("today");
  const [sort, setSort] = useState<TodoSort>("due");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // 좁은 화면에서는 상세 패널이 목록 아래에 있으므로 선택하면 그쪽으로 스크롤한다.
  const selectTodo = (id: string) => {
    setSelId(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const all = useMemo(
    () => (todosQ.data ?? []).filter((t) => (!projectId || t.project_id === projectId) && (!tagId || t.todo_tags.some((x) => x.tag_id === tagId))),
    [todosQ.data, projectId, tagId],
  );
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, all.filter((t) => matchesFilter(t, k, today)).length])) as Record<TodoFilter, number>, [all, today]);
  const list = useMemo(() => all.filter((t) => matchesFilter(t, filter, today)).sort(compareTodos(sort)), [all, filter, sort, today]);

  const pc = (id: string | null) => projects.find((p) => p.id === id)?.color ?? "#8d8d94";
  const pn = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "프로젝트 없음";
  const openCount = (pid: string) => (todosQ.data ?? []).filter((t) => t.project_id === pid && t.status !== "done").length;
  const filterLabel = FILTERS.find((f) => f[0] === filter)![1];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[30px]">할일 <span className="text-fg-subtle">{view === "list" ? filterLabel : "칸반"}</span></h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={sort} onChange={(e) => setSort(e.target.value as TodoSort)} aria-label="정렬" className="rounded-full bg-surface-2 px-4 py-2 text-sm text-fg-muted outline-none">
            {SORTS.map(([k, l]) => <option key={k} value={k}>정렬 · {l}</option>)}
          </select>
          <div className="flex rounded-full bg-surface-2 p-[5px] text-sm">
            {([["list", "목록"], ["kanban", "칸반"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`rounded-full px-[18px] py-2 ${view === k ? "bg-[#3a3a40] font-semibold text-white" : "text-fg-subtle"}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => openQuick("todo")} className="rounded-full bg-white px-[18px] py-2.5 text-sm font-semibold text-black">할일 추가 +</button>
        </div>
      </div>

      {todosQ.isError && <div className="rounded-2xl bg-surface p-4 text-sm text-danger">할일을 불러오지 못했어요. {String((todosQ.error as Error).message)}</div>}

      {view === "list" ? (
        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-[18px]">
            <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible" role="group" aria-label="할일 필터">
              {FILTERS.map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-[11px] text-[15px] lg:justify-between ${filter === k ? "bg-surface-2 text-white" : "text-fg-muted"}`}>
                  <span>{label}</span><span className={`text-[13px] ${k === "overdue" && counts[k] > 0 ? "text-danger" : "text-[#6c6c73]"}`}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 px-3.5">
              <span className="text-xs tracking-wider text-[#6c6c73]">프로젝트</span>
              {projects.map((p) => (
                <button key={p.id} onClick={() => setProjectId(projectId === p.id ? null : p.id)} className={`flex items-center gap-2 py-1 text-sm ${projectId === p.id ? "text-white" : "text-[#d6d6da]"}`}>
                  <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}
                  <span className="ml-auto text-xs text-[#6c6c73]">{openCount(p.id)}</span>
                </button>
              ))}
              <span className="mt-2.5 text-xs tracking-wider text-[#6c6c73]">태그</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((g) => (
                  <button key={g.id} onClick={() => setTagId(tagId === g.id ? null : g.id)} className={`rounded-full px-2.5 py-1 text-xs ${tagId === g.id ? "bg-[#3a3a40] text-white" : "bg-surface-2"}`}>{g.name}</button>
                ))}
              </div>
              <ProjectTagPanel />
              <Link href="/todos/archive" className="mt-2.5 text-[13px] text-fg-subtle">완료 보관함 →</Link>
            </div>
          </div>

          <div className="flex flex-col rounded-[22px] bg-surface px-5 py-2.5">
            {todosQ.isLoading && <div className="p-10 text-center text-[15px] text-[#6c6c73]">불러오는 중…</div>}
            {list.map((t) => {
              const done = t.status === "done";
              const kind = dueKind(t, today);
              return (
                <div key={t.id}
                  className={`-mx-2.5 flex items-center gap-2.5 rounded-xl border-b border-border px-2.5 py-1 ${selId === t.id ? "bg-[#232327]" : ""} ${done ? "opacity-45" : ""}`}>
                  <button aria-label={done ? `${t.title} 완료 취소` : `${t.title} 완료`} onClick={() => toggle.mutate(t)}
                    className="-m-2 flex shrink-0 items-center justify-center p-2">
                    <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] text-xs ${kind === "over" ? "border-danger" : "border-[#55555c]"}`}>{done ? "✓" : ""}</span>
                  </button>
                  <button onClick={() => selectTodo(t.id)} aria-current={selId === t.id} className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className={`break-words text-[15px] ${done ? "line-through" : ""}`}>{t.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-fg-subtle">
                        <span className="flex items-center gap-[5px]"><span className="h-[7px] w-[7px] rounded-sm" style={{ background: pc(t.project_id) }} />{pn(t.project_id)}</span>
                        {t.recurrence_rule && <span>반복 · {recurrenceLabel(t.recurrence_rule)}</span>}
                        {t.todo_items.length > 0 && <span>체크 {t.todo_items.filter((i) => i.done).length}/{t.todo_items.length}</span>}
                      </span>
                    </span>
                    <span className="h-fit rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: PRI_COLORS[t.priority].bg, color: PRI_COLORS[t.priority].fg }}>{PRI_LABEL[t.priority]}</span>
                    <span className={`w-[52px] text-right text-[13px] sm:w-[72px] ${done ? "text-[#6c6c73]" : kind === "over" ? "text-danger" : kind === "today" ? "text-lime" : "text-fg-subtle"}`}>{dueLabel(t.due_date, today)}</span>
                  </button>
                </div>
              );
            })}
            {!todosQ.isLoading && list.length === 0 && <div className="p-10 text-center text-[15px] text-[#6c6c73]">해당하는 할일이 없어요</div>}
          </div>

          <div ref={detailRef} className="scroll-mt-4">
            {selId ? <TodoDetail key={selId} id={selId} onDeleted={() => setSelId(null)} /> : <div className="rounded-[22px] bg-surface p-[22px] text-sm text-[#6c6c73]">할일을 선택하면 상세가 보여요</div>}
          </div>
        </div>
      ) : (
        <>
          <Kanban todos={all} today={today} projectColor={pc} projectName={pn} onSelect={(id) => { setSelId(id); setView("list"); setFilter("all"); }} />
        </>
      )}
    </div>
  );
}
