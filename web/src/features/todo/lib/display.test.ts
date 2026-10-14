import { describe, expect, it } from "vitest";
import { buildRule, dueFull, parseRule, recurrenceLabel } from "./display";
import { nextOccurrence } from "./nextOccurrence";

describe("recurrence UI ↔ RRULE", () => {
  it("매주 금요일", () => {
    const rule = buildRule({ freq: "WEEKLY", byday: ["FR"], until: "" }, "2026-10-16");
    expect(rule).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(recurrenceLabel(rule)).toBe("매주 금요일");
    expect(parseRule(rule)).toEqual({ freq: "WEEKLY", byday: ["FR"], until: "" });
  });
  it("매월은 마감일의 일자, 종료일 UNTIL", () => {
    const rule = buildRule({ freq: "MONTHLY", byday: [], until: "2027-01-31" }, "2026-10-13");
    expect(rule).toBe("FREQ=MONTHLY;BYMONTHDAY=13;UNTIL=20270131T235959Z");
    expect(recurrenceLabel(rule)).toBe("매월 13일 (2027-01-31까지)");
    expect(parseRule(rule).until).toBe("2027-01-31");
    expect(nextOccurrence(rule!, "2026-10-13", "2026-10-13")?.dueDate).toBe("2026-11-13");
  });
  it("없음", () => {
    expect(buildRule({ freq: "NONE", byday: [], until: "" }, null)).toBeNull();
    expect(recurrenceLabel(null)).toBe("없음");
  });
});

describe("dueFull", () => {
  it("요일 포함", () => {
    expect(dueFull("2026-10-14")).toBe("10월 14일 (수)");
    expect(dueFull(null)).toBe("없음");
  });
});
