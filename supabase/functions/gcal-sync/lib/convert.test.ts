import { describe, expect, it } from "vitest";
import { convertGoogleEvent, extractExdates, extractRRule, parseGoogleTime, type ConvertResult, type GoogleEvent } from "./convert.ts";

const TZ = "Asia/Seoul";
const up = (r: ConvertResult) => {
  if (r.kind !== "upsert") throw new Error(`expected upsert, got ${r.kind}`);
  return r.event;
};

describe("시간 변환", () => {
  it("오프셋이 있는 dateTime", () => {
    expect(parseGoogleTime({ dateTime: "2026-10-14T09:30:00+09:00" }, TZ)?.at.toISOString()).toBe("2026-10-14T00:30:00.000Z");
    expect(parseGoogleTime({ dateTime: "2026-10-14T00:30:00Z" }, TZ)?.allDay).toBe(false);
  });
  it("오프셋이 없으면 timeZone 으로 해석, 없으면 사용자 시간대", () => {
    expect(parseGoogleTime({ dateTime: "2026-10-14T09:30:00", timeZone: "America/New_York" }, TZ)?.at.toISOString()).toBe("2026-10-14T13:30:00.000Z");
    expect(parseGoogleTime({ dateTime: "2026-10-14T09:30:00" }, TZ)?.at.toISOString()).toBe("2026-10-14T00:30:00.000Z");
  });
  it("종일 date 는 사용자 시간대 00:00", () => {
    const r = parseGoogleTime({ date: "2026-10-17" }, TZ)!;
    expect(r.allDay).toBe(true);
    expect(r.at.toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });
  it("잘못된 값은 null", () => {
    expect(parseGoogleTime({ date: "2026/10/17" }, TZ)).toBeNull();
    expect(parseGoogleTime({ dateTime: "nope" }, TZ)).toBeNull();
    expect(parseGoogleTime(undefined, TZ)).toBeNull();
  });
});

describe("convertGoogleEvent", () => {
  it("시간 일정", () => {
    const e = up(convertGoogleEvent({
      id: "g1", etag: '"abc"', summary: " 치과 ", location: "강남역", description: "정기검진", updated: "2026-10-10T01:00:00.000Z",
      start: { dateTime: "2026-10-15T15:00:00+09:00" }, end: { dateTime: "2026-10-15T16:00:00+09:00" },
    }, TZ));
    expect(e).toMatchObject({
      google_event_id: "g1", google_etag: '"abc"', title: "치과", location: "강남역", notes: "정기검진", all_day: false,
      start_at: "2026-10-15T06:00:00.000Z", end_at: "2026-10-15T07:00:00.000Z", rrule: null, exdates: [], master_google_id: null,
      google_updated_at: "2026-10-10T01:00:00.000Z",
    });
  });

  it("여러 날 종일: 구글 end.date(exclusive)가 그대로 end_at(02 규칙)", () => {
    const e = up(convertGoogleEvent({
      id: "g2", summary: "가족 여행", start: { date: "2026-10-17" }, end: { date: "2026-10-19" },
    }, TZ));
    expect(e.all_day).toBe(true);
    expect(e.start_at).toBe("2026-10-16T15:00:00.000Z"); // 10/17 00:00 KST
    expect(e.end_at).toBe("2026-10-18T15:00:00.000Z"); // 10/19 00:00 KST = 마지막 날(10/18) 다음 00:00
  });

  it("반복 마스터: RRULE 은 접두사만 제거, EXDATE 는 exdates 로", () => {
    const e = up(convertGoogleEvent({
      id: "g3", summary: "스탠드업", start: { dateTime: "2026-10-12T09:30:00+09:00", timeZone: "Asia/Seoul" }, end: { dateTime: "2026-10-12T10:00:00+09:00" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T145959Z", "EXDATE;TZID=Asia/Seoul:20261019T093000", "EXDATE:20261021T003000Z"],
    }, TZ));
    expect(e.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T145959Z");
    expect(e.exdates).toEqual(["2026-10-19T00:30:00.000Z", "2026-10-21T00:30:00.000Z"]);
  });

  it("예외 인스턴스: 마스터 id 와 원래 시작", () => {
    const e = up(convertGoogleEvent({
      id: "g3_20261014T003000Z", summary: "변경됨", recurringEventId: "g3",
      originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" },
      start: { dateTime: "2026-10-14T14:00:00+09:00" }, end: { dateTime: "2026-10-14T15:00:00+09:00" },
      recurrence: ["RRULE:FREQ=DAILY"], // 예외에는 보통 없지만 있어도 무시
    }, TZ));
    expect(e.master_google_id).toBe("g3");
    expect(e.original_start_at).toBe("2026-10-14T00:30:00.000Z");
    expect(e.rrule).toBeNull();
  });

  it("취소: 일반 일정은 삭제, 반복 인스턴스는 cancel_instance", () => {
    expect(convertGoogleEvent({ id: "g4", status: "cancelled" }, TZ)).toEqual({ kind: "delete", google_event_id: "g4" });
    const r = convertGoogleEvent({
      id: "g3_x", status: "cancelled", recurringEventId: "g3", originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" },
    }, TZ);
    expect(r).toEqual({ kind: "cancel_instance", master_google_id: "g3", original_start_at: "2026-10-14T00:30:00.000Z", google_event_id: "g3_x" });
  });

  it("제목 없음, 종료가 시작보다 빠르거나 없는 경우 보정", () => {
    const e = up(convertGoogleEvent({ id: "g5", start: { dateTime: "2026-10-14T10:00:00+09:00" }, end: { dateTime: "2026-10-14T09:00:00+09:00" } }, TZ));
    expect(e.title).toBe("(제목 없음)");
    expect(e.end_at).toBe(e.start_at);
    const e2 = up(convertGoogleEvent({ id: "g6", summary: "x", start: { date: "2026-10-14" } }, TZ));
    expect(e2.end_at).toBe(e2.start_at);
  });

  it("시작이 없으면 건너뜀", () => {
    expect(convertGoogleEvent({ id: "g7", summary: "?" } as GoogleEvent, TZ).kind).toBe("skip");
  });
});

describe("recurrence 줄 파싱", () => {
  it("RRULE 추출(대소문자·공백)", () => {
    expect(extractRRule(["EXDATE:20261019T003000Z", " rrule:FREQ=DAILY;COUNT=3 "])).toBe("FREQ=DAILY;COUNT=3");
    expect(extractRRule(undefined)).toBeNull();
  });
  it("EXDATE 종일(VALUE=DATE)과 쉼표 목록, 중복 제거", () => {
    expect(extractExdates(["EXDATE;VALUE=DATE:20261019,20261020", "EXDATE;VALUE=DATE:20261019"], TZ)).toEqual([
      "2026-10-18T15:00:00.000Z", "2026-10-19T15:00:00.000Z",
    ]);
  });
});
