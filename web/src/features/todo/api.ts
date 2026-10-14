// 할일 supabase 호출. RLS가 보호하지만 insert에는 user_id를 직접 넣어야 한다(default 없음).
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { todayIn, type Priority, type TodoStatus } from "./lib/due";
import { nextOccurrence } from "./lib/nextOccurrence";
import { positionBetween, positionForAppend } from "./lib/position";

export type Project = Tables<"todo_projects">;
export type Tag = Tables<"tags">;
export type TodoItem = Tables<"todo_items">;

/** 목록용 할일: 체크리스트 진행도와 태그 id를 함께 가져온다. */
export type Todo = Omit<Tables<"todos">, "priority" | "status"> & {
  priority: Priority;
  status: TodoStatus;
  todo_items: Pick<TodoItem, "id" | "done">[];
  todo_tags: { tag_id: string }[];
};
export type TodoDetail = Omit<Todo, "todo_items"> & { todo_items: TodoItem[] };

const LIST_SELECT = "*, todo_items(id, done), todo_tags(tag_id)";
const DETAIL_SELECT = "*, todo_items(*), todo_tags(tag_id)";

async function uid(): Promise<string> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session) throw new Error("로그인이 필요해요");
  return data.session.user.id;
}

const must = <T>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
};

// ── 할일 ────────────────────────────────────────────────

/** 삭제되지 않은 전체 할일. 필터·정렬·개수는 클라이언트에서 같은 데이터로 계산한다(개인용 규모). */
export async function listTodos(): Promise<Todo[]> {
  const r = await createClient().from("todos").select(LIST_SELECT).is("deleted_at", null);
  return must(r) as unknown as Todo[];
}

export async function getTodo(id: string): Promise<TodoDetail> {
  const r = await createClient().from("todos").select(DETAIL_SELECT).eq("id", id).single();
  const t = must(r) as unknown as TodoDetail;
  t.todo_items.sort((a, b) => a.position - b.position);
  return t;
}

export type NewTodo = {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  project_id?: string | null;
  notes?: string | null;
  recurrence_rule?: string | null;
  tag_ids?: string[];
};

export async function createTodo(input: NewTodo, existingPositions: number[] = []): Promise<Tables<"todos">> {
  const supabase = createClient();
  const user_id = await uid();
  const { tag_ids, ...rest } = input;
  const row: TablesInsert<"todos"> = { ...rest, user_id, position: positionForAppend(existingPositions) };
  const todo = must(await supabase.from("todos").insert(row).select().single());
  if (tag_ids?.length) await setTodoTags(todo.id, tag_ids);
  return todo;
}

export async function updateTodo(id: string, patch: TablesUpdate<"todos">): Promise<void> {
  must(await createClient().from("todos").update(patch).eq("id", id).select("id").single());
}

/**
 * 완료/취소. 완료는 DB 함수 `complete_todo`로 원자 처리한다(반복이면 다음 주기를 함께 생성, 재호출해도 중복 없음).
 * 취소(done → todo)는 이미 생성된 다음 주기 행을 지우지 않는다. 다음 주기가 있었는지는 호출 측이 안내한다.
 */
export async function toggleDone(todo: Pick<Todo, "id" | "status" | "due_date" | "recurrence_rule">, tz?: string): Promise<{ nextId: string | null }> {
  if (todo.status === "done") {
    await updateTodo(todo.id, { status: "todo", completed_at: null });
    return { nextId: null };
  }
  return completeTodo(todo, tz);
}

export async function completeTodo(todo: Pick<Todo, "id" | "due_date" | "recurrence_rule">, tz?: string): Promise<{ nextId: string | null }> {
  const today = todayIn(tz);
  const next = todo.recurrence_rule ? nextOccurrence(todo.recurrence_rule, todo.due_date ?? today, today) : null;
  const r = await createClient().rpc("complete_todo", {
    p_id: todo.id,
    ...(next ? { p_next_due: next.dueDate, p_next_rule: next.rule } : {}),
  });
  return { nextId: must(r) ?? null };
}

/** 칸반 이동: 열(status)과 열 내 순서(position)를 한 행에서 갱신. 완료 열 이동 시 completed_at 기록. */
export async function moveTodo(id: string, status: TodoStatus, prev: number | null, next: number | null): Promise<void> {
  await updateTodo(id, {
    status,
    position: positionBetween(prev, next),
    completed_at: status === "done" ? new Date().toISOString() : null,
  });
}

export const softDeleteTodo = (id: string) => updateTodo(id, { deleted_at: new Date().toISOString() });
export const restoreTodo = (id: string) => updateTodo(id, { status: "todo", completed_at: null });

/** 영구 삭제(완료 보관함). 호출 전 확인 모달 필수. */
export async function purgeTodo(id: string): Promise<void> {
  must(await createClient().from("todos").delete().eq("id", id).select("id"));
}

/** 완료 보관함: 완료 시각 내림차순. */
export async function listArchive(): Promise<Todo[]> {
  const r = await createClient().from("todos").select(LIST_SELECT).is("deleted_at", null).eq("status", "done").order("completed_at", { ascending: false });
  return must(r) as unknown as Todo[];
}

export async function searchTodos(query: string): Promise<Todo[]> {
  const q = query.replace(/[%,()]/g, " ").trim();
  if (!q) return [];
  const r = await createClient().from("todos").select(LIST_SELECT).is("deleted_at", null).or(`title.ilike.%${q}%,notes.ilike.%${q}%`).limit(50);
  return must(r) as unknown as Todo[];
}

// ── 체크리스트 ──────────────────────────────────────────

export async function addItem(todoId: string, text: string, existingPositions: number[] = []): Promise<void> {
  must(await createClient().from("todo_items").insert({ user_id: await uid(), todo_id: todoId, text, position: positionForAppend(existingPositions) }).select("id").single());
}
export async function updateItem(id: string, patch: { text?: string; done?: boolean }): Promise<void> {
  must(await createClient().from("todo_items").update(patch).eq("id", id).select("id").single());
}
export async function deleteItem(id: string): Promise<void> {
  must(await createClient().from("todo_items").delete().eq("id", id).select("id"));
}

// ── 프로젝트 · 태그 ─────────────────────────────────────

export async function listProjects(includeArchived = false): Promise<Project[]> {
  let q = createClient().from("todo_projects").select("*").order("name");
  if (!includeArchived) q = q.eq("archived", false);
  return must(await q);
}
export async function createProject(name: string, color?: string): Promise<Project> {
  return must(await createClient().from("todo_projects").insert({ user_id: await uid(), name, ...(color ? { color } : {}) }).select().single());
}
export async function updateProject(id: string, patch: { name?: string; color?: string; archived?: boolean }): Promise<void> {
  must(await createClient().from("todo_projects").update(patch).eq("id", id).select("id").single());
}
/** 삭제하면 소속 할일은 FK(on delete set null)에 따라 프로젝트 없음으로 이동한다. */
export async function deleteProject(id: string): Promise<void> {
  must(await createClient().from("todo_projects").delete().eq("id", id).select("id"));
}

export async function listTags(): Promise<Tag[]> {
  return must(await createClient().from("tags").select("*").order("name"));
}
export async function createTag(name: string, color?: string): Promise<Tag> {
  return must(await createClient().from("tags").insert({ user_id: await uid(), name, ...(color ? { color } : {}) }).select().single());
}
export async function updateTag(id: string, patch: { name?: string; color?: string }): Promise<void> {
  must(await createClient().from("tags").update(patch).eq("id", id).select("id").single());
}
export async function deleteTag(id: string): Promise<void> {
  must(await createClient().from("tags").delete().eq("id", id).select("id"));
}

/** 할일의 태그를 통째로 교체한다. */
export async function setTodoTags(todoId: string, tagIds: string[]): Promise<void> {
  const supabase = createClient();
  const user_id = await uid();
  must(await supabase.from("todo_tags").delete().eq("todo_id", todoId).select("tag_id"));
  if (tagIds.length) must(await supabase.from("todo_tags").insert(tagIds.map((tag_id) => ({ user_id, todo_id: todoId, tag_id }))).select("tag_id"));
}
