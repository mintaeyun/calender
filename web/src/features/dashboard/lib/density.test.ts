import { describe, expect, it } from "vitest";
import { busiestDay, level, weekDensity, weekStartOf, type TimedEvent } from "./density";

const TZ = "Asia/Seoul";
// 2026-10-19(월) 09:30~10:30 KST = 00:30Z~01:30Z
const ev = (s: string, e: string, allDay = false): TimedEvent => ({ start: new Date(s), end: new Date(e), allDay });

describe("density", () => {
  it("단계 경계", () => {
    expect([0, 10, 30, 59, 60, 119, 120, 300].map(level)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("주 시작 요일 계산", () => {
    expect(weekStartOf("2026-10-21", "monday")).toBe("2026-10-19"); // 수 → 월
    expect(weekStartOf("2026-10-25", "monday")).toBe("2026-10-19"); // 일 → 그 주 월
    expect(weekStartOf("2026-10-21", "sunday")).toBe("2026-10-18"); // 수 → 일
    expect(weekStartOf("2026-10-19", "monday")).toBe("2026-10-19");
  });

  it("월요일 09:30~10:30 → 09시 구간 월요일 60분(3단계)", () => {
    const { days, matrix } = weekDensity([ev("2026-10-19T00:30:00Z", "2026-10-19T01:30:00Z")], "2026-10-19", TZ);
    expect(days[0]).toBe("2026-10-19");
    expect(matrix[0][0]).toBe(3);
    expect(matrix[0].slice(1).every((v) => v === 0)).toBe(true);
    expect(matrix.slice(1).every((row) => row.every((v) => v === 0))).toBe(true);
  });

  it("구간을 가로지르는 일정은 나뉘어 집계, 종일 일정과 주 밖 일정은 제외", () => {
    // 월 11:00~13:00 → 09~12 구간 60분, 12~15 구간 60분
    const events = [
      ev("2026-10-19T02:00:00Z", "2026-10-19T04:00:00Z"),
      ev("2026-10-18T15:00:00Z", "2026-10-19T15:00:00Z", true),
      ev("2026-10-26T00:30:00Z", "2026-10-26T01:30:00Z"),
    ];
    const { matrix } = weekDensity(events, "2026-10-19", TZ);
    expect([matrix[0][0], matrix[1][0]]).toEqual([3, 3]);
    expect(matrix.flat().filter((v) => v > 0)).toHaveLength(2);
  });

  it("자정을 넘기는 일정은 다음 날 21시 구간에도 반영", () => {
    // 월 22:00 ~ 화 01:00 KST → 월 21~24 구간 120분(4단계)
    const { matrix } = weekDensity([ev("2026-10-19T13:00:00Z", "2026-10-19T16:00:00Z")], "2026-10-19", TZ);
    expect(matrix[5][0]).toBe(4);
  });

  it("가장 바쁜 요일", () => {
    const events = [ev("2026-10-19T00:30:00Z", "2026-10-19T01:30:00Z"), ev("2026-10-20T00:00:00Z", "2026-10-20T03:30:00Z")];
    expect(busiestDay(events, "2026-10-19", TZ)).toEqual({ date: "2026-10-20", hours: 3.5 });
    expect(busiestDay([], "2026-10-19", TZ)).toBeNull();
  });
});
