import { describe, expect, it } from "vitest";
import {
  buildRRule, parseRRule, summarizeRRule, expandEvents, truncateRRule, tailRRule, countBefore,
  type EventRow,
} from "./recurrence";

const TZ = "Asia/Seoul";
const base: EventRow = {
  id: "m1", user_id: "u", calendar_id: null, title: "스탠드업",
  start_at: "2026-10-12T00:30:00Z", // 월 09:30 KST
  end_at: "2026-10-12T01:00:00Z",
  all_day: false, location: null, notes: null, color: null, rrule: null,
  recurring_event_id: null, original_start_at: null, exdates: [],
  google_event_id: null, google_etag: null, google_updated_at: null, deleted_at: null,
  created_at: "", updated_at: "",
};
const ev = (o: Partial<EventRow>): EventRow => ({ ...base, ...o });
const range = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) });
const starts = (rows: ReturnType<typeof expandEvents>) => rows.map((r) => r.start.toISOString());

describe("buildRRule / parseRRule", () => {
  it("매주 월·수, 횟수", () => {
    const r = buildRRule({ freq: "weekly", interval: 1, byDays: [3, 1], end: { type: "count", count: 10 } });
    expect(r).toBe("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10");
    expect(parseRRule(r)?.spec).toEqual({ freq: "weekly", interval: 1, byDays: [1, 3], end: { type: "count", count: 10 } });
  });

  it("종료일은 사용자 시간대 그날 끝까지 포함", () => {
    const r = buildRRule({ freq: "daily", interval: 1, byDays: [], end: { type: "until", date: "2026-12-31" } }, TZ)!;
    expect(r).toBe("FREQ=DAILY;UNTIL=20261231T145959Z");
    expect(parseRRule(r, TZ)?.spec.end).toEqual({ type: "until", date: "2026-12-31" });
  });

  it("구글 형식(RRULE: 접두사, 날짜만 UNTIL)을 읽는다", () => {
    expect(parseRRule("RRULE:FREQ=WEEKLY;UNTIL=20261231;BYDAY=FR", TZ)?.spec.end).toEqual({ type: "until", date: "2026-12-31" });
  });

  it("편집 불가능한 복잡한 규칙은 supported=false", () => {
    expect(parseRRule("FREQ=MONTHLY;BYDAY=2TU")?.supported).toBe(false);
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=1,15")?.supported).toBe(false);
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO")?.supported).toBe(true);
  });

  it("요약 문구", () => {
    expect(summarizeRRule("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10", base.start_at, TZ)).toBe("매주 월·수 · 10회");
    expect(summarizeRRule("FREQ=MONTHLY", base.start_at, TZ)).toBe("매월 12일");
    expect(summarizeRRule(null, base.start_at, TZ)).toBe("반복 안 함");
  });
});

describe("expandEvents", () => {
  it("비반복 일정은 범위와 겹칠 때만", () => {
    const e = ev({});
    expect(expandEvents([e], range("2026-10-12T00:00:00Z", "2026-10-13T00:00:00Z"), TZ)).toHaveLength(1);
    expect(expandEvents([e], range("2026-10-13T00:00:00Z", "2026-10-14T00:00:00Z"), TZ)).toHaveLength(0);
  });

  it("매일", () => {
    const e = ev({ rrule: "FREQ=DAILY" });
    const r = expandEvents([e], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ);
    expect(starts(r)).toEqual(["2026-10-12T00:30:00.000Z", "2026-10-13T00:30:00.000Z", "2026-10-14T00:30:00.000Z"]);
  });

  it("매주 월·수 (사용자 시간대 요일 기준: 월 08:00 KST = 일 23:00 UTC)", () => {
    const e = ev({ start_at: "2026-10-11T23:00:00Z", end_at: "2026-10-12T00:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE" });
    const r = expandEvents([e], range("2026-10-11T00:00:00Z", "2026-10-19T00:00:00Z"), TZ);
    expect(starts(r)).toEqual(["2026-10-11T23:00:00.000Z", "2026-10-13T23:00:00.000Z", "2026-10-18T23:00:00.000Z"]);
  });

  it("매월 / 매년", () => {
    const m = ev({ rrule: "FREQ=MONTHLY" });
    expect(starts(expandEvents([m], range("2026-10-01T00:00:00Z", "2027-01-31T00:00:00Z"), TZ))).toEqual([
      "2026-10-12T00:30:00.000Z", "2026-11-12T00:30:00.000Z", "2026-12-12T00:30:00.000Z", "2027-01-12T00:30:00.000Z",
    ]);
    const y = ev({ rrule: "FREQ=YEARLY" });
    expect(starts(expandEvents([y], range("2026-01-01T00:00:00Z", "2029-01-01T00:00:00Z"), TZ))).toHaveLength(3);
  });

  it("횟수(COUNT)와 UNTIL", () => {
    const c = ev({ rrule: "FREQ=DAILY;COUNT=3" });
    expect(expandEvents([c], range("2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z"), TZ)).toHaveLength(3);
    const u = ev({ rrule: "FREQ=DAILY;UNTIL=20261014T145959Z" }); // 10/14 끝까지
    expect(expandEvents([u], range("2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z"), TZ)).toHaveLength(3);
  });

  it("exdates 는 제외", () => {
    const e = ev({ rrule: "FREQ=DAILY", exdates: ["2026-10-13T00:30:00Z"] });
    const r = expandEvents([e], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ);
    expect(starts(r)).toEqual(["2026-10-12T00:30:00.000Z", "2026-10-14T00:30:00.000Z"]);
  });

  it("예외 인스턴스는 원래 발생을 대체한다", () => {
    const master = ev({ rrule: "FREQ=DAILY" });
    const exc = ev({
      id: "x1", rrule: null, title: "변경됨", recurring_event_id: "m1",
      original_start_at: "2026-10-13T00:30:00Z",
      start_at: "2026-10-13T05:00:00Z", end_at: "2026-10-13T06:00:00Z",
    });
    const r = expandEvents([master, exc], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ);
    expect(starts(r)).toEqual(["2026-10-12T00:30:00.000Z", "2026-10-13T05:00:00.000Z", "2026-10-14T00:30:00.000Z"]);
    expect(r[1].isException).toBe(true);
    expect(r[1].event.title).toBe("변경됨");
  });

  it("삭제된 행은 무시", () => {
    const e = ev({ rrule: "FREQ=DAILY", deleted_at: "2026-10-12T00:00:00Z" });
    expect(expandEvents([e], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ)).toHaveLength(0);
  });

  it("범위 시작 전에 시작해 걸쳐 있는 발생도 포함(여러 날 일정)", () => {
    const e = ev({ start_at: "2026-10-11T15:00:00Z", end_at: "2026-10-13T15:00:00Z", all_day: true, rrule: "FREQ=WEEKLY" });
    const r = expandEvents([e], range("2026-10-13T00:00:00Z", "2026-10-14T00:00:00Z"), TZ);
    expect(r).toHaveLength(1);
  });
});

describe("분할 헬퍼", () => {
  it("truncateRRule 은 COUNT 를 UNTIL 로 바꾼다", () => {
    expect(truncateRRule("FREQ=DAILY;COUNT=10", new Date("2026-10-14T00:00:00Z"))).toBe("FREQ=DAILY;UNTIL=20261014T000000Z");
  });

  it("tailRRule 은 남은 횟수로 COUNT 를 조정", () => {
    const split = new Date("2026-10-15T00:30:00Z"); // 3번째 발생
    expect(countBefore("FREQ=DAILY;COUNT=10", base.start_at, split, TZ)).toBe(3);
    expect(tailRRule("FREQ=DAILY;COUNT=10", base.start_at, split, TZ)).toBe("FREQ=DAILY;COUNT=7");
    expect(tailRRule("FREQ=DAILY", base.start_at, split, TZ)).toBe("FREQ=DAILY");
  });
});
