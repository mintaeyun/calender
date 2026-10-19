import { beforeEach, describe, expect, it } from "vitest";
import { FakeGoogle, FakePushStore } from "./fake.ts";
import { GoogleApiError } from "./google.ts";
import { pushChanges } from "./push.ts";
import { allDayDates, instanceId, recurrenceLines, rruleForGoogle, toGoogleBody } from "./push-convert.ts";

const TZ = "Asia/Seoul";
let api: FakeGoogle;
let store: FakePushStore;

beforeEach(() => {
  api = new FakeGoogle();
  store = new FakePushStore();
});

const run = (includeLocal = true) =>
  pushChanges({ api, store, accessToken: "at", googleCalendarId: "mycal@group", tz: TZ }, "u1", { includeLocal });

describe("신규 일정 생성", () => {
  it("로컬 일정을 구글에 만들고 id·etag 를 기록, 두 번째 push 는 아무것도 하지 않음", async () => {
    store.add({ id: "L1", title: "치과", location: "강남역", notes: "정기검진" });
    const s = await run();
    expect(s).toMatchObject({ created: 1, updated: 0, errors: 0 });
    const e = store.get("L1");
    expect(e.google_event_id).toBe("g1");
    expect(e.google_etag).toBe('"g1-1"');
    expect(store.isClean("L1")).toBe(true);

    const body = api.ops[0].body!;
    expect(body).toMatchObject({
      summary: "치과", location: "강남역", description: "정기검진",
      start: { dateTime: "2026-10-15T06:00:00.000Z", timeZone: TZ }, end: { dateTime: "2026-10-15T07:00:00.000Z", timeZone: TZ },
      extendedProperties: { private: { appEventId: "L1" } },
    });
    expect(body).not.toHaveProperty("recurrence"); // null 필드는 생성 시 보내지 않는다

    api.ops.length = 0;
    expect(await run()).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    expect(api.ops).toHaveLength(0);
  });

  it("push_local=false 면 신규 로컬 일정은 보내지 않는다", async () => {
    store.add({ id: "L1" });
    expect((await run(false)).created).toBe(0);
    expect(store.get("L1").google_event_id).toBeNull();
  });

  it("이전 push 가 구글에는 만들고 기록에 실패했다면 중복 생성하지 않고 연결한다 (appEventId)", async () => {
    store.add({ id: "L1", title: "점심" });
    api.events.set("gx", { id: "gx", etag: '"gx-1"', status: "confirmed", summary: "점심", updated: "2026-10-14T03:00:00Z", extendedProperties: { private: { appEventId: "L1" } } });
    const s = await run();
    expect(s.created).toBe(0);
    expect(api.ops.filter((o) => o.op === "insert")).toHaveLength(0);
    expect(store.get("L1").google_event_id).toBe("gx");
  });

  it("종일 일정은 날짜(end exclusive)로 보낸다", async () => {
    store.add({ id: "L1", all_day: true, start_at: "2026-10-16T15:00:00.000Z", end_at: "2026-10-18T15:00:00.000Z" });
    await run();
    expect(api.ops[0].body).toMatchObject({ start: { date: "2026-10-17" }, end: { date: "2026-10-19" } });
  });
});

describe("수정", () => {
  beforeEach(async () => {
    store.add({ id: "L1", title: "원래 제목" });
    await run();
    api.ops.length = 0;
  });

  it("앱에서 고치면 If-Match 로 patch", async () => {
    store.edit("L1", { title: "바뀐 제목", location: null });
    const s = await run();
    expect(s.updated).toBe(1);
    expect(api.ops[0]).toMatchObject({ op: "patch", id: "g1", etag: '"g1-1"' });
    expect(api.ops[0].body).toMatchObject({ summary: "바뀐 제목", location: null }); // 비운 필드는 null 로 지운다
    expect(store.isClean("L1")).toBe(true);
    expect(store.get("L1").google_etag).not.toBe('"g1-1"');
  });

  it("충돌 — 앱 수정이 더 최근이면 앱 값을 채택하고 덮어쓴 구글 값을 로그에 남긴다", async () => {
    api.remoteEdit("g1", { summary: "구글에서 고침" }); // 원격 updated = 03:00:03
    store.edit("L1", { title: "앱에서 고침" }); // 로컬 updated = 05:00:01 (더 최근)
    const s = await run();
    expect(s.conflicts).toBe(1);
    expect(api.events.get("g1")!.summary).toBe("앱에서 고침");
    const log = store.logs.find((l) => l.kind === "conflict")!;
    expect(log.detail).toMatchObject({ winner: "local", overwritten: { title: "구글에서 고침" } });
    expect(store.isClean("L1")).toBe(true);
  });

  it("충돌 — 구글 수정이 더 최근이면 구글 값을 채택하고 덮어쓴 앱 값을 로그에 남긴다", async () => {
    store.edit("L1", { title: "앱에서 고침" }); // 05:00:01
    api.clock = Date.parse("2026-10-14T09:00:00Z");
    api.remoteEdit("g1", { summary: "구글에서 나중에 고침", start: { dateTime: "2026-10-15T18:00:00+09:00" }, end: { dateTime: "2026-10-15T19:00:00+09:00" } });
    const s = await run();
    expect(s.conflicts).toBe(1);
    expect(store.get("L1").title).toBe("구글에서 나중에 고침");
    expect(store.get("L1").start_at).toBe("2026-10-15T09:00:00.000Z");
    expect(store.logs.find((l) => l.kind === "conflict")!.detail).toMatchObject({ winner: "remote", overwritten: { title: "앱에서 고침" } });
    expect(store.isClean("L1")).toBe(true);
  });

  it("구글에서 이미 삭제된 일정을 앱에서 고쳤다면 데이터를 잃지 않게 다시 만든다", async () => {
    api.events.delete("g1");
    store.edit("L1", { title: "고쳤는데 구글엔 없음" });
    const s = await run();
    expect(s.conflicts).toBe(1);
    expect(store.get("L1").google_event_id).not.toBe("g1");
    expect(store.get("L1").google_event_id).toBeTruthy();
    expect([...api.events.values()].some((e) => e.summary === "고쳤는데 구글엔 없음")).toBe(true);
  });
});

describe("삭제", () => {
  beforeEach(async () => {
    store.add({ id: "L1", title: "지울 일정" });
    await run();
    api.ops.length = 0;
  });

  it("앱에서 소프트 삭제하면 구글에서도 삭제 (If-Match)", async () => {
    store.edit("L1", { deleted_at: "2026-10-14T06:00:00Z" });
    const s = await run();
    expect(s.deleted).toBe(1);
    expect(api.ops[0]).toMatchObject({ op: "delete", id: "g1", etag: '"g1-1"' });
    expect(api.events.get("g1")!.status).toBe("cancelled");
    expect(store.isClean("L1")).toBe(true);
    api.ops.length = 0;
    await run();
    expect(api.ops).toHaveLength(0); // 다시 보내지 않는다
  });

  it("구글에 처음부터 없던(한 번도 push 안 된) 삭제는 건드리지 않는다", async () => {
    store.add({ id: "L2", deleted_at: "2026-10-14T06:00:00Z" });
    const s = await run();
    expect(s.deleted).toBe(0);
    expect(api.ops).toHaveLength(0);
  });

  it("삭제 vs 구글 수정 — 구글이 더 최근이면 삭제를 되돌리고 구글 값을 채택", async () => {
    store.edit("L1", { deleted_at: "2026-10-14T06:00:00Z" }); // 05:00:01
    api.clock = Date.parse("2026-10-14T09:00:00Z");
    api.remoteEdit("g1", { summary: "삭제하려는 사이에 구글에서 고침" });
    await run();
    expect(api.events.get("g1")!.status).toBe("confirmed");
    expect(store.get("L1")).toMatchObject({ deleted_at: null, title: "삭제하려는 사이에 구글에서 고침" });
    expect(store.logs.some((l) => l.kind === "conflict")).toBe(true);
  });

  it("삭제 vs 구글 수정 — 앱 삭제가 더 최근이면 구글에서도 삭제", async () => {
    api.remoteEdit("g1", { summary: "먼저 고침" }); // 03:00:01
    store.edit("L1", { deleted_at: "2026-10-14T06:00:00Z" }); // 05:00:xx (더 최근)
    await run();
    expect(api.events.get("g1")!.status).toBe("cancelled");
    expect(store.isClean("L1")).toBe(true);
  });
});

describe("반복 일정", () => {
  it("마스터(RRULE+EXDATE)와 예외 인스턴스를 순서대로 push", async () => {
    store.add({ id: "M", title: "스탠드업", start_at: "2026-10-12T00:30:00.000Z", end_at: "2026-10-12T01:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE", exdates: ["2026-10-19T00:30:00.000Z"] });
    store.add({
      id: "X", title: "변경됨", recurring_event_id: "M", original_start_at: "2026-10-14T00:30:00.000Z",
      start_at: "2026-10-14T05:00:00.000Z", end_at: "2026-10-14T06:00:00.000Z",
    });
    // 예외가 먼저 만들어져도 마스터가 먼저 처리돼야 한다
    store.events.reverse();
    await run();

    expect(api.ops[0]).toMatchObject({ op: "insert" });
    expect(api.ops[0].body!.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;TZID=Asia/Seoul:20261019T093000"]);
    expect(api.ops[1]).toMatchObject({ op: "patch", id: "g1_20261014T003000Z" });
    expect(api.ops[1].body).not.toHaveProperty("recurrence");
    expect(store.get("X").google_event_id).toBe("g1_20261014T003000Z");
    expect(store.isClean("X")).toBe(true);
  });

  it("마스터가 아직 구글에 없으면 예외는 건너뛴다", async () => {
    store.add({ id: "X", recurring_event_id: "M", original_start_at: "2026-10-14T00:30:00.000Z" });
    store.add({ id: "M" });
    store.get("M").google_event_id = null;
    store.events = store.events.filter((e) => e.id === "X"); // 마스터 행이 후보에 없는 상황
    const s = await run();
    expect(s.skipped).toBe(1);
  });
});

describe("오류 격리", () => {
  it("한 일정이 실패해도 나머지는 계속, 로그를 남긴다", async () => {
    store.add({ id: "L1", title: "boom" });
    store.add({ id: "L2", title: "정상" });
    const orig = api.insertEvent.bind(api);
    api.insertEvent = async (at, c, body) => {
      if (body.summary === "boom") throw new GoogleApiError(500, "server", "서버 오류", false);
      return orig(at, c, body);
    };
    const s = await run();
    expect(s).toMatchObject({ created: 1, errors: 1 });
    expect(store.get("L2").google_event_id).toBeTruthy();
    expect(store.get("L1").google_event_id).toBeNull();
    expect(store.logs.some((l) => l.kind === "error")).toBe(true);
  });

  it("영구 오류(권한)는 전체를 중단하고 던진다", async () => {
    store.add({ id: "L1" });
    api.insertEvent = async () => { throw new GoogleApiError(403, "forbidden", "권한 없음", true); };
    await expect(run()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("push-convert", () => {
  it("종일 날짜 범위 (end 는 항상 시작 이후)", () => {
    expect(allDayDates("2026-10-16T15:00:00.000Z", "2026-10-18T15:00:00.000Z", TZ)).toEqual({ start: "2026-10-17", end: "2026-10-19" });
    expect(allDayDates("2026-10-16T15:00:00.000Z", "2026-10-16T15:00:00.000Z", TZ)).toEqual({ start: "2026-10-17", end: "2026-10-18" });
  });

  it("종일 반복의 UNTIL 은 날짜 형식으로, 시간 반복은 그대로", () => {
    expect(rruleForGoogle("FREQ=DAILY;UNTIL=20261231T145959Z", true, TZ)).toBe("FREQ=DAILY;UNTIL=20261231");
    expect(rruleForGoogle("FREQ=DAILY;UNTIL=20261231T145959Z", false, TZ)).toBe("FREQ=DAILY;UNTIL=20261231T145959Z");
    expect(rruleForGoogle("FREQ=WEEKLY;COUNT=3", true, TZ)).toBe("FREQ=WEEKLY;COUNT=3");
  });

  it("EXDATE: 시간은 TZID 벽시계, 종일은 VALUE=DATE", () => {
    expect(recurrenceLines({ rrule: "FREQ=DAILY", exdates: ["2026-10-13T00:30:00.000Z"], all_day: false }, TZ)).toEqual(["RRULE:FREQ=DAILY", "EXDATE;TZID=Asia/Seoul:20261013T093000"]);
    expect(recurrenceLines({ rrule: "FREQ=DAILY", exdates: ["2026-10-12T15:00:00.000Z"], all_day: true }, TZ)).toEqual(["RRULE:FREQ=DAILY", "EXDATE;VALUE=DATE:20261013"]);
    expect(recurrenceLines({ rrule: null, exdates: [], all_day: false }, TZ)).toBeNull();
  });

  it("인스턴스 id", () => {
    expect(instanceId("abc", "2026-10-14T00:30:00.000Z", false, TZ)).toBe("abc_20261014T003000Z");
    expect(instanceId("abc", "2026-10-13T15:00:00.000Z", true, TZ)).toBe("abc_20261014");
  });

  it("반복이 해제되면 recurrence 를 null 로 보낸다(구글에서 제거)", () => {
    const ev = { id: "L", title: "t", start_at: "2026-10-15T06:00:00.000Z", end_at: "2026-10-15T07:00:00.000Z", all_day: false, location: null, notes: null, rrule: null, exdates: [], recurring_event_id: null, original_start_at: null, google_event_id: "g", google_etag: null, deleted_at: null, updated_at: "", calendar_id: null };
    expect(toGoogleBody(ev, TZ)).toHaveProperty("recurrence", null);
  });
});
