import { describe, expect, it } from "vitest";
import { firstRunDate, monthlyTotal, nextPayDate, payDateIn } from "./recurring";

describe("payDateIn / nextPayDate (SQL next_pay_date와 같은 결과)", () => {
  it("말일 보정", () => {
    expect(payDateIn(2026, 2, 31)).toBe("2026-02-28");
    expect(payDateIn(2028, 2, 30)).toBe("2028-02-29");
    expect(payDateIn(2026, 4, 31)).toBe("2026-04-30");
  });
  it("매월", () => {
    expect(nextPayDate("monthly", 31, null, "2026-01-31")).toBe("2026-02-28");
    expect(nextPayDate("monthly", 31, null, "2026-02-28")).toBe("2026-03-31");
    expect(nextPayDate("monthly", 15, null, "2026-12-20")).toBe("2027-01-15");
    expect(nextPayDate("monthly", 15, null, "2026-10-01")).toBe("2026-10-15");
  });
  it("매년", () => {
    expect(nextPayDate("yearly", 29, 2, "2028-02-29")).toBe("2029-02-28");
    expect(nextPayDate("yearly", 29, 2, "2026-03-01")).toBe("2027-02-28");
  });
});

describe("firstRunDate", () => {
  it("오늘이 결제일이면 오늘", () => {
    expect(firstRunDate("monthly", 14, null, "2026-10-14")).toBe("2026-10-14");
    expect(firstRunDate("monthly", 13, null, "2026-10-14")).toBe("2026-11-13");
  });
});

describe("monthlyTotal", () => {
  it("활성 월 항목만 합산", () => {
    expect(monthlyTotal([
      { cycle: "monthly", amount: 650000, active: true },
      { cycle: "monthly", amount: 17000, active: false },
      { cycle: "yearly", amount: 100000, active: true },
    ])).toBe(650000);
  });
});
