import { describe, expect, it } from "vitest";
import { classifyToday, greeting, prevMonthOf, previousMonthSamePeriod, remainingLabel, spendingBar, todayTodos, type DayEvent, type DashTodo } from "./dashboard";

const ev = (title: string, s: string, e: string, allDay = false): DayEvent => ({ key: title, title, start: new Date(s), end: new Date(e), allDay, location: null });

describe("greeting / remainingLabel", () => {
  it("시간대별 인사", () => {
    expect([2, 9, 14, 20].map(greeting)).toEqual(["늦은 시간이에요", "좋은 아침이에요", "좋은 오후예요", "좋은 저녁이에요"]);
  });
  it("남은 시간", () => {
    expect(remainingLabel(0)).toBe("곧");
    expect(remainingLabel(35 * 60_000)).toBe("35분 후");
    expect(remainingLabel(80 * 60_000)).toBe("1시간 20분 후");
    expect(remainingLabel(120 * 60_000)).toBe("2시간 후");
  });
});

describe("classifyToday", () => {
  const now = new Date("2026-10-19T05:00:00Z"); // 14:00 KST
  const events = [
    ev("저녁", "2026-10-19T10:30:00Z", "2026-10-19T11:30:00Z"),
    ev("스탠드업", "2026-10-19T00:30:00Z", "2026-10-19T01:00:00Z"),
    ev("치과", "2026-10-19T06:00:00Z", "2026-10-19T07:00:00Z"),
    ev("휴가", "2026-10-18T15:00:00Z", "2026-10-19T15:00:00Z", true),
  ];
  it("지난 일정 / 다음 일정 / 이후 / 종일 구분", () => {
    const r = classifyToday(events, now);
    expect(r.past.map((e) => e.title)).toEqual(["스탠드업"]);
    expect(r.next?.title).toBe("치과");
    expect(r.later.map((e) => e.title)).toEqual(["저녁"]);
    expect(r.allDay.map((e) => e.title)).toEqual(["휴가"]);
  });
  it("진행 중인 일정이 다음 일정으로 강조되고, 일정이 없으면 null", () => {
    expect(classifyToday(events, new Date("2026-10-19T06:30:00Z")).next?.title).toBe("치과");
    expect(classifyToday([], now).next).toBeNull();
    expect(classifyToday(events, new Date("2026-10-19T12:00:00Z")).next).toBeNull(); // 모두 지남
  });
});

describe("todayTodos", () => {
  const t = (id: string, due: string | null, status: DashTodo["status"], priority: DashTodo["priority"] = "medium"): DashTodo => ({ id, title: id, due_date: due, status, priority });
  it("오늘 마감·기한초과만, 기한초과 → 미완료 → 완료 순, N/M 계산", () => {
    const r = todayTodos([
      t("later", "2026-10-25", "todo"), t("none", null, "todo"), t("done-today", "2026-10-19", "done"),
      t("today-low", "2026-10-19", "todo", "low"), t("today-high", "2026-10-19", "todo", "high"), t("over", "2026-10-15", "todo"),
      t("done-old", "2026-10-10", "done"),
    ], "2026-10-19");
    expect(r.items.map((x) => x.id)).toEqual(["over", "today-high", "today-low", "done-today"]);
    expect([r.done, r.total]).toEqual([1, 4]);
  });
});

describe("지출 비교·구성", () => {
  it("전월 같은 기간까지만 합산", () => {
    const rows = [{ date: "2026-09-03", amount: 100 }, { date: "2026-09-19", amount: 50 }, { date: "2026-09-20", amount: 999 }];
    expect(previousMonthSamePeriod(rows, "2026-09", 19)).toBe(150);
    expect(prevMonthOf("2026-01")).toBe("2025-12");
    expect(prevMonthOf("2026-10")).toBe("2026-09");
  });
  it("구성 바: 상위 3 + 기타, 남은 예산·소진율", () => {
    const r = spendingBar([{ name: "주거", amount: 650 }, { name: "식비", amount: 482 }, { name: "쇼핑", amount: 214 }, { name: "교통", amount: 200 }, { name: "문화", amount: 96 }, { name: "0원", amount: 0 }], 1642, 2200);
    expect(r.parts.map((p) => p.name)).toEqual(["주거", "식비", "쇼핑", "기타"]);
    expect(r.parts[3].amount).toBe(296);
    expect(r.remaining).toBe(558);
    expect(r.usedRatio).toBeCloseTo(0.746, 3);
    expect(spendingBar([], 0, null).remaining).toBeNull();
  });
});
