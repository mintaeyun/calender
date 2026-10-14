import { describe, expect, it } from "vitest";
import { monthGrid, shiftAnchor, viewDays, viewTitle, weekStartOf, rangeOfDays } from "./range";
import { layoutColumns } from "./layout";
import { paymentDatesInRange } from "./overlays";
import { allDayDates, allDayToRange, reminderFireAt } from "./allday";

describe("range", () => {
  it("주 시작 요일", () => {
    expect(weekStartOf("2026-10-14", "monday")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-14", "sunday")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-11", "monday")).toBe("2026-10-05");
  });
  it("2026년 10월 달력은 5주(월요일 시작: 9/28 ~ 11/1)", () => {
    const g = monthGrid("2026-10-14", "monday");
    expect(g).toHaveLength(35);
    expect(g[0]).toBe("2026-09-28");
    expect(g[34]).toBe("2026-11-01");
  });
  it("6주가 필요한 달", () => {
    expect(monthGrid("2026-08-10", "monday")).toHaveLength(42); // 8/1 토요일, 31일
  });
  it("이동과 제목", () => {
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftAnchor("week", "2026-10-14", -1)).toBe("2026-10-07");
    expect(viewTitle("month", "2026-10-14", [])).toBe("2026년 10월");
    expect(viewTitle("week", "2026-10-14", viewDays("week", "2026-10-14", "monday"))).toBe("10월 12일 – 18일");
  });
  it("범위는 [첫날 00:00, 마지막날 다음 00:00) KST", () => {
    const r = rangeOfDays(["2026-10-12", "2026-10-13"], "Asia/Seoul");
    expect(r.start.toISOString()).toBe("2026-10-11T15:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-13T15:00:00.000Z");
  });
});

describe("layoutColumns", () => {
  it("겹치지 않으면 1열", () => {
    expect(layoutColumns([{ start: 0, end: 1 }, { start: 1, end: 2 }])).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 1 }]);
  });
  it("겹치면 열 분할, 그룹이 끝나면 초기화", () => {
    const r = layoutColumns([{ start: 0, end: 4 }, { start: 1, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }]);
    expect(r[0]).toEqual({ col: 0, cols: 2 });
    expect(r[1]).toEqual({ col: 1, cols: 2 });
    expect(r[2]).toEqual({ col: 1, cols: 2 });
    expect(r[3]).toEqual({ col: 0, cols: 1 });
  });
});

describe("paymentDatesInRange", () => {
  it("매월, 말일 보정", () => {
    expect(paymentDatesInRange({ cycle: "monthly", pay_day: 31, pay_month: null }, "2026-02-01", "2026-04-30"))
      .toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("매년", () => {
    expect(paymentDatesInRange({ cycle: "yearly", pay_day: 15, pay_month: 3 }, "2026-01-01", "2027-12-31"))
      .toEqual(["2026-03-15", "2027-03-15"]);
  });
});

describe("allday", () => {
  it("종일 범위는 마지막 날 다음 00:00 로 저장하고 되읽는다", () => {
    const r = allDayToRange("2026-10-17", "2026-10-18", "Asia/Seoul");
    expect(r.start_at).toBe("2026-10-16T15:00:00.000Z");
    expect(r.end_at).toBe("2026-10-18T15:00:00.000Z");
    expect(allDayDates(r.start_at, r.end_at, "Asia/Seoul")).toEqual({ startDate: "2026-10-17", lastDate: "2026-10-18" });
  });
  it("종일 알림 기준은 당일 09:00", () => {
    const ev = { start_at: "2026-10-16T15:00:00.000Z", all_day: true };
    expect(reminderFireAt(ev, 0, "Asia/Seoul").toISOString()).toBe("2026-10-17T00:00:00.000Z");
    expect(reminderFireAt(ev, 780, "Asia/Seoul").toISOString()).toBe("2026-10-16T11:00:00.000Z");
  });
});
