import { describe, expect, it } from "vitest";
import { addDays, compareTodos, dueKind, dueLabel, matchesFilter, todayIn, type SortFields } from "./due";

const T = "2026-10-14";
const mk = (o: Partial<SortFields>): SortFields => ({ due_date: null, status: "todo", priority: "mid", created_at: "2026-10-01T00:00:00Z", ...o });

describe("todayIn", () => {
  it("UTC 15:30은 서울에서는 다음 날", () => {
    expect(todayIn("Asia/Seoul", new Date("2026-10-13T15:30:00Z"))).toBe("2026-10-14");
    expect(todayIn("UTC", new Date("2026-10-13T15:30:00Z"))).toBe("2026-10-13");
  });
});

describe("dueKind", () => {
  it("분류", () => {
    expect(dueKind(mk({ due_date: "2026-10-13" }), T)).toBe("over");
    expect(dueKind(mk({ due_date: "2026-10-13", status: "done" }), T)).toBe("past");
    expect(dueKind(mk({ due_date: T }), T)).toBe("today");
    expect(dueKind(mk({ due_date: "2026-10-15" }), T)).toBe("later");
    expect(dueKind(mk({}), T)).toBe("none");
  });
});

describe("matchesFilter", () => {
  const over = mk({ due_date: "2026-10-13" });
  const today = mk({ due_date: T });
  const later = mk({ due_date: "2026-10-20" });
  const none = mk({});
  const done = mk({ due_date: "2026-10-12", status: "done" });
  const all = [over, today, later, none, done];
  it("오늘 = 오늘 + 기한초과", () => {
    expect(all.map((t) => matchesFilter(t, "today", T))).toEqual([true, true, false, false, false]);
  });
  it("예정/기한초과/전체/완료", () => {
    expect(all.map((t) => matchesFilter(t, "upcoming", T))).toEqual([false, false, true, false, false]);
    expect(all.map((t) => matchesFilter(t, "overdue", T))).toEqual([true, false, false, false, false]);
    expect(all.map((t) => matchesFilter(t, "all", T))).toEqual([true, true, true, true, false]);
    expect(all.map((t) => matchesFilter(t, "done", T))).toEqual([false, false, false, false, true]);
  });
});

describe("compareTodos", () => {
  it("마감순: 같은 마감이면 우선순위 → 생성일, 마감 없음은 뒤", () => {
    const a = mk({ due_date: "2026-10-15", priority: "low" });
    const b = mk({ due_date: "2026-10-15", priority: "high" });
    const c = mk({ due_date: "2026-10-14" });
    const d = mk({});
    expect([a, b, c, d].sort(compareTodos("due"))).toEqual([c, b, a, d]);
  });
  it("우선순위순 / 생성일순", () => {
    const a = mk({ priority: "low", created_at: "2026-10-03T00:00:00Z" });
    const b = mk({ priority: "high", created_at: "2026-10-02T00:00:00Z" });
    expect([a, b].sort(compareTodos("priority"))).toEqual([b, a]);
    expect([a, b].sort(compareTodos("created"))).toEqual([b, a]);
  });
});

describe("dueLabel/addDays", () => {
  it("라벨", () => {
    expect(dueLabel(null, T)).toBe("-");
    expect(dueLabel(T, T)).toBe("오늘");
    expect(dueLabel("2026-10-13", T)).toBe("어제");
    expect(dueLabel("2026-10-16", T)).toBe("10/16");
  });
  it("월 경계", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
});
