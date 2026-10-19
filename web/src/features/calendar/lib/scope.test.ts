import { describe, expect, it } from "vitest";
import { expandEvents, type EventRow } from "./recurrence";
import { planDelete, planEdit, type EventFields, type Op } from "./scope";

const TZ = "Asia/Seoul";
// 매주 월·수 09:30 KST, 10회
const master: EventRow = {
  id: "m", user_id: "u", calendar_id: "c1", title: "스탠드업",
  start_at: "2026-10-12T00:30:00Z", end_at: "2026-10-12T01:00:00Z", all_day: false,
  location: null, notes: null, color: null, rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10",
  recurring_event_id: null, original_start_at: null, exdates: [],
  google_event_id: null, google_etag: null, google_updated_at: null, google_synced_at: null, google_seen_run: null, deleted_at: null, created_at: "", updated_at: "",
};
const fieldsOf = (r: EventRow, o: Partial<EventFields> = {}): EventFields => ({
  title: r.title, start_at: r.start_at, end_at: r.end_at, all_day: r.all_day, location: r.location,
  notes: r.notes, color: r.color, calendar_id: r.calendar_id, rrule: r.rrule, ...o,
});
const wed = new Date("2026-10-14T00:30:00Z"); // 첫 수요일 발생
const nextMon = new Date("2026-10-19T00:30:00Z");

/** Op 를 메모리 행 집합에 적용해 결과를 확인하는 미니 인터프리터 */
function apply(rows: EventRow[], ops: Op[]): EventRow[] {
  const out = rows.map((r) => ({ ...r }));
  const refs: Record<string, string> = {};
  let n = 0;
  for (const o of ops) {
    if (o.op === "update") Object.assign(out.find((r) => r.id === o.id)!, o.patch);
    else if (o.op === "softDelete") out.find((r) => r.id === o.id)!.deleted_at = "now";
    else if (o.op === "insert") {
      const id = `new${++n}`;
      refs[o.ref] = id;
      out.push({ ...master, ...o.row, id, deleted_at: null });
    } else if (o.op === "reparent") {
      Object.assign(out.find((r) => r.id === o.id)!, { recurring_event_id: refs[o.toRef], ...o.patch });
    }
  }
  return out;
}
const range = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") };
const list = (rows: EventRow[]) => expandEvents(rows, range, TZ).map((i) => `${i.event.title}|${i.start.toISOString().slice(5, 16)}`);

describe("planEdit", () => {
  it("이번만: 예외 행을 만들고 마스터는 그대로", () => {
    const ops = planEdit({ master, exceptions: [], target: { instanceStart: wed }, scope: "this", tz: TZ,
      fields: fieldsOf(master, { title: "변경", start_at: "2026-10-14T02:00:00Z", end_at: "2026-10-14T03:00:00Z" }) });
    expect(ops).toHaveLength(1);
    const rows = apply([master], ops);
    const l = list(rows);
    expect(l).toContain("변경|10-14T02:00");
    expect(l).not.toContain("스탠드업|10-14T00:30");
    expect(l).toHaveLength(10); // 횟수는 그대로
    expect(rows.find((r) => r.recurring_event_id)?.original_start_at).toBe(wed.toISOString());
  });

  it("이번만: 이미 예외 행이면 그 행만 수정", () => {
    const exc: EventRow = { ...master, id: "x", rrule: null, recurring_event_id: "m", original_start_at: wed.toISOString(), start_at: "2026-10-14T02:00:00Z", end_at: "2026-10-14T03:00:00Z" };
    const ops = planEdit({ master, exceptions: [exc], target: { instanceStart: new Date(exc.start_at), exception: exc }, scope: "this", tz: TZ,
      fields: fieldsOf(exc, { title: "또 변경" }) });
    expect(ops).toEqual([{ op: "update", id: "x", patch: expect.objectContaining({ title: "또 변경" }) }]);
  });

  it("전체: 제목 변경이 모든 발생에 적용", () => {
    const ops = planEdit({ master, exceptions: [], target: { instanceStart: wed }, scope: "all", tz: TZ, fields: fieldsOf(master, { title: "새 제목", start_at: wed.toISOString(), end_at: "2026-10-14T01:00:00Z" }) });
    const l = list(apply([master], ops));
    expect(l).toHaveLength(10);
    expect(l.every((x) => x.startsWith("새 제목"))).toBe(true);
  });

  it("전체: 수요일 인스턴스의 시간을 +1시간 옮기면 전체가 +1시간", () => {
    const ops = planEdit({ master, exceptions: [], target: { instanceStart: wed }, scope: "all", tz: TZ,
      fields: fieldsOf(master, { start_at: "2026-10-14T01:30:00Z", end_at: "2026-10-14T02:00:00Z" }) });
    const l = list(apply([master], ops));
    expect(l[0]).toBe("스탠드업|10-12T01:30");
    expect(l).toHaveLength(10);
  });

  it("이후 전체: 이전 발생은 유지, 이후는 새 시리즈(횟수 보존)", () => {
    const ops = planEdit({ master, exceptions: [], target: { instanceStart: nextMon }, scope: "following", tz: TZ,
      fields: fieldsOf(master, { title: "새 스탠드업", start_at: nextMon.toISOString(), end_at: "2026-10-19T01:00:00Z" }) });
    const rows = apply([master], ops);
    const l = list(rows);
    expect(l).toHaveLength(10); // 2(월·수) + 새 시리즈 8
    expect(l.slice(0, 2)).toEqual(["스탠드업|10-12T00:30", "스탠드업|10-14T00:30"]);
    expect(l.slice(2).every((x) => x.startsWith("새 스탠드업"))).toBe(true);
    expect(rows.find((r) => r.id === "new1")?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8");
  });

  it("이후 전체: 첫 발생이면 전체와 동일(새 행을 만들지 않음)", () => {
    const ops = planEdit({ master, exceptions: [], target: { instanceStart: new Date(master.start_at) }, scope: "following", tz: TZ, fields: fieldsOf(master, { title: "X" }) });
    expect(ops.some((o) => o.op === "insert")).toBe(false);
  });

  it("이후 전체: 이후의 예외 행은 새 마스터로 이동", () => {
    const exc: EventRow = { ...master, id: "x", rrule: null, title: "예외", recurring_event_id: "m", original_start_at: "2026-10-21T00:30:00Z", start_at: "2026-10-21T05:00:00Z", end_at: "2026-10-21T06:00:00Z" };
    const ops = planEdit({ master, exceptions: [exc], target: { instanceStart: nextMon }, scope: "following", tz: TZ,
      fields: fieldsOf(master, { title: "새", start_at: nextMon.toISOString(), end_at: "2026-10-19T01:00:00Z" }) });
    const rows = apply([master, exc], ops);
    expect(rows.find((r) => r.id === "x")?.recurring_event_id).toBe("new1");
    expect(list(rows)).toContain("예외|10-21T05:00");
  });
});

describe("planDelete", () => {
  it("이번만: exdates 에 추가", () => {
    const l = list(apply([master], planDelete({ master, exceptions: [], target: { instanceStart: wed }, scope: "this", tz: TZ })));
    expect(l).toHaveLength(9);
    expect(l).not.toContain("스탠드업|10-14T00:30");
  });

  it("이번만(예외 행): 행 삭제 + 원래 발생이 되살아나지 않음", () => {
    const exc: EventRow = { ...master, id: "x", rrule: null, recurring_event_id: "m", original_start_at: wed.toISOString(), start_at: "2026-10-14T02:00:00Z", end_at: "2026-10-14T03:00:00Z" };
    const l = list(apply([master, exc], planDelete({ master, exceptions: [exc], target: { instanceStart: new Date(exc.start_at), exception: exc }, scope: "this", tz: TZ })));
    expect(l).toHaveLength(9);
  });

  it("이후 전체: 그 시점부터 끝", () => {
    const l = list(apply([master], planDelete({ master, exceptions: [], target: { instanceStart: nextMon }, scope: "following", tz: TZ })));
    expect(l).toEqual(["스탠드업|10-12T00:30", "스탠드업|10-14T00:30"]);
  });

  it("전체: 마스터와 예외 모두 삭제", () => {
    const exc: EventRow = { ...master, id: "x", rrule: null, recurring_event_id: "m", original_start_at: wed.toISOString() };
    expect(list(apply([master, exc], planDelete({ master, exceptions: [exc], target: { instanceStart: wed }, scope: "all", tz: TZ })))).toEqual([]);
  });
});
