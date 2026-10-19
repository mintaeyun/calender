"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { Todo } from "./api";
import type { TodoStatus } from "./lib/due";
import { useTimezone } from "@/lib/profile";

// 쿼리 키: [영역, 대상, 파라미터]
export const todoKeys = {
  all: ["todos"] as const,
  list: ["todos", "list"] as const,
  detail: (id: string) => ["todos", "detail", id] as const,
  archive: ["todos", "archive"] as const,
  projects: ["todos", "projects"] as const,
  tags: ["todos", "tags"] as const,
};

export const useTodos = () => useQuery({ queryKey: todoKeys.list, queryFn: api.listTodos });
export const useTodo = (id: string | null) =>
  useQuery({ queryKey: todoKeys.detail(id ?? ""), queryFn: () => api.getTodo(id!), enabled: !!id });
export const useArchive = () => useQuery({ queryKey: todoKeys.archive, queryFn: api.listArchive });
export const useProjects = () => useQuery({ queryKey: todoKeys.projects, queryFn: () => api.listProjects() });
export const useTags = () => useQuery({ queryKey: todoKeys.tags, queryFn: api.listTags });

/** 할일 도메인 mutation 공통: 성공/실패 모두 'todos' 아래 캐시를 다시 불러온다. */
function useTodoMutation<V, R = void>(fn: (v: V) => Promise<R>, optimistic?: (old: Todo[], v: V) => Todo[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (v: V) => {
      if (!optimistic) return;
      await qc.cancelQueries({ queryKey: todoKeys.list });
      const prev = qc.getQueryData<Todo[]>(todoKeys.list);
      if (prev) qc.setQueryData(todoKeys.list, optimistic(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(todoKeys.list, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

/** 체크 토글: 낙관적 업데이트. 반복 할일의 다음 주기 행은 서버 재조회로 나타난다. */
export function useToggleDone() {
  const tz = useTimezone();
  return useTodoMutation(
    (t: Pick<Todo, "id" | "status" | "due_date" | "recurrence_rule">) => api.toggleDone(t, tz),
    (old, t) => old.map((x) => (x.id === t.id ? { ...x, status: t.status === "done" ? "todo" : "done" } : x)),
  );
}

export const useCreateTodo = () => useTodoMutation(({ input, positions }: { input: api.NewTodo; positions?: number[] }) => api.createTodo(input, positions));
export const useUpdateTodo = () => useTodoMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateTodo>[1] }) => api.updateTodo(id, patch));
export const useDeleteTodo = () => useTodoMutation((id: string) => api.softDeleteTodo(id), (old, id) => old.filter((x) => x.id !== id));
export const useRestoreTodo = () => useTodoMutation((id: string) => api.restoreTodo(id));
export const usePurgeTodo = () => useTodoMutation((id: string) => api.purgeTodo(id));

/** 칸반 이동: 낙관적으로 열·순서를 바꾼다. */
export function useMoveTodo() {
  return useTodoMutation(
    (v: { id: string; status: TodoStatus; prev: number | null; next: number | null }) => api.moveTodo(v.id, v.status, v.prev, v.next),
    (old, v) => old.map((x) => (x.id === v.id ? { ...x, status: v.status } : x)),
  );
}

export const useAddItem = () => useTodoMutation(({ todoId, text, positions }: { todoId: string; text: string; positions?: number[] }) => api.addItem(todoId, text, positions));
export const useUpdateItem = () => useTodoMutation(({ id, patch }: { id: string; patch: { text?: string; done?: boolean } }) => api.updateItem(id, patch));
export const useDeleteItem = () => useTodoMutation((id: string) => api.deleteItem(id));
export const useSetTodoTags = () => useTodoMutation(({ todoId, tagIds }: { todoId: string; tagIds: string[] }) => api.setTodoTags(todoId, tagIds));

export const useCreateProject = () => useTodoMutation(({ name, color }: { name: string; color?: string }) => api.createProject(name, color));
export const useUpdateProject = () => useTodoMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateProject>[1] }) => api.updateProject(id, patch));
export const useDeleteProject = () => useTodoMutation((id: string) => api.deleteProject(id));
export const useCreateTag = () => useTodoMutation(({ name, color }: { name: string; color?: string }) => api.createTag(name, color));
export const useUpdateTag = () => useTodoMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateTag>[1] }) => api.updateTag(id, patch));
export const useDeleteTag = () => useTodoMutation((id: string) => api.deleteTag(id));

/** 일정으로 전환(TODO-8). 성공하면 할일과 캘린더(['events']) 캐시를 모두 새로 불러온다. */
export function useConvertTodoToEvent() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: (todo: Pick<Todo, "id" | "due_date">) => api.convertTodoToEvent(todo, tz),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: todoKeys.all });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
