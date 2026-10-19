// 통합 검색: 02/03/04 의 기존 api 를 호출만 한다(직접 DB 접근 없음).
import { searchEvents, type EventWithReminders } from "@/features/calendar/api";
import { listTransactions, searchTransactions, type Transaction } from "@/features/ledger/api";
import { searchTodos, type Todo } from "@/features/todo/api";
import { normalizeQuery, parseAmountQuery } from "./lib/search";

export type SearchResults = { events: EventWithReminders[]; todos: Todo[]; txs: Transaction[] };
export type SearchOutcome = { results: SearchResults; errors: Partial<Record<keyof SearchResults, string>> };

/**
 * 일정·할일·거래를 병렬 검색한다. 한 종류가 실패해도 나머지는 보여주기 위해 종류별 오류를 따로 돌려준다.
 * 숫자 질의("12000")는 거래 메모 검색에 더해 금액이 같은 거래도 찾는다.
 */
export async function searchAll(query: string): Promise<SearchOutcome> {
  const q = normalizeQuery(query);
  const results: SearchResults = { events: [], todos: [], txs: [] };
  const errors: SearchOutcome["errors"] = {};
  if (!q) return { results, errors };

  const amount = parseAmountQuery(q);
  const txs = async () => {
    const [byMemo, byAmount] = await Promise.all([searchTransactions(q), amount ? listTransactions({ minAmount: amount, maxAmount: amount }) : Promise.resolve([])]);
    const seen = new Set<string>();
    return [...byAmount, ...byMemo].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 50);
  };

  const [e, t, x] = await Promise.allSettled([searchEvents({ query: q, limit: 30 }), searchTodos(q), txs()]);
  if (e.status === "fulfilled") results.events = e.value; else errors.events = (e.reason as Error).message;
  if (t.status === "fulfilled") results.todos = t.value; else errors.todos = (t.reason as Error).message;
  if (x.status === "fulfilled") results.txs = x.value; else errors.txs = (x.reason as Error).message;
  return { results, errors };
}
