import { describe, expect, it } from "vitest";
import { groupEnabled, hhmm, relativeTime, SETTING_GROUPS, toggleGroup, typeMeta } from "./labels";

describe("relativeTime", () => {
  const now = new Date("2026-10-14T05:00:00Z"); // 서울 14:00
  it("분/시간/어제/날짜", () => {
    expect(relativeTime("2026-10-14T04:59:40Z", now)).toBe("방금");
    expect(relativeTime("2026-10-14T04:30:00Z", now)).toBe("30분 전");
    expect(relativeTime("2026-10-14T01:00:00Z", now)).toBe("4시간 전");
    expect(relativeTime("2026-10-13T00:00:00Z", now)).toBe("어제"); // 서울 10/13 09:00, 29시간 전
    expect(relativeTime("2026-10-10T00:00:00Z", now)).toBe("10/10");
  });
});

describe("설정 그룹", () => {
  const budget = SETTING_GROUPS.find((g) => g.key === "budget")!;
  it("예산 그룹은 두 종류를 함께 켜고 끈다", () => {
    const off = toggleGroup({}, budget, false);
    expect(off).toEqual({ budget_warning: false, budget_exceeded: false });
    expect(groupEnabled(off, budget)).toBe(false);
    expect(groupEnabled(toggleGroup(off, budget, true), budget)).toBe(true);
  });
  it("키가 없으면 켜짐", () => expect(groupEnabled({}, budget)).toBe(true));
});

describe("기타", () => {
  it("알 수 없는 종류는 기본 칩", () => expect(typeMeta("zzz").label).toBe("알림"));
  it("time 값 자르기", () => {
    expect(hhmm("23:00:00")).toBe("23:00");
    expect(hhmm(null)).toBe("");
  });
});
