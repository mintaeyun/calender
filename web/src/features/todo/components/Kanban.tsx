"use client";

import { useState } from "react";
import type { Todo } from "../api";
import { useMoveTodo } from "../hooks";
import { dueKind, dueLabel, type TodoStatus } from "../lib/due";
import { COLUMNS, PRI_COLORS, PRI_LABEL } from "../lib/display";

type Props = { todos: Todo[]; today: string; projectColor: (id: string | null) => string; projectName: (id: string | null) => string; onSelect: (id: string) => void };

/** 3열 칸반(대기/진행 중/완료). 드래그로 열·순서를 바꾸고, 키보드/터치용 이동 버튼도 제공한다. */
export function Kanban({ todos, today, projectColor, projectName, onSelect }: Props) {
  const move = useMoveTodo();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoStatus | null>(null);

  const byCol = (s: TodoStatus) => todos.filter((t) => t.status === s).sort((a, b) => a.position - b.position);

  /** index 위치(0 = 맨 위)에 놓는다. 드래그 중인 카드는 이웃 계산에서 제외. */
  const dropAt = (id: string, status: TodoStatus, index: number) => {
    const cards = byCol(status).filter((t) => t.id !== id);
    const prev = index > 0 ? cards[index - 1]?.position ?? null : null;
    const next = cards[index]?.position ?? null;
    move.mutate({ id, status, prev, next });
  };

  const shift = (t: Todo, dir: -1 | 1) => {
    const i = COLUMNS.findIndex((c) => c.status === t.status) + dir;
    if (i < 0 || i >= COLUMNS.length) return;
    dropAt(t.id, COLUMNS[i].status, byCol(COLUMNS[i].status).length); // 이웃 열의 맨 아래
  };

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const cards = byCol(col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.status); }}
            onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              if (dragId) dropAt(dragId, col.status, cards.filter((t) => t.id !== dragId).length); // 열 빈 곳에 놓으면 맨 아래
              setDragId(null);
            }}
            className={`flex min-h-[120px] flex-col gap-2.5 md:min-h-[520px] rounded-[22px] bg-surface-sunken p-4 ${overCol === col.status ? "outline outline-1 outline-lime" : ""}`}
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="flex items-center gap-2 text-base font-bold">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />{col.label}
              </span>
              <span className="text-[13px] text-fg-subtle">{cards.length}</span>
            </div>
            {cards.map((t) => {
              const done = t.status === "done";
              const kind = dueKind(t, today);
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOverCol(null); if (dragId && dragId !== t.id) dropAt(dragId, col.status, cards.filter((c) => c.id !== dragId).findIndex((c) => c.id === t.id)); setDragId(null); }}
                  className={`flex cursor-grab flex-col gap-2.5 rounded-2xl bg-surface-2 p-3.5 ${done ? "opacity-45" : ""} ${dragId === t.id ? "opacity-30" : ""}`}
                >
                  <div className="flex justify-between gap-2">
                    <button onClick={() => onSelect(t.id)} className={`text-left text-[15px] font-semibold ${done ? "line-through" : ""}`}>{t.title}</button>
                    <span className="h-fit rounded-full px-2 py-[3px] text-[11px] font-bold" style={{ background: PRI_COLORS[t.priority].bg, color: PRI_COLORS[t.priority].fg }}>{PRI_LABEL[t.priority]}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-fg-subtle">
                    <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-sm" style={{ background: projectColor(t.project_id) }} />{projectName(t.project_id)}</span>
                    <span className={kind === "over" ? "text-danger-ink" : kind === "today" ? "text-lime-ink" : ""}>{dueLabel(t.due_date, today)}</span>
                  </div>
                  <div className="flex justify-end gap-2 text-xs text-fg-subtle">
                    <button aria-label="이전 열로" disabled={col.status === "todo"} onClick={() => shift(t, -1)} className="rounded-full bg-surface-3 px-3 py-1.5 disabled:opacity-30">◀</button>
                    <button aria-label="다음 열로" disabled={col.status === "done"} onClick={() => shift(t, 1)} className="rounded-full bg-surface-3 px-3 py-1.5 disabled:opacity-30">▶</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
