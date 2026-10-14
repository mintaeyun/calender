import { describe, expect, it } from "vitest";
import { budgetState, categoryDiffs, categoryShares, dailyAllowance, monthlyTrend, monthOverMonth } from "./stats";

describe("categoryShares", () => {
  it("비율 합계가 1이고 금액 내림차순", () => {
    const r = categoryShares([{ name: "식비", amount: 482000 }, { name: "주거", amount: 650000 }, { name: "기타", amount: 71900 }]);
    expect(r.map((x) => x.name)).toEqual(["주거", "식비", "기타"]);
    expect(r.reduce((s, x) => s + x.ratio, 0)).toBeCloseTo(1, 10);
  });
  it("합계 0이면 0 나누기 없이 비율 0", () => {
    expect(categoryShares([{ name: "식비", amount: 0 }])[0].ratio).toBe(0);
    expect(categoryShares([])).toEqual([]);
  });
});

describe("monthOverMonth", () => {
  it("증감과 증감률", () => {
    expect(monthOverMonth(110, 100)).toEqual({ diff: 10, pct: 10 });
    expect(monthOverMonth(50, 100)).toEqual({ diff: -50, pct: -50 });
  });
  it("전월 0원이면 pct null", () => {
    expect(monthOverMonth(100, 0)).toEqual({ diff: 100, pct: null });
    expect(monthOverMonth(0, 0)).toEqual({ diff: 0, pct: null });
  });
});

describe("categoryDiffs", () => {
  it("한쪽에만 있는 카테고리도 포함", () => {
    const r = categoryDiffs([{ name: "식비", amount: 100 }], [{ name: "식비", amount: 50 }, { name: "쇼핑", amount: 30 }]);
    expect(r.find((x) => x.name === "쇼핑")).toMatchObject({ current: 0, previous: 30, diff: -30, pct: -100 });
    expect(r.find((x) => x.name === "식비")).toMatchObject({ diff: 50, pct: 100 });
  });
});

describe("monthlyTrend", () => {
  it("최근 6개월을 오래된 순으로, 빈 달은 0, 연도 경계 처리", () => {
    const r = monthlyTrend([{ month: "2026-01", amount: 5 }, { month: "2025-12", amount: 3 }], "2026-02", 4);
    expect(r).toEqual([
      { month: "2025-11", amount: 0 },
      { month: "2025-12", amount: 3 },
      { month: "2026-01", amount: 5 },
      { month: "2026-02", amount: 0 },
    ]);
  });
});

describe("budgetState / dailyAllowance", () => {
  it("80% 이상 warn, 100% 이상 over", () => {
    expect(budgetState(79, 100)).toBe("ok");
    expect(budgetState(80, 100)).toBe("warn");
    expect(budgetState(100, 100)).toBe("over");
    expect(budgetState(10, 0)).toBe("ok");
  });
  it("하루 사용 가능액", () => {
    expect(dailyAllowance(400, 1000, 6)).toBe(100);
    expect(dailyAllowance(1000, 1000, 6)).toBe(0);
    expect(dailyAllowance(0, 1000, 0)).toBe(0);
  });
});
