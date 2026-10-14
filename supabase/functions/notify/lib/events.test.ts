import { describe, expect, it } from "vitest";
import { expandEvents, type EventRow } from "../../../../web/src/features/calendar/lib/recurrence";
import { reminderFireAt } from "../../../../web/src/features/calendar/lib/allday";
import { occurrencesBetween, planEventNotifications, type EventLike } from "./events";

const TZ = "Asia/Seoul";
const base = { all_day: false, rrule: null, exdates: [], recurring_event_id: null, original_start_at: null, deleted_at: null, end_at: "2026-10-14T06:00:00Z" };
const ev = (o: Partial<EventLike> & { id: string }): EventLike => ({ title: "일정", start_at: "2026-10-14T05:00:00Z", ...base, ...o });
const w = (a: string, b: string) => ({ from: new Date(a), to: new Date(b) });

describe("일정 시작 알림", () => {
  // 서울 14:00 시작(UTC 05:00), 10분 전 = UTC 04:50
  it("10분 전 알림이 창 안에서 정확히 1건", () => {
    const r = planEventNotifications([ev({ id: "e1", title: "치과" })], new Map([["e1", [10]]]), w("2026-10-14T04:45:00Z", "2026-10-14T04:50:00Z"), TZ);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "event_start", title: "치과", body: "10분 후 시작 · 14:00", dedupe_key: "event_start:e1:2026-10-14T05:00:00.000Z:10" });
    expect(r[0].scheduled_at.toISOString()).toBe("2026-10-14T04:50:00.000Z");
  });
  it("5분 간격 스캔이 연속되어도 한 알림은 한 창에만 속한다", () => {
    const e = [ev({ id: "e1" })], m = new Map([["e1", [10]]]);
    const hits = [["04:40", "04:45"], ["04:45", "04:50"], ["04:50", "04:55"], ["04:55", "05:00"]]
      .map(([a, b]) => planEventNotifications(e, m, w(`2026-10-14T${a}:00Z`, `2026-10-14T${b}:00Z`), TZ).length);
    expect(hits).toEqual([0, 1, 0, 0]);
  });
  it("겹치는 창이어도 멱등 키가 같다", () => {
    const e = [ev({ id: "e1" })], m = new Map([["e1", [10]]]);
    const a = planEventNotifications(e, m, w("2026-10-14T04:40:00Z", "2026-10-14T04:50:00Z"), TZ);
    const b = planEventNotifications(e, m, w("2026-10-14T04:45:00Z", "2026-10-14T04:55:00Z"), TZ);
    expect(a[0].dedupe_key).toBe(b[0].dedupe_key);
  });
  it("알림 미지정·삭제된 일정은 없음", () => {
    const win = w("2026-10-14T04:45:00Z", "2026-10-14T05:00:00Z");
    expect(planEventNotifications([ev({ id: "e1" })], new Map(), win, TZ)).toHaveLength(0);
    expect(planEventNotifications([ev({ id: "e1", deleted_at: "x" })], new Map([["e1", [0]]]), win, TZ)).toHaveLength(0);
  });
  it("종일 일정: 당일 09:00(서울) 기준 — 당일 0분, 전날 20:00 = 780분", () => {
    // 서울 10/17 종일: start_at = 10/16 15:00Z
    const day = ev({ id: "a1", title: "가족 여행", all_day: true, start_at: "2026-10-16T15:00:00Z", end_at: "2026-10-17T15:00:00Z" });
    const m = new Map([["a1", [0, 780]]]);
    const same = planEventNotifications([day], m, w("2026-10-16T23:55:00Z", "2026-10-17T00:05:00Z"), TZ); // 서울 10/17 09:00
    expect(same.map((p) => p.body)).toEqual(["오늘 종일 일정이에요"]);
    const eve = planEventNotifications([day], m, w("2026-10-16T10:55:00Z", "2026-10-16T11:05:00Z"), TZ); // 서울 10/16 20:00
    expect(eve.map((p) => p.body)).toEqual(["내일 종일 일정이에요"]);
  });
});

describe("반복 일정", () => {
  // 매주 월·수 14:00(서울) — 시작 2026-10-12(월)
  const rec = ev({ id: "r1", title: "스터디", start_at: "2026-10-12T05:00:00Z", end_at: "2026-10-12T06:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE" });
  it("인스턴스별 알림 (수요일 10분 전)", () => {
    const r = planEventNotifications([rec], new Map([["r1", [10]]]), w("2026-10-14T04:45:00Z", "2026-10-14T04:55:00Z"), TZ);
    expect(r).toHaveLength(1);
    expect(r[0].dedupe_key).toBe("event_start:r1:2026-10-14T05:00:00.000Z:10");
  });
  it("exdates 와 예외 인스턴스로 대체된 발생은 제외, 예외 인스턴스는 자기 시각으로 알림", () => {
    const skipped = { ...rec, exdates: ["2026-10-14T05:00:00Z"] };
    const win = w("2026-10-14T04:45:00Z", "2026-10-14T04:55:00Z");
    expect(planEventNotifications([skipped], new Map([["r1", [10]]]), win, TZ)).toHaveLength(0);
    const exception = ev({ id: "x1", title: "스터디(변경)", start_at: "2026-10-14T07:00:00Z", end_at: "2026-10-14T08:00:00Z", recurring_event_id: "r1", original_start_at: "2026-10-14T05:00:00Z" });
    const r = planEventNotifications([rec, exception], new Map([["r1", [10]], ["x1", [10]]]), w("2026-10-14T04:45:00Z", "2026-10-14T06:55:00Z"), TZ);
    expect(r.map((p) => p.title)).toEqual(["스터디(변경)"]);
    expect(r[0].scheduled_at.toISOString()).toBe("2026-10-14T06:50:00.000Z");
  });
  it("UNTIL 이후에는 알림 없음", () => {
    const ended = { ...rec, rrule: "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261012T145959Z" };
    expect(planEventNotifications([ended], new Map([["r1", [10]]]), w("2026-10-14T04:45:00Z", "2026-10-14T04:55:00Z"), TZ)).toHaveLength(0);
  });
});

describe("02 calendar 구현과의 일치 (parity)", () => {
  const rows = (list: EventLike[]) => list.map((e) => ({ ...e, user_id: "u", calendar_id: null, location: null, notes: null, color: null, google_event_id: null, google_etag: null, google_updated_at: null, created_at: "", updated_at: "" })) as unknown as EventRow[];
  it("반복 전개 결과가 expandEvents 와 같다 (매주 월·수·금, 매월 31일, 매일 COUNT)", () => {
    const rules = ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=MONTHLY;BYMONTHDAY=31", "FREQ=DAILY;COUNT=5", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"];
    const range = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2027-02-01T00:00:00Z") };
    for (const rule of rules) {
      const e = ev({ id: "p", rrule: rule, start_at: "2026-10-05T01:30:00Z", end_at: "2026-10-05T02:30:00Z" });
      const theirs = expandEvents(rows([e]), range, TZ).map((i) => i.start.toISOString());
      const mine = occurrencesBetween(rule, new Date(e.start_at), new Date(range.start.getTime() - 3600_000), range.end, TZ)
        .filter((d) => d >= range.start && d < range.end).map((d) => d.toISOString());
      expect(mine).toEqual(theirs);
    }
  });
  it("알림 시각이 reminderFireAt 과 같다 (시간·종일)", () => {
    const timed = { start_at: "2026-10-14T05:00:00Z", all_day: false };
    const allDay = { start_at: "2026-10-16T15:00:00Z", all_day: true };
    for (const [e, mins] of [[timed, 10], [timed, 1440], [allDay, 0], [allDay, 780], [allDay, 10080]] as const) {
      const expected = reminderFireAt(e, mins, TZ).toISOString();
      const [from, to] = [new Date(Date.parse(expected) - 60_000), new Date(Date.parse(expected) + 60_000)];
      const r = planEventNotifications([ev({ id: "z", start_at: e.start_at, all_day: e.all_day, end_at: e.start_at })], new Map([["z", [mins]]]), { from, to }, TZ);
      expect(r).toHaveLength(1);
      expect(r[0].scheduled_at.toISOString()).toBe(expected);
    }
  });
});
