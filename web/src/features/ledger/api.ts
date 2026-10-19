// 가계부 supabase 호출. RLS가 보호하지만 insert에는 user_id를 직접 넣어야 한다(default 없음).
// 금액은 정수 원, 부호는 type이 결정. 거래 삭제는 하드 삭제(호출 전 확인 모달 필수).
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { TxType } from "./lib/money";
import { validateTransfer } from "./lib/money";
import { payDateIn } from "./lib/recurring";
import { summarize, type Summary } from "./lib/summary";
import { removeReceiptFilesOfTransaction } from "./receipts";

export type Transaction = Omit<Tables<"transactions">, "type" | "source"> & { type: TxType; source: "web" | "mcp" };
export type Account = Tables<"accounts">;
export type AccountBalance = { account_id: string; name: string; type: "cash" | "bank" | "card"; archived: boolean; initial_balance: number; balance: number };
export type Category = Omit<Tables<"categories">, "kind"> & { kind: "income" | "expense" };
export type Budget = Tables<"budgets">;
export type Recurring = Omit<Tables<"recurring_payments">, "cycle"> & { cycle: "monthly" | "yearly" };
export type BudgetUsage = { category_id: string | null; budget: number; spent: number; ratio: number };

async function uid(): Promise<string> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session) throw new Error("로그인이 필요해요");
  return data.session.user.id;
}
const must = <T>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
};

/** 'YYYY-MM' 의 첫날·말일 */
export const monthRange = (month: string): { from: string; to: string } => ({
  from: `${month}-01`,
  to: payDateIn(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 31),
});

// ── 거래 ────────────────────────────────────────────────

export type TxFilter = {
  from?: string; to?: string;            // 거래일 범위(포함)
  type?: TxType;
  categoryId?: string;
  accountId?: string;                    // 출금 또는 입금(이체) 계좌
  minAmount?: number; maxAmount?: number;
};

const PAGE = 1000; // PostgREST 기본 최대 행 수

/** 필터에 맞는 거래 전체(날짜 내림차순). 1000건 단위로 모두 가져온다. */
export async function listTransactions(f: TxFilter = {}): Promise<Transaction[]> {
  const supabase = createClient();
  const out: Transaction[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (f.from) q = q.gte("date", f.from);
    if (f.to) q = q.lte("date", f.to);
    if (f.type) q = q.eq("type", f.type);
    if (f.categoryId) q = q.eq("category_id", f.categoryId);
    if (f.accountId) q = q.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`);
    if (f.minAmount != null) q = q.gte("amount", f.minAmount);
    if (f.maxAmount != null) q = q.lte("amount", f.maxAmount);
    const rows = must(await q) as unknown as Transaction[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type { Summary } from "./lib/summary";
export { summarize } from "./lib/summary";
export async function getSummary(f: TxFilter = {}): Promise<Summary> {
  return summarize(await listTransactions(f));
}

export type NewTransaction = {
  date: string; amount: number; type: TxType; category_id?: string | null; account_id: string;
  to_account_id?: string | null; memo?: string | null;
};

function checkTx(t: NewTransaction) {
  if (!Number.isSafeInteger(t.amount) || t.amount <= 0) throw new Error("금액은 0보다 큰 정수여야 해요");
  if (t.type === "transfer") {
    const e = validateTransfer(t.account_id, t.to_account_id ?? null);
    if (e) throw new Error(e);
  }
}

export async function createTransaction(t: NewTransaction): Promise<Transaction> {
  checkTx(t);
  const row: TablesInsert<"transactions"> = {
    ...t, user_id: await uid(), source: "web",
    category_id: t.type === "transfer" ? null : t.category_id ?? null,
    to_account_id: t.type === "transfer" ? t.to_account_id : null,
  };
  return must(await createClient().from("transactions").insert(row).select().single()) as unknown as Transaction;
}

export async function updateTransaction(id: string, t: NewTransaction): Promise<void> {
  checkTx(t);
  const patch: TablesUpdate<"transactions"> = {
    ...t, category_id: t.type === "transfer" ? null : t.category_id ?? null,
    to_account_id: t.type === "transfer" ? t.to_account_id : null,
  };
  must(await createClient().from("transactions").update(patch).eq("id", id).select("id").single());
}

/** 하드 삭제(영수증 파일 포함). 호출 전에 확인 모달을 거칠 것. */
export async function deleteTransaction(id: string): Promise<void> {
  await removeReceiptFilesOfTransaction(id); // DB 행은 cascade 로 지워지지만 Storage 파일은 직접 지워야 한다
  must(await createClient().from("transactions").delete().eq("id", id).select("id"));
}

/** 최근 사용 카테고리 TOP N (최근 200건 기준, 지출/수입 구분). */
export async function listRecentCategories(kind: "income" | "expense", n = 5): Promise<string[]> {
  const rows = must(await createClient().from("transactions").select("category_id").eq("type", kind).not("category_id", "is", null).order("created_at", { ascending: false }).limit(200));
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.category_id!, (count.get(r.category_id!) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/** 메모 prefix 추천: 최근 거래의 distinct 메모. */
export async function suggestMemos(prefix: string, n = 5): Promise<string[]> {
  const p = prefix.replace(/[%_,()]/g, " ").trim();
  if (!p) return [];
  const rows = must(await createClient().from("transactions").select("memo").ilike("memo", `${p}%`).order("created_at", { ascending: false }).limit(50));
  return [...new Set(rows.map((r) => r.memo!).filter(Boolean))].slice(0, n);
}

export async function searchTransactions(query: string): Promise<Transaction[]> {
  const q = query.replace(/[%,()]/g, " ").trim();
  if (!q) return [];
  return must(await createClient().from("transactions").select("*").ilike("memo", `%${q}%`).order("date", { ascending: false }).limit(50)) as unknown as Transaction[];
}

// ── 카테고리 ────────────────────────────────────────────

export async function listCategories(kind?: "income" | "expense", includeArchived = false): Promise<Category[]> {
  let q = createClient().from("categories").select("*").order("name");
  if (kind) q = q.eq("kind", kind);
  if (!includeArchived) q = q.eq("archived", false);
  return must(await q) as unknown as Category[];
}
export async function createCategory(c: { name: string; kind: "income" | "expense"; color?: string; icon?: string | null }): Promise<Category> {
  return must(await createClient().from("categories").insert({ ...c, user_id: await uid() }).select().single()) as unknown as Category;
}
export async function updateCategory(id: string, patch: { name?: string; color?: string; icon?: string | null }): Promise<void> {
  must(await createClient().from("categories").update(patch).eq("id", id).select("id").single());
}
export async function archiveCategory(id: string, archived = true): Promise<void> {
  must(await createClient().from("categories").update({ archived }).eq("id", id).select("id").single());
}
/** 거래가 있으면 삭제 대신 보관 처리한다. 반환값으로 실제 동작을 알려 안내 문구를 띄운다. */
export async function deleteCategory(id: string): Promise<"deleted" | "archived"> {
  const supabase = createClient();
  const { count, error } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) { await archiveCategory(id); return "archived"; }
  must(await supabase.from("categories").delete().eq("id", id).select("id"));
  return "deleted";
}

// ── 계좌 ────────────────────────────────────────────────

/** 현재잔액은 저장하지 않고 account_balances 뷰에서 계산한다. */
export async function listAccounts(includeArchived = false): Promise<AccountBalance[]> {
  let q = createClient().from("account_balances").select("*").order("name");
  if (!includeArchived) q = q.eq("archived", false);
  return must(await q) as unknown as AccountBalance[];
}
export async function createAccount(a: { name: string; type: "cash" | "bank" | "card"; initial_balance: number }): Promise<Account> {
  return must(await createClient().from("accounts").insert({ ...a, user_id: await uid() }).select().single());
}
export async function updateAccount(id: string, patch: { name?: string; type?: "cash" | "bank" | "card"; initial_balance?: number; archived?: boolean }): Promise<void> {
  must(await createClient().from("accounts").update(patch).eq("id", id).select("id").single());
}
export async function transfer(t: { date: string; amount: number; from: string; to: string; memo?: string }): Promise<Transaction> {
  return createTransaction({ date: t.date, amount: t.amount, type: "transfer", account_id: t.from, to_account_id: t.to, memo: t.memo ?? null });
}

// ── 예산 ────────────────────────────────────────────────

/** month: 'YYYY-MM' */
export async function listBudgets(month: string): Promise<Budget[]> {
  return must(await createClient().from("budgets").select("*").eq("month", `${month}-01`));
}
export async function budgetUsage(month: string): Promise<BudgetUsage[]> {
  return must(await createClient().rpc("budget_usage", { p_month: `${month}-01` })) as unknown as BudgetUsage[];
}
/** 총예산(categoryId=null) 또는 카테고리 예산 설정. 있으면 금액만 수정한다. */
export async function setBudget(month: string, categoryId: string | null, amount: number): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("예산은 0보다 큰 정수여야 해요");
  const supabase = createClient();
  const m = `${month}-01`;
  let q = supabase.from("budgets").select("id").eq("month", m);
  q = categoryId ? q.eq("category_id", categoryId) : q.is("category_id", null);
  const existing = must(await q.limit(1));
  if (existing.length) must(await supabase.from("budgets").update({ amount }).eq("id", existing[0].id).select("id").single());
  else must(await supabase.from("budgets").insert({ user_id: await uid(), month: m, category_id: categoryId, amount }).select("id").single());
}
export async function deleteBudget(id: string): Promise<void> {
  must(await createClient().from("budgets").delete().eq("id", id).select("id"));
}
/** 지난달 예산 불러오기: 이번 달에 없는 항목만 복사한다. 복사한 개수를 반환. */
export async function copyBudgets(fromMonth: string, toMonth: string): Promise<number> {
  const supabase = createClient();
  const [src, dst] = await Promise.all([listBudgets(fromMonth), listBudgets(toMonth)]);
  const have = new Set(dst.map((b) => b.category_id ?? "total"));
  const rows = src.filter((b) => !have.has(b.category_id ?? "total")).map((b) => ({ user_id: b.user_id, month: `${toMonth}-01`, category_id: b.category_id, amount: b.amount }));
  if (rows.length) must(await supabase.from("budgets").insert(rows).select("id"));
  return rows.length;
}

// ── 고정지출 ────────────────────────────────────────────

export async function listRecurring(): Promise<Recurring[]> {
  return must(await createClient().from("recurring_payments").select("*").order("next_run_date")) as unknown as Recurring[];
}
export type NewRecurring = { name: string; amount: number; cycle: "monthly" | "yearly"; pay_day: number; pay_month?: number | null; category_id?: string | null; account_id: string; next_run_date: string };
export async function createRecurring(r: NewRecurring): Promise<void> {
  must(await createClient().from("recurring_payments").insert({ ...r, user_id: await uid() }).select("id").single());
}
export async function updateRecurring(id: string, patch: Partial<NewRecurring> & { active?: boolean }): Promise<void> {
  must(await createClient().from("recurring_payments").update(patch).eq("id", id).select("id").single());
}
export async function deleteRecurring(id: string): Promise<void> {
  must(await createClient().from("recurring_payments").delete().eq("id", id).select("id"));
}

// ── 대시보드용 (08) ─────────────────────────────────────

export type MonthOverview = { income: number; expense: number; net: number; recent: Transaction[]; topCategories: { category_id: string | null; amount: number }[] };
/** 이번 달 수입/지출, 최근 거래 5건, 지출 TOP3 카테고리. */
export async function getMonthOverview(month: string): Promise<MonthOverview> {
  const { from, to } = monthRange(month);
  const rows = await listTransactions({ from, to });
  const s = summarize(rows);
  const byCat = new Map<string | null, number>();
  for (const t of rows) if (t.type === "expense") byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
  const topCategories = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category_id, amount]) => ({ category_id, amount }));
  return { income: s.income, expense: s.expense, net: s.net, recent: rows.slice(0, 5), topCategories };
}
