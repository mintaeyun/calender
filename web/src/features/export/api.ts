// 내보내기용 데이터 조회와 거래 가져오기 저장. 기존 02/03/04 api 를 호출하고, 파일은 서버에 저장하지 않는다.
import { listCalendars, listEvents } from "@/features/calendar/api";
import { listAccounts, listCategories, listTransactions } from "@/features/ledger/api";
import { listProjects, listTags, listTodos } from "@/features/todo/api";
import { createClient } from "@/lib/supabase/client";
import { endOfDayUtc, startOfDayUtc } from "@/lib/time";
import { dupKey, MAX_IMPORT_ROWS, type ImportTx } from "./lib/importTx";
import { eventsTable, todosTable, transactionsTable, type Table } from "./lib/rows";

export type ExportKind = "events" | "todos" | "transactions";
export const KIND_LABEL: Record<ExportKind, string> = { events: "일정", todos: "할일", transactions: "거래" };

/** 내보낼 표를 만든다. 일정·거래는 기간(from~to, 포함), 할일은 전체. 반복 일정은 원본 1행 + RRULE 로 내보낸다. */
export async function buildExport(kind: ExportKind, range: { from: string; to: string }, tz: string): Promise<Table> {
  if (kind === "events") {
    const [events, cals] = await Promise.all([listEvents({ start: startOfDayUtc(range.from, tz), end: endOfDayUtc(range.to, tz) }), listCalendars()]);
    // 예외 인스턴스(반복의 일부 수정본)도 별도 행으로 나간다.
    return eventsTable(events, (id) => cals.find((c) => c.id === id)?.name ?? "", tz);
  }
  if (kind === "todos") {
    const [todos, projects, tags] = await Promise.all([listTodos(), listProjects(true), listTags()]);
    return todosTable(todos, (id) => projects.find((p) => p.id === id)?.name ?? "", (id) => tags.find((g) => g.id === id)?.name ?? "", tz);
  }
  const [txs, cats, accounts] = await Promise.all([listTransactions({ from: range.from, to: range.to }), listCategories(undefined, true), listAccounts(true)]);
  return transactionsTable(txs, (id) => cats.find((c) => c.id === id)?.name ?? "", (id) => accounts.find((a) => a.account_id === id)?.name ?? "");
}

/** 가져오기 전 중복 검사용: 기간 안의 기존 거래 키 집합 */
export async function existingTransactionKeys(span: { from: string; to: string }): Promise<Set<string>> {
  const txs = await listTransactions({ from: span.from, to: span.to });
  return new Set(txs.map(dupKey));
}

/** 가져오기에 필요한 이름 매칭 정보(보관된 카테고리·계좌는 제외) */
export async function loadLookups() {
  const [categories, accounts] = await Promise.all([listCategories(undefined, false), listAccounts(false)]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    accounts: accounts.map((a) => ({ id: a.account_id, name: a.name })),
  };
}

/**
 * 거래를 한 번의 INSERT 로 저장한다. 한 문장이라 PostgreSQL 에서 전부 성공하거나 전부 취소(롤백)된다 —
 * 나눠서 보내지 않는 이유다. 그래서 한 번에 MAX_IMPORT_ROWS(1000)행까지만 받는다.
 */
export async function importTransactions(rows: ImportTx[]): Promise<number> {
  if (rows.length === 0) throw new Error("가져올 거래가 없어요");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`한 번에 ${MAX_IMPORT_ROWS}건까지 가져올 수 있어요`);
  const supabase = createClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) throw new Error("로그인이 필요해요");
  const userId = sess.session.user.id;
  const { data, error } = await supabase
    .from("transactions")
    .insert(rows.map((t) => ({ ...t, user_id: userId, source: "web" })))
    .select("id");
  if (error) throw new Error(`가져오기에 실패해서 아무것도 저장하지 않았어요. ${error.message}`);
  return data.length;
}
