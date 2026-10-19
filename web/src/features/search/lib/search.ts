// 통합 검색(SRCH-1) 순수 로직: 질의 정규화, 금액 질의 판정, 탭별 건수, 최근 검색어.

export type SearchTab = "all" | "events" | "todos" | "txs";

export const MAX_QUERY_LENGTH = 50;
export const MIN_QUERY_LENGTH = 1;

/** 앞뒤 공백 제거, 연속 공백 1칸, 최대 길이 제한 */
export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);

export const isSearchable = (q: string) => normalizeQuery(q).length >= MIN_QUERY_LENGTH;

/**
 * 거래 금액 검색: "12000", "12,000", "12,000원" 처럼 숫자(와 쉼표·원)만으로 된 질의는 그 금액과 정확히 같은 거래도 찾는다.
 * 숫자가 아니거나 0 이하면 null (메모 검색만 한다).
 */
export function parseAmountQuery(q: string): number | null {
  const s = normalizeQuery(q).replace(/[,\s]/g, "").replace(/원$/, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type Counts = { events: number; todos: number; txs: number };
export const totalCount = (c: Counts) => c.events + c.todos + c.txs;

/** 탭에 보여줄 그룹들. 전체 탭은 세 그룹 모두. */
export function visibleGroups(tab: SearchTab): ("events" | "todos" | "txs")[] {
  return tab === "all" ? ["events", "todos", "txs"] : [tab];
}

// ── 최근 검색어 (localStorage 에 저장하는 배열을 다룬다) ──

export const MAX_RECENT = 8;

/** 새 검색어를 맨 앞에 넣고(중복 제거, 대소문자 무시) 최대 개수로 자른다. 빈 검색어는 무시. */
export function addRecent(list: string[], q: string): string[] {
  const n = normalizeQuery(q);
  if (!n) return list;
  return [n, ...list.filter((x) => x.toLowerCase() !== n.toLowerCase())].slice(0, MAX_RECENT);
}
export const removeRecent = (list: string[], q: string): string[] => list.filter((x) => x !== q);

/** 저장된 JSON 을 안전하게 읽는다. 깨졌거나 모양이 틀리면 빈 배열. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}
