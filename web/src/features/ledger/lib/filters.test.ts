import { describe, expect, it } from "vitest";
import type { Transaction } from "../api";
import { defaultFilter, fromParams, groupByDate, toApiFilter, toParams } from "./filters";

const T = "2026-10-14";
const tx = (o: Partial<Transaction>): Transaction => ({ id: "x", user_id: "u", date: T, amount: 1000, type: "expense", category_id: null, account_id: "a", to_account_id: null, memo: null, recurring_id: null, source: "web", created_at: "", updated_at: "", ...o });

describe("filters ↔ URL", () => {
  it("기본값은 쿼리가 비어 있다", () => {
    expect(toParams(defaultFilter(T), T).toString()).toBe("");
  });
  it("왕복 변환", () => {
    const f = { ...defaultFilter(T), type: "expense" as const, categoryId: "c1", min: "1,000", max: "50000" };
    const p = toParams(f, T);
    expect(fromParams(p, T)).toEqual(f);
  });
  it("API 필터: 금액 범위 파싱, 잘못된 값은 무시", () => {
    const a = toApiFilter({ ...defaultFilter(T), min: "1,000원", max: "abc" });
    expect(a.minAmount).toBe(1000);
    expect(a.maxAmount).toBeUndefined();
    expect(a.from).toBe("2026-10-01");
  });
});

describe("groupByDate", () => {
  it("날짜 내림차순 그룹, 그룹 합계는 이체 제외", () => {
    const g = groupByDate([
      tx({ date: "2026-10-13", amount: 350000, type: "income" }),
      tx({ date: "2026-10-14", amount: 12000 }),
      tx({ date: "2026-10-14", amount: 5500 }),
      tx({ date: "2026-10-14", amount: 100000, type: "transfer", to_account_id: "b" }),
    ]);
    expect(g.map((x) => x.date)).toEqual(["2026-10-14", "2026-10-13"]);
    expect(g[0]).toMatchObject({ expense: 17500, income: 0 });
    expect(g[0].rows).toHaveLength(3);
    expect(g[1].income).toBe(350000);
  });
});
