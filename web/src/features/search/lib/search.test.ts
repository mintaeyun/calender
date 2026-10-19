import { describe, expect, it } from "vitest";
import { addRecent, isSearchable, MAX_QUERY_LENGTH, MAX_RECENT, normalizeQuery, parseAmountQuery, parseRecent, removeRecent, totalCount, visibleGroups } from "./search";

describe("normalizeQuery", () => {
  it("공백 정리와 길이 제한", () => {
    expect(normalizeQuery("  치과   검진 ")).toBe("치과 검진");
    expect(normalizeQuery("가".repeat(100))).toHaveLength(MAX_QUERY_LENGTH);
    expect(isSearchable("   ")).toBe(false);
    expect(isSearchable("a")).toBe(true);
  });
});

describe("parseAmountQuery", () => {
  it("숫자·쉼표·원은 금액으로", () => {
    expect(parseAmountQuery("12000")).toBe(12000);
    expect(parseAmountQuery("12,000원")).toBe(12000);
    expect(parseAmountQuery(" 5 500 ")).toBe(5500);
  });
  it("그 외는 금액 검색 아님", () => {
    for (const q of ["치과", "12.5", "-100", "0", "12000원어치", "", "99999999999999999999"]) expect(parseAmountQuery(q)).toBeNull();
  });
});

describe("탭", () => {
  it("보이는 그룹과 합계", () => {
    expect(visibleGroups("all")).toEqual(["events", "todos", "txs"]);
    expect(visibleGroups("todos")).toEqual(["todos"]);
    expect(totalCount({ events: 1, todos: 2, txs: 3 })).toBe(6);
  });
});

describe("최근 검색어", () => {
  it("맨 앞에 추가, 중복(대소문자 무시) 제거, 최대 개수", () => {
    expect(addRecent(["b", "a"], "A")).toEqual(["A", "b"]);
    expect(addRecent([], "  ")).toEqual([]);
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `q${i}`);
    const r = addRecent(many, "new");
    expect(r).toHaveLength(MAX_RECENT);
    expect(r[0]).toBe("new");
    expect(r).not.toContain(`q${MAX_RECENT - 1}`);
  });
  it("삭제", () => expect(removeRecent(["a", "b"], "a")).toEqual(["b"]));
  it("깨진 저장값은 빈 배열", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{oops")).toEqual([]);
    expect(parseRecent("{\"a\":1}")).toEqual([]);
    expect(parseRecent("[\"a\",1,\"b\"]")).toEqual(["a", "b"]);
  });
});
