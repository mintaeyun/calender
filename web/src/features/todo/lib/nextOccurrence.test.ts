import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./nextOccurrence";

describe("nextOccurrence", () => {
  it("매주 금요일: 금요일(10/16)에 완료하면 다음 금요일(10/23)", () => {
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=FR", "2026-10-16", "2026-10-16")?.dueDate).toBe("2026-10-23");
  });
  it("RRULE: 접두어 허용", () => {
    expect(nextOccurrence("RRULE:FREQ=WEEKLY;BYDAY=FR", "2026-10-16", "2026-10-16")?.dueDate).toBe("2026-10-23");
  });
  it("미리 완료해도 마감일 이후의 다음 주기", () => {
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=FR", "2026-10-16", "2026-10-14")?.dueDate).toBe("2026-10-23");
  });
  it("늦게 완료하면 과거 날짜를 만들지 않는다", () => {
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=FR", "2026-10-02", "2026-10-14")?.dueDate).toBe("2026-10-16");
  });
  it("매일", () => {
    expect(nextOccurrence("FREQ=DAILY", "2026-10-31", "2026-10-31")?.dueDate).toBe("2026-11-01");
  });
  it("매월 13일, 31일(31일이 없는 달은 건너뜀)", () => {
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=13", "2026-10-13", "2026-10-13")?.dueDate).toBe("2026-11-13");
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", "2026-10-31", "2026-10-31")?.dueDate).toBe("2026-12-31");
  });
  it("매년", () => {
    expect(nextOccurrence("FREQ=YEARLY", "2026-10-14", "2026-10-14")?.dueDate).toBe("2027-10-14");
  });
  it("UNTIL을 넘으면 null", () => {
    expect(nextOccurrence("FREQ=WEEKLY;UNTIL=20261020T000000Z", "2026-10-16", "2026-10-16")).toBeNull();
    expect(nextOccurrence("FREQ=WEEKLY;UNTIL=20261023T000000Z", "2026-10-16", "2026-10-16")?.dueDate).toBe("2026-10-23");
  });
  it("COUNT는 새 행에서 하나 줄고 소진되면 null", () => {
    expect(nextOccurrence("FREQ=DAILY;COUNT=3", "2026-10-14", "2026-10-14")).toEqual({ dueDate: "2026-10-15", rule: "FREQ=DAILY;COUNT=2" });
    expect(nextOccurrence("FREQ=DAILY;COUNT=1", "2026-10-14", "2026-10-14")).toBeNull();
  });
});
