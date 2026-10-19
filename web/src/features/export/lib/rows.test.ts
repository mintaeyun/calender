import { describe, expect, it } from "vitest";
import { eventsTable, localDateTime, todayStamp, todosTable, transactionsTable, TX_HEADER } from "./rows";

const TZ = "Asia/Seoul";

describe("localDateTime", () => {
  it("UTC → 서울", () => expect(localDateTime("2026-10-14T05:00:00Z", TZ)).toBe("2026-10-14 14:00"));
  it("자정 넘김", () => expect(localDateTime("2026-10-14T15:30:00Z", TZ)).toBe("2026-10-15 00:30"));
});

describe("eventsTable", () => {
  const cal = (id: string | null) => (id === "c1" ? "업무" : "");
  it("시간 일정", () => {
    const t = eventsTable([{ title: "치과", start_at: "2026-10-14T06:00:00Z", end_at: "2026-10-14T07:00:00Z", all_day: false, location: "강남", notes: null, rrule: null, calendar_id: "c1" }], cal, TZ);
    expect(t.rows[0]).toEqual(["치과", "2026-10-14 15:00", "2026-10-14 16:00", "아니오", "강남", "", "", "업무"]);
  });
  it("종일 일정은 마지막 날(포함)로 내보낸다 (end_at 은 다음 날 00:00 exclusive)", () => {
    const t = eventsTable([{ title: "가족 여행", start_at: "2026-10-16T15:00:00Z", end_at: "2026-10-18T15:00:00Z", all_day: true, location: null, notes: null, rrule: "FREQ=YEARLY", calendar_id: null }], cal, TZ);
    expect(t.rows[0].slice(0, 4)).toEqual(["가족 여행", "2026-10-17", "2026-10-18", "예"]);
    expect(t.rows[0][6]).toBe("FREQ=YEARLY");
  });
});

describe("todosTable", () => {
  it("영문 코드를 한국어 표시로", () => {
    const t = todosTable(
      [{ title: "보고서", due_date: "2026-10-14", priority: "high", status: "doing", project_id: "p1", notes: null, completed_at: null, recurrence_rule: null, todo_tags: [{ tag_id: "g1" }, { tag_id: "g2" }] }],
      (id) => (id === "p1" ? "업무" : ""), (id) => ({ g1: "#보고", g2: "#돈" }[id] ?? ""), TZ,
    );
    expect(t.rows[0]).toEqual(["보고서", "2026-10-14", "상", "진행 중", "업무", "#보고 #돈", "", "", ""]);
  });
});

describe("transactionsTable", () => {
  const cat = (id: string | null) => (id === "c1" ? "식비" : "");
  const acc = (id: string | null) => ({ a1: "신한카드", a2: "현금" }[id ?? ""] ?? "");
  it("지출·이체", () => {
    const t = transactionsTable([
      { date: "2026-10-14", type: "expense", amount: 12000, category_id: "c1", account_id: "a1", to_account_id: null, memo: "점심" },
      { date: "2026-10-12", type: "transfer", amount: 100000, category_id: null, account_id: "a1", to_account_id: "a2", memo: null },
    ], cat, acc);
    expect(t.header).toEqual(TX_HEADER);
    expect(t.rows[0]).toEqual(["2026-10-14", "지출", 12000, "식비", "신한카드", "", "점심"]);
    expect(t.rows[1]).toEqual(["2026-10-12", "이체", 100000, "", "신한카드", "현금", ""]);
  });
});

describe("todayStamp", () => {
  it("파일 이름용 날짜", () => expect(todayStamp(TZ, new Date("2026-10-14T20:00:00Z"))).toBe("20261015"));
});
