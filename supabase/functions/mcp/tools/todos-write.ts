import { resolveNamed, ToolError } from "../lib/resolve.ts";
import { nextOccurrence } from "../lib/next-occurrence.ts";
import { dateKey } from "../../_shared/time.ts";
import { must, one, type Ctx } from "./context.ts";

const COLS = "id,title,notes,due_date,priority,status,project_id,completed_at,recurrence_rule";
type Todo = { id: string; title: string; notes: string | null; due_date: string | null; priority: string; status: string; project_id: string | null; completed_at: string | null; recurrence_rule: string | null };

async function projectId(ctx: Ctx, input: string): Promise<string> {
  const projects = must(await ctx.db.select("todo_projects", "id,name").eq("archived", false), "프로젝트") as { id: string; name: string }[];
  return resolveNamed("프로젝트", input, projects).id;
}

async function projectName(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const rows = must(await ctx.db.select("todo_projects", "name").eq("id", id).limit(1), "프로젝트") as { name: string }[];
  return rows[0]?.name ?? null;
}

async function present(ctx: Ctx, t: Todo) {
  const { project_id, ...rest } = t;
  return { ...rest, project: await projectName(ctx, project_id) };
}

async function load(ctx: Ctx, id: string): Promise<Todo> {
  return one(must(await ctx.db.select("todos", COLS).eq("id", id).is("deleted_at", null).limit(1), "할일") as Todo[], "할일");
}

export async function createTodo(ctx: Ctx, a: Record<string, unknown>) {
  const title = String(a.title).trim();
  if (!title) throw new ToolError("제목이 비어 있습니다.");
  const pid = a.project ? await projectId(ctx, String(a.project)) : null;
  // 새 할일은 열 맨 끝(max+1024)에 둔다 (web 03 의 position 규칙)
  const last = must(
    await ctx.db.select("todos", "position").is("deleted_at", null).order("position", { ascending: false }).limit(1), "할일",
  ) as { position: number }[];
  const { data, error } = await ctx.db
    .insert("todos", {
      title, notes: a.notes ?? null, due_date: a.due ?? null, priority: a.priority ?? "medium", project_id: pid,
      status: "todo", position: (last[0]?.position ?? 0) + 1024,
    })
    .select(COLS).single();
  if (error) {
    console.error("create_todo 실패", error);
    throw new ToolError("할일을 만들지 못했습니다.");
  }
  return { created: await present(ctx, data as Todo) };
}

export async function updateTodo(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const patch: Record<string, unknown> = {};
  if (a.title !== undefined) {
    if (!String(a.title).trim()) throw new ToolError("제목이 비어 있습니다.");
    patch.title = String(a.title).trim();
  }
  if (a.due !== undefined) patch.due_date = a.due;
  if (a.priority !== undefined) patch.priority = a.priority;
  if (a.notes !== undefined) patch.notes = a.notes;
  if (a.project !== undefined) patch.project_id = await projectId(ctx, String(a.project));
  if (!Object.keys(patch).length) throw new ToolError("바꿀 필드가 없습니다.", "title, due, priority, project, notes 중 하나 이상을 주세요.");
  const { data, error } = await ctx.db.update("todos", patch).eq("id", cur.id).is("deleted_at", null).select(COLS);
  if (error) {
    console.error("update_todo 실패", error);
    throw new ToolError("할일을 수정하지 못했습니다.");
  }
  return { updated: await present(ctx, one(data as Todo[], "할일")) };
}

export async function completeTodo(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  if (cur.status === "done") return { completed: await present(ctx, cur), note: "이미 완료된 할일입니다." };

  // 반복 할일: 다음 주기 날짜는 여기서 계산하고, 완료 처리+다음 행 생성은 DB 함수가 한 트랜잭션으로 한다.
  let next: { dueDate: string; rule: string } | null = null;
  if (cur.recurrence_rule && cur.due_date) {
    try {
      next = nextOccurrence(cur.recurrence_rule, cur.due_date, dateKey(new Date(), ctx.tz));
    } catch (e) {
      console.error("반복 규칙 해석 실패", e);
    }
  }
  const { data: newId, error } = await ctx.db.rpc("complete_todo", {
    p_id: cur.id, p_next_due: next?.dueDate ?? null, p_next_rule: next?.rule ?? null,
  });
  if (error) {
    console.error("complete_todo 실패", error);
    throw new ToolError("할일을 완료 처리하지 못했습니다.");
  }
  const done = await load(ctx, cur.id);
  const out: Record<string, unknown> = { completed: await present(ctx, done) };
  if (newId) out.next_occurrence = await present(ctx, await load(ctx, newId as string));
  return out;
}

export async function deleteTodo(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const { data, error } = await ctx.db
    .update("todos", { deleted_at: new Date().toISOString() }).eq("id", cur.id).is("deleted_at", null).select("id");
  if (error) {
    console.error("delete_todo 실패", error);
    throw new ToolError("할일을 삭제하지 못했습니다.");
  }
  one(data, "할일");
  return { deleted: true, id: cur.id, title: cur.title, due_date: cur.due_date, note: "휴지통으로 이동했으며 30일 뒤 영구 삭제됩니다." };
}
