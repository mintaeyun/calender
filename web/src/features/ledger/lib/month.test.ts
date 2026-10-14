import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, daysLeftInMonth, firstWeekday } from "./month";

describe("month utils", () => {
  it("addMonths: 연도 경계", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-10", -5)).toBe("2026-05");
  });
  it("일수·요일", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(firstWeekday("2026-10")).toBe(4); // 2026-10-01은 목요일
  });
  it("남은 일수(오늘 포함)", () => {
    expect(daysLeftInMonth("2026-10", "2026-10-14")).toBe(18);
    expect(daysLeftInMonth("2026-10", "2026-09-30")).toBe(31);
    expect(daysLeftInMonth("2026-10", "2026-11-01")).toBe(0);
  });
});
