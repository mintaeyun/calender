import { describe, expect, it } from "vitest";
import { isTargetCalendar, normalizeCalendarName } from "./target.ts";

describe("isTargetCalendar", () => {
  it("공백·대소문자를 무시한 정확 일치", () => {
    expect(isTargetCalendar("mycal")).toBe(true);
    expect(isTargetCalendar(" MyCal ")).toBe(true);
    expect(isTargetCalendar("my cal")).toBe(true);
  });
  it("부분 일치·다른 이름은 제외", () => {
    expect(isTargetCalendar("mycal2")).toBe(false);
    expect(isTargetCalendar("개인")).toBe(false);
    expect(isTargetCalendar(null)).toBe(false);
    expect(isTargetCalendar("")).toBe(false);
  });
  it("대상 이름 변경", () => {
    expect(isTargetCalendar("가족", "가족")).toBe(true);
    expect(normalizeCalendarName(" A B ")).toBe("ab");
  });
});
