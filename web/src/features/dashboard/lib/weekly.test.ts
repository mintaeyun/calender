import { describe, expect, it } from "vitest";
import { topCategories, weekSentence, weekTodoStats, type WeekTodo } from "./weekly";

const t = (title: string, due: string | null, status: WeekTodo["status"] = "todo"): WeekTodo => ({ title, due_date: due, status });

describe("weekTodoStats", () => {
  const todos = [
    t("월 완료", "2026-10-19", "done"), t("화 미완", "2026-10-20"), t("수 미완", "2026-10-21"),
    t("지난주 미완", "2026-10-14"), t("다음주", "2026-10-28"), t("기한 없음", null), t("지난주 완료", "2026-10-13", "done"),
  ];
  const s = weekTodoStats(todos, "2026-10-19", "2026-10-21");
  it("이번 주 마감만 달성률에 반영", () => {
    expect([s.total, s.done]).toEqual([3, 1]);
    expect(s.rate).toBeCloseTo(1 / 3);
  });
  it("기한초과는 주와 무관하게 미완료만, 다음 마감은 오늘 이후 가장 가까운 것", () => {
    expect(s.overdue).toBe(2); // 화(10/20) 미완, 지난주 미완
    expect(s.next).toEqual({ title: "수 미완", due: "2026-10-21" });
  });
  it("이번 주 마감이 없으면 rate=null", () => {
    expect(weekTodoStats([t("기한 없음", null)], "2026-10-19", "2026-10-21").rate).toBeNull();
  });
});

describe("topCategories / weekSentence", () => {
  it("상위 3개와 비율", () => {
    const r = topCategories([{ name: "a", amount: 100 }, { name: "b", amount: 300 }, { name: "c", amount: 0 }, { name: "d", amount: 200 }, { name: "e", amount: 50 }]);
    expect(r.map((x) => x.name)).toEqual(["b", "d", "a"]);
    expect(r[0].ratio).toBeCloseTo(300 / 650);
  });
  it("규칙 기반 문장", () => {
    const stats = weekTodoStats([t("x", "2026-10-19", "done"), t("y", "2026-10-20")], "2026-10-19", "2026-10-21");
    expect(weekSentence({ busiest: { weekdayLabel: "목", hours: 3.5 }, stats })).toBe("목요일에 일정이 가장 몰려 있어요(3.5시간). 기한이 지난 할일이 1건 있어요. 이번 주 할일 1/2 완료(50%).");
    expect(weekSentence({ busiest: null, stats: weekTodoStats([], "2026-10-19", "2026-10-21") })).toBeNull();
  });
});
