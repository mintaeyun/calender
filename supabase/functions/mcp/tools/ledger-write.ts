// 가계부 쓰기 도구. 04 규칙: 금액은 양의 정수 원, 부호는 type, 이체는 to_account 필수·카테고리 없음, 삭제는 즉시(하드).
// 출처는 source='mcp' 로 기록해 화면에 "Claude에서 기록"으로 표시된다.
import { resolveNamed, ToolError, type Named } from "../lib/resolve.ts";
import { must, one, type Ctx } from "./context.ts";

const COLS = "id,date,amount,type,category_id,account_id,to_account_id,memo,source";
type Tx = { id: string; date: string; amount: number; type: "income" | "expense" | "transfer"; category_id: string | null; account_id: string; to_account_id: string | null; memo: string | null; source: string };
type Cat = Named & { kind: "income" | "expense" };

async function lists(ctx: Ctx) {
  const [cats, accts] = await Promise.all([
    ctx.db.select("categories", "id,name,kind").eq("archived", false),
    ctx.db.select("accounts", "id,name").eq("archived", false),
  ]);
  return { cats: must(cats, "카테고리") as Cat[], accts: must(accts, "계좌") as Named[] };
}

function checkAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ToolError("금액은 0보다 큰 정수(원)여야 합니다.");
}

/** 계좌 생략 시 기본값: 가장 최근 거래의 계좌(웹의 '마지막 사용 계좌'와 같은 취지) → 계좌가 하나뿐이면 그것 → 아니면 후보 오류 */
async function defaultAccount(ctx: Ctx, accts: Named[]): Promise<Named> {
  const last = must(await ctx.db.select("transactions", "account_id").order("created_at", { ascending: false }).limit(1), "거래") as { account_id: string }[];
  const hit = accts.find((a) => a.id === last[0]?.account_id);
  if (hit) return hit;
  if (accts.length === 1) return accts[0];
  throw new ToolError("계좌를 지정해 주세요.", `후보: ${accts.map((a) => a.name).join(", ") || "(등록된 계좌 없음)"}`);
}

async function present(ctx: Ctx, t: Tx) {
  const all = must(await ctx.db.select("accounts", "id,name"), "계좌") as Named[]; // 보관된 계좌 이름도 표시
  const allCats = must(await ctx.db.select("categories", "id,name"), "카테고리") as Named[];
  const nm = (l: Named[], id: string | null) => (id ? (l.find((x) => x.id === id)?.name ?? null) : null);
  return {
    id: t.id, date: t.date, type: t.type, amount: t.amount, category: nm(allCats, t.category_id),
    account: nm(all, t.account_id), to_account: nm(all, t.to_account_id), memo: t.memo, source: t.source,
  };
}

export async function addTransaction(ctx: Ctx, a: Record<string, unknown>) {
  const type = a.type as Tx["type"];
  const amount = a.amount as number;
  checkAmount(amount);
  const { cats, accts } = await lists(ctx);

  let categoryId: string | null = null;
  if (type === "transfer") {
    if (a.category) throw new ToolError("이체에는 카테고리를 지정할 수 없습니다.");
    if (!a.to_account) throw new ToolError("이체는 to_account(받는 계좌)가 필요합니다.");
  } else {
    if (a.to_account) throw new ToolError("to_account 는 이체(type=transfer)에서만 쓸 수 있습니다.");
    // 카테고리는 같은 종류(수입/지출) 안에서만 찾는다.
    if (a.category) categoryId = resolveNamed("카테고리", String(a.category), cats.filter((c) => c.kind === type)).id;
  }
  const account = a.account ? resolveNamed("계좌", String(a.account), accts) : await defaultAccount(ctx, accts);
  const toId = type === "transfer" ? resolveNamed("계좌", String(a.to_account), accts).id : null;
  if (toId && toId === account.id) throw new ToolError("보내는 계좌와 받는 계좌가 같을 수 없습니다.");

  const { data, error } = await ctx.db
    .insert("transactions", { date: a.date, amount, type, category_id: categoryId, account_id: account.id, to_account_id: toId, memo: a.memo ?? null, source: "mcp" })
    .select(COLS).single();
  if (error) {
    console.error("add_transaction 실패", error);
    throw new ToolError("거래를 기록하지 못했습니다.");
  }
  return { created: await present(ctx, data as Tx) };
}

async function load(ctx: Ctx, id: string): Promise<Tx> {
  return one(must(await ctx.db.select("transactions", COLS).eq("id", id).limit(1), "거래") as Tx[], "거래");
}

export async function updateTransaction(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const type = (a.type as Tx["type"] | undefined) ?? cur.type;
  const amount = (a.amount as number | undefined) ?? cur.amount;
  checkAmount(amount);
  const { cats, accts } = await lists(ctx);

  const account = a.account ? resolveNamed("계좌", String(a.account), accts).id : cur.account_id;
  let categoryId = cur.category_id;
  let toId = cur.to_account_id;
  if (type === "transfer") {
    if (a.category) throw new ToolError("이체에는 카테고리를 지정할 수 없습니다.");
    categoryId = null;
    if (a.to_account) toId = resolveNamed("계좌", String(a.to_account), accts).id;
    if (!toId) throw new ToolError("이체는 to_account(받는 계좌)가 필요합니다.");
    if (toId === account) throw new ToolError("보내는 계좌와 받는 계좌가 같을 수 없습니다.");
  } else {
    if (a.to_account) throw new ToolError("to_account 는 이체(type=transfer)에서만 쓸 수 있습니다.");
    toId = null;
    if (a.category) categoryId = resolveNamed("카테고리", String(a.category), cats.filter((c) => c.kind === type)).id;
    else if (type !== cur.type) categoryId = null; // 수입↔지출 전환 시 기존 카테고리는 종류가 맞지 않으므로 비운다
  }

  const patch: Record<string, unknown> = { type, amount, account_id: account, category_id: categoryId, to_account_id: toId };
  if (a.date !== undefined) patch.date = a.date;
  if (a.memo !== undefined) patch.memo = a.memo;
  const { data, error } = await ctx.db.update("transactions", patch).eq("id", cur.id).select(COLS);
  if (error) {
    console.error("update_transaction 실패", error);
    throw new ToolError("거래를 수정하지 못했습니다.");
  }
  return { updated: await present(ctx, one(data as Tx[], "거래")) };
}

export async function deleteTransaction(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const { data, error } = await ctx.db.remove("transactions").eq("id", cur.id).select("id");
  if (error) {
    console.error("delete_transaction 실패", error);
    throw new ToolError("거래를 삭제하지 못했습니다.");
  }
  one(data, "거래");
  return { deleted: true, ...(await present(ctx, cur)), note: "거래는 즉시 삭제되며 복구할 수 없습니다." };
}
