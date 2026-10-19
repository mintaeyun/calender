import { test } from "vitest";
import assert from "node:assert/strict";
import { expandEvents, type EventRow } from "./recurrence.ts";
import { allDayDates, formatLocal, offsetMinutes, parseInput } from "./datetime.ts";
import { listEvents, searchEvents, findFreeTimeTool } from "../tools/events.ts";

const TZ = "Asia/Seoul";
const base: EventRow = {
  id: "m1", title: "스탠드업", start_at: "2026-10-12T00:30:00Z", end_at: "2026-10-12T01:00:00Z", all_day: false,
  location: null, notes: null, calendar_id: null, rrule: null, recurring_event_id: null, original_start_at: null, exdates: [], deleted_at: null,
};
const ev = (o: Partial<EventRow>): EventRow => ({ ...base, ...o });
const range = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) });
const starts = (r: ReturnType<typeof expandEvents>) => r.map((x) => x.start.toISOString());

// web recurrence.test.ts 의 expandEvents 케이스와 같은 기대값 (동등성 확인)
test("expand: 비반복·매일·매주(KST 요일)·매월", () => {
  assert.equal(expandEvents([ev({})], range("2026-10-12T00:00:00Z", "2026-10-13T00:00:00Z"), TZ).length, 1);
  assert.equal(expandEvents([ev({})], range("2026-10-13T00:00:00Z", "2026-10-14T00:00:00Z"), TZ).length, 0);
  assert.deepEqual(starts(expandEvents([ev({ rrule: "FREQ=DAILY" })], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ)),
    ["2026-10-12T00:30:00.000Z", "2026-10-13T00:30:00.000Z", "2026-10-14T00:30:00.000Z"]);
  const w = ev({ start_at: "2026-10-11T23:00:00Z", end_at: "2026-10-12T00:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE" });
  assert.deepEqual(starts(expandEvents([w], range("2026-10-11T00:00:00Z", "2026-10-19T00:00:00Z"), TZ)),
    ["2026-10-11T23:00:00.000Z", "2026-10-13T23:00:00.000Z", "2026-10-18T23:00:00.000Z"]);
  assert.equal(expandEvents([ev({ rrule: "FREQ=MONTHLY" })], range("2026-10-01T00:00:00Z", "2027-01-31T00:00:00Z"), TZ).length, 4);
});

test("expand: COUNT/UNTIL/exdates/예외 인스턴스/삭제", () => {
  assert.equal(expandEvents([ev({ rrule: "FREQ=DAILY;COUNT=3" })], range("2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z"), TZ).length, 3);
  assert.equal(expandEvents([ev({ rrule: "FREQ=DAILY;UNTIL=20261014T145959Z" })], range("2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z"), TZ).length, 3);
  assert.deepEqual(starts(expandEvents([ev({ rrule: "FREQ=DAILY", exdates: ["2026-10-13T00:30:00Z"] })], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ)),
    ["2026-10-12T00:30:00.000Z", "2026-10-14T00:30:00.000Z"]);
  const exc = ev({ id: "x1", title: "변경됨", recurring_event_id: "m1", original_start_at: "2026-10-13T00:30:00Z", start_at: "2026-10-13T05:00:00Z", end_at: "2026-10-13T06:00:00Z" });
  const r = expandEvents([ev({ rrule: "FREQ=DAILY" }), exc], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ);
  assert.deepEqual(starts(r), ["2026-10-12T00:30:00.000Z", "2026-10-13T05:00:00.000Z", "2026-10-14T00:30:00.000Z"]);
  assert.equal(r[1].isException, true);
  assert.equal(expandEvents([ev({ rrule: "FREQ=DAILY", deleted_at: "2026-10-12T00:00:00Z" })], range("2026-10-12T00:00:00Z", "2026-10-15T00:00:00Z"), TZ).length, 0);
});

test("datetime: 시간대 없는 값은 KST, 날짜만은 시작/끝, 포맷·종일", () => {
  assert.equal(parseInput("2026-10-15T15:00:00", TZ).toISOString(), "2026-10-15T06:00:00.000Z");
  assert.equal(parseInput("2026-10-15T15:00:00+09:00", TZ).toISOString(), "2026-10-15T06:00:00.000Z");
  assert.equal(parseInput("2026-10-15", TZ, "start").toISOString(), "2026-10-14T15:00:00.000Z");
  assert.equal(parseInput("2026-10-15", TZ, "end").toISOString(), "2026-10-15T15:00:00.000Z");
  assert.throws(() => parseInput("내일", TZ), /해석/);
  assert.equal(formatLocal(new Date("2026-10-15T06:00:00Z"), TZ), "2026-10-15T15:00:00+09:00");
  assert.equal(offsetMinutes(new Date("2026-10-15T06:00:00Z"), TZ), 540);
  // 10/17~10/18 종일 = end_at 10/19 00:00 (exclusive)
  assert.deepEqual(allDayDates(new Date("2026-10-16T15:00:00Z"), new Date("2026-10-18T15:00:00Z"), TZ), { start: "2026-10-17", end: "2026-10-18" });
});

// 체이닝 가능한 가짜 select (await 시 rows 반환). 호출된 필터를 기록한다.
function ctxWith(tables: Record<string, unknown[]>) {
  const log: { table: string; calls: [string, unknown[]][] }[] = [];
  const db = {
    userId: "u1",
    select(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] };
      log.push(entry);
      // deno-lint-ignore no-explicit-any
      const b: any = new Proxy({}, {
        get: (_t, p: string) => p === "then"
          ? (res: (v: unknown) => void) => res({ data: entry.calls.some(([n]) => n === "in") ? [] : (tables[table] ?? []), error: null }) // in() = 예외 행 조회
          : (...args: unknown[]) => (entry.calls.push([p, args]), b),
      });
      return b;
    },
  };
  return { ctx: { db: db as never, tz: TZ, scopes: { calendar: "write", todo: "write", ledger: "write" } as const }, log };
}

test("list_events: 반복 전개, 시간 일정은 +09:00 표기", async () => {
  const { ctx, log } = ctxWith({ events: [ev({ rrule: "FREQ=DAILY" })], calendars: [] });
  // deno-lint-ignore no-explicit-any
  const out: any = await listEvents(ctx, { start: "2026-10-12", end: "2026-10-13" });
  assert.equal(out.events.length, 2); // 10/12, 10/13
  assert.equal(out.events[0].start, "2026-10-12T09:30:00+09:00");
  assert.equal(out.events[0].recurring, true);
  assert.ok(log.some((l) => l.table === "events"));
});

test("list_events: 종일 표시, 400일·역순 기간 거부", async () => {
  const allday = ev({ id: "a1", title: "휴가", all_day: true, start_at: "2026-10-16T15:00:00Z", end_at: "2026-10-18T15:00:00Z" });
  const { ctx } = ctxWith({ events: [allday], calendars: [] });
  // deno-lint-ignore no-explicit-any
  const out: any = await listEvents(ctx, { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual([out.events[0].start, out.events[0].end], ["2026-10-17", "2026-10-18"]);
  await assert.rejects(() => listEvents(ctx, { start: "2025-01-01", end: "2026-10-31" }), /400일/);
  await assert.rejects(() => listEvents(ctx, { start: "2026-10-10", end: "2026-10-01" }), /이후/);
});

test("search_events: 검색어에서 필터 문법 문자 제거, 일치 항목만", async () => {
  const { ctx, log } = ctxWith({
    events: [ev({ title: "치과 예약" }), ev({ id: "z", title: "회의", start_at: "2026-10-13T00:30:00Z", end_at: "2026-10-13T01:00:00Z" })],
    calendars: [],
  });
  // deno-lint-ignore no-explicit-any
  const none: any = await searchEvents(ctx, { query: "치과),title.eq.x", start: "2026-10-01", end: "2026-10-31" });
  assert.equal(none.events.length, 0);
  const orArgs = log.flatMap((l) => l.calls).filter(([n]) => n === "or").map(([, a]) => String(a[0])).join("|");
  assert.ok(!orArgs.includes("),title.eq.x"));
  // deno-lint-ignore no-explicit-any
  const ok: any = await searchEvents(ctx, { query: "치과", start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(ok.events.map((e: { title: string }) => e.title), ["치과 예약"]);
});

test("find_free_time: 종일 제외, 일정 사이 빈 구간(KST 표기)", async () => {
  const meeting = ev({ id: "m", title: "회의", start_at: "2026-10-14T01:00:00Z", end_at: "2026-10-14T03:00:00Z" }); // 수 10:00-12:00 KST
  const allday = ev({ id: "h", all_day: true, start_at: "2026-10-13T15:00:00Z", end_at: "2026-10-14T15:00:00Z" });
  const { ctx } = ctxWith({ events: [meeting, allday] });
  // deno-lint-ignore no-explicit-any
  const out: any = await findFreeTimeTool(ctx, { start: "2026-10-14", end: "2026-10-14", duration_min: 60 });
  assert.deepEqual(out.free_slots.map((s: { start: string; end: string }) => [s.start, s.end]), [
    ["2026-10-14T09:00:00+09:00", "2026-10-14T10:00:00+09:00"],
    ["2026-10-14T12:00:00+09:00", "2026-10-14T18:00:00+09:00"],
  ]);
});
