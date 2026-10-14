import { L, R, PRI, PROJ, type Todo, type TodoStatus } from "./data";

export type StatusMap = Record<number, TodoStatus>;

export function todoView(t: Todo, status: StatusMap) {
  const done = status[t.id] === "done";
  return {
    ...t,
    done,
    mark: done ? "✓" : "",
    deco: done ? "line-through" : "none",
    op: done ? 0.45 : 1,
    ring: t.due === "over" && !done ? R : "#55555c",
    dueColor: done ? "#6c6c73" : t.due === "over" ? R : t.due === "today" ? L : "#8d8d94",
    projColor: PROJ[t.proj],
    priBg: PRI[t.pri][0],
    priFg: PRI[t.pri][1],
    short: t.due === "over" ? "초과" : t.pri,
  };
}

export const TODO_FILTERS = {
  today: (t: Todo) => t.due === "today" || t.due === "over",
  upcoming: (t: Todo) => t.due === "later",
  overdue: (t: Todo, s: StatusMap) => t.due === "over" && s[t.id] !== "done",
  all: (t: Todo, s: StatusMap) => s[t.id] !== "done",
  done: (t: Todo, s: StatusMap) => s[t.id] === "done",
} as const;
export type TodoFilter = keyof typeof TODO_FILTERS;
export const FILTER_LABELS: [TodoFilter, string][] = [["today", "오늘"], ["upcoming", "예정"], ["overdue", "기한초과"], ["all", "전체"], ["done", "완료"]];
