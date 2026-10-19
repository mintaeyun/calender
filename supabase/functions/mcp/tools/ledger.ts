import { resolveNamed, ToolError } from "../lib/resolve.ts";
import { budgetUsage, groupExpense, monthRange, totals, type Budget, type Tx } from "../lib/summary.ts";
import { must, PAGE_SIZE, type Ctx } from "./context.ts";

const MAX_ROWS = 1000;
type Named = { id: string; name: string };
type TxRow = Tx & { id: string; to_account_id: string | null; memo: string | null };

const nameOf = (list: Named[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);

async function lookups(ctx: Ctx) {
  const [categories, accounts] = await Promise.all([
    ctx.db.select("categories", "id,name,archived"),
    ctx.db.select("accounts", "id,name,archived"),
  ]);
  return { categories: must(categories, "카테고리") as Named[], accounts: must(accounts, "계좌") as Named[] };
}

async function fetchTxs(ctx: Ctx, start: string, end: string, filters: { category?: string; account?: string; type?: string }) {
  const { categories, accounts } = await lookups(ctx);
  let q = ctx.db
    .select("transactions", "id,date,amount,type,category_id,account_id,to_account_id,memo")
    .gte("date", start)
    .lte("date", end);
  if (filters.category) q = q.eq("category_id", resolveNamed("카테고리", filters.category, categories).id);
  if (filters.account) {
    const id = resolveNamed("계좌", filters.account, accounts).id;
    q = q.or(`account_id.eq.${id},to_account_id.eq.${id}`);
  }
  if (filters.type) q = q.eq("type", filters.type);
  const rows = must(await q.order("date", { ascending: false }).limit(MAX_ROWS + 1), "거래") as TxRow[];
  if (rows.length > MAX_ROWS) throw new ToolError(`거래가 ${MAX_ROWS}건을 넘습니다.`, "기간을 줄여서 다시 조회해 주세요.");
  return { rows, categories, accounts };
}

export async function listTransactions(ctx: Ctx, a: Record<string, unknown>) {
  const start = a.start as string, end = a.end as string;
  if (end < start) throw new ToolError("end 는 start 이후여야 합니다.");
  const { rows, categories, accounts } = await fetchTxs(ctx, start, end, {
    category: a.category as string | undefined, account: a.account as string | undefined, type: a.type as string | undefined,
  });
  return {
    transactions: rows.slice(0, PAGE_SIZE).map((t) => ({
      id: t.id, date: t.date, type: t.type, amount: t.amount,
      category: nameOf(categories, t.category_id), account: nameOf(accounts, t.account_id),
      to_account: nameOf(accounts, t.to_account_id), memo: t.memo,
    })),
    truncated: rows.length > PAGE_SIZE,
    count: rows.length,
    totals: totals(rows), // 표시된 100건이 아니라 조회된 전체 기준
  };
}

export async function getSummary(ctx: Ctx, a: Record<string, unknown>) {
  const range = monthRange(a.month as string);
  if (!range) throw new ToolError(`month 는 YYYY-MM 형식이어야 합니다: ${a.month}`);
  const by = (a.group_by as "category" | "account" | undefined) ?? "category";
  const { rows, categories, accounts } = await fetchTxs(ctx, range.start, range.end, {});
  const budgets = must(
    await ctx.db.select("budgets", "category_id,amount").eq("month", range.start),
    "예산",
  ) as Budget[];
  const list = by === "category" ? categories : accounts;
  return {
    month: a.month,
    totals: totals(rows),
    expense_by: by,
    expense_groups: groupExpense(rows, by).map((g) => ({ name: nameOf(list, g.id) ?? "(미분류)", amount: g.amount })),
    budgets: budgetUsage(rows, budgets).map((b) => ({
      category: b.category_id ? nameOf(categories, b.category_id) : "총예산",
      budget: b.budget, spent: b.spent, remaining: b.remaining, percent: b.percent,
    })),
  };
}

export async function listAccounts(ctx: Ctx) {
  const rows = must(
    await ctx.db.select("account_balances", "account_id,name,type,archived,initial_balance,balance").eq("archived", false).order("name"),
    "계좌",
  ) as { account_id: string; name: string; type: string; balance: number }[];
  return { accounts: rows.map((r) => ({ id: r.account_id, name: r.name, type: r.type, balance: r.balance })) };
}
