import { resolveNamed } from "../lib/resolve.ts";
import { must, PAGE_SIZE, type Ctx } from "./context.ts";

export async function listTodos(ctx: Ctx, a: Record<string, unknown>) {
  let projectId: string | undefined;
  if (a.project) {
    const projects = must(await ctx.db.select("todo_projects", "id,name").eq("archived", false), "프로젝트") as { id: string; name: string }[];
    projectId = resolveNamed("프로젝트", String(a.project), projects).id;
  }
  let q = ctx.db
    .select("todos", "id,title,notes,due_date,priority,status,project_id,completed_at,recurrence_rule")
    .is("deleted_at", null);
  const status = (a.status as string | undefined) ?? "open";
  if (status === "done") q = q.eq("status", "done");
  else if (status === "todo" || status === "doing") q = q.eq("status", status);
  else if (status !== "all") q = q.in("status", ["todo", "doing"]);
  if (a.due_before) q = q.lte("due_date", a.due_before);
  if (projectId) q = q.eq("project_id", projectId);
  const rows = must(
    await q.order("due_date", { ascending: true, nullsFirst: false }).order("position", { ascending: true }).limit(PAGE_SIZE + 1),
    "할일",
  ) as Record<string, unknown>[];
  return { todos: rows.slice(0, PAGE_SIZE), truncated: rows.length > PAGE_SIZE };
}
