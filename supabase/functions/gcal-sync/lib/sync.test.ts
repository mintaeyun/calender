import { beforeEach, describe, expect, it } from "vitest";
import { encryptToken, keyRingFromEnv } from "./crypto.ts";
import type { GoogleEvent } from "./convert.ts";
import { FakeGoogle, FakeStore, gone } from "./fake.ts";
import { GoogleApiError } from "./google.ts";
import { syncUser } from "./run.ts";
import { normalizeState, syncCalendar } from "./sync.ts";

const NOW = new Date("2026-10-14T03:00:00Z");
const TZ = "Asia/Seoul";
let store: FakeStore;
let api: FakeGoogle;

beforeEach(() => {
  store = new FakeStore();
  api = new FakeGoogle();
});

const timed = (id: string, summary: string, start = "2026-10-15T15:00:00+09:00", end = "2026-10-15T16:00:00+09:00", extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id, summary, etag: `"${id}-1"`, start: { dateTime: start }, end: { dateTime: end }, ...extra,
});

function run(state = {}, deadlineOffset = 60_000) {
  return syncCalendar(
    { api, store, now: () => NOW, deadline: NOW.getTime() + deadlineOffset, saveState: async (s) => { store.states.cal = s; } },
    { calendarId: "cal-1", googleCalendarId: "primary@x.com", accessToken: "at", tz: TZ, state: normalizeState(state) },
  );
}

describe("최초 가져오기", () => {
  it("일반·종일·반복·예외를 가져오고 syncToken 을 저장", async () => {
    api.pages.push({
      items: [
        timed("a", "치과"),
        { id: "b", summary: "가족 여행", start: { date: "2026-10-17" }, end: { date: "2026-10-19" } },
        timed("m", "스탠드업", "2026-10-12T09:30:00+09:00", "2026-10-12T10:00:00+09:00", { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"] }),
        // 예외가 마스터보다 먼저 와도 된다(같은 페이지)
        timed("m_20261014", "변경", "2026-10-14T14:00:00+09:00", "2026-10-14T15:00:00+09:00", { recurringEventId: "m", originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" } }),
      ].reverse(),
      nextSyncToken: "tok-1",
    });
    const r = await run();
    expect(r.done).toBe(true);
    expect(r.state).toEqual({ syncToken: "tok-1", mode: "incremental" });
    expect(store.live()).toHaveLength(4);

    const master = store.byGoogle("m")!;
    const exc = store.byGoogle("m_20261014")!;
    expect(exc.recurring_event_id).toBe(master.id);
    expect(exc.original_start_at).toBe("2026-10-14T00:30:00.000Z");
    expect(master.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    const trip = store.byGoogle("b")!;
    expect([trip.all_day, trip.start_at, trip.end_at]).toEqual([true, "2026-10-16T15:00:00.000Z", "2026-10-18T15:00:00.000Z"]);
  });

  it("과거 1개월 ~ 미래 1년 범위, singleEvents 없이 요청", async () => {
    api.pages.push({ items: [], nextSyncToken: "t" });
    await run();
    const p = api.calls[0].params;
    expect(p.syncToken).toBeUndefined();
    expect(p.timeMin).toBe("2026-09-13T03:00:00.000Z");
    expect(p.timeMax).toBe("2027-10-14T03:00:00.000Z");
  });

  it("여러 페이지를 모두 처리하고 마지막 페이지의 syncToken 만 저장", async () => {
    api.pages.push({ items: [timed("a", "A")], nextPageToken: "p2" }, { items: [timed("b", "B")], nextSyncToken: "tok" });
    const r = await run();
    expect(r.stats.pages).toBe(2);
    expect(api.calls[1].params.pageToken).toBe("p2");
    expect(api.calls[1].params.timeMin).toBe(api.calls[0].params.timeMin); // 같은 창으로 이어간다
    expect(r.state.syncToken).toBe("tok");
    expect(store.live()).toHaveLength(2);
  });

  it("시간 예산을 넘으면 중단하고 pageToken 으로 이어간다", async () => {
    api.pages.push({ items: [timed("a", "A")], nextPageToken: "p2" });
    const first = await run({}, -1); // 이미 예산 초과
    expect(first.done).toBe(false);
    expect(first.state.pageToken).toBe("p2");
    expect(store.live()).toHaveLength(1);

    api.pages.push({ items: [timed("b", "B")], nextSyncToken: "tok" });
    const second = await run(first.state);
    expect(second.done).toBe(true);
    expect(api.calls[1].params.pageToken).toBe("p2");
    expect(store.live()).toHaveLength(2);
  });

  it("마스터가 같은 응답에 없으면 구글에서 직접 가져온다", async () => {
    api.events.set("m", timed("m", "스탠드업", "2026-10-12T09:30:00+09:00", "2026-10-12T10:00:00+09:00", { recurrence: ["RRULE:FREQ=DAILY"] }));
    api.pages.push({
      items: [timed("m_x", "변경", "2026-10-14T14:00:00+09:00", "2026-10-14T15:00:00+09:00", { recurringEventId: "m", originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" } })],
      nextSyncToken: "t",
    });
    await run();
    expect(store.byGoogle("m")?.rrule).toBe("FREQ=DAILY");
    expect(store.byGoogle("m_x")?.recurring_event_id).toBe(store.byGoogle("m")!.id);
  });

  it("마스터를 끝내 못 찾으면 독립 일정으로 보존", async () => {
    api.pages.push({
      items: [timed("orphan", "고아", undefined, undefined, { recurringEventId: "gone-master", originalStartTime: { dateTime: "2026-10-15T15:00:00+09:00" } })],
      nextSyncToken: "t",
    });
    await run();
    const r = store.byGoogle("orphan")!;
    expect([r.recurring_event_id, r.original_start_at]).toEqual([null, null]);
  });
});

describe("증분 동기화", () => {
  beforeEach(async () => {
    api.pages.push({
      items: [
        timed("a", "치과"), timed("b", "삭제될 일정"),
        timed("m", "스탠드업", "2026-10-12T09:30:00+09:00", "2026-10-12T10:00:00+09:00", { recurrence: ["RRULE:FREQ=DAILY"] }),
      ],
      nextSyncToken: "tok-1",
    });
    await run();
  });

  it("syncToken 을 보내 변경·삭제를 반영 (중복 생성 없음)", async () => {
    api.pages.push({
      items: [{ ...timed("a", "치과 (변경)"), etag: '"a-2"' }, { id: "b", status: "cancelled" }, timed("c", "새 일정")],
      nextSyncToken: "tok-2",
    });
    const r = await run({ syncToken: "tok-1", mode: "incremental" });
    expect(api.calls.at(-1)!.params.syncToken).toBe("tok-1");
    expect(api.calls.at(-1)!.params.timeMin).toBeUndefined();
    expect(r.state.syncToken).toBe("tok-2");
    expect(store.byGoogle("a")).toMatchObject({ title: "치과 (변경)", google_etag: '"a-2"' });
    expect(store.rows.filter((x) => x.google_event_id === "a")).toHaveLength(1);
    expect(store.byGoogle("b")!.deleted_at).not.toBeNull();
    expect(store.byGoogle("c")!.deleted_at).toBeNull();
    expect(store.live().map((x) => x.google_event_id).sort()).toEqual(["a", "c", "m"]);
  });

  it("반복의 한 인스턴스 취소 → 마스터 exdates, 마스터를 갱신해도 exdates 유지", async () => {
    api.pages.push({
      items: [{ id: "m_20261014", status: "cancelled", recurringEventId: "m", originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" } }],
      nextSyncToken: "tok-2",
    });
    await run({ syncToken: "tok-1", mode: "incremental" });
    expect(store.byGoogle("m")!.exdates).toEqual(["2026-10-14T00:30:00.000Z"]);

    api.pages.push({ items: [timed("m", "스탠드업 (제목 변경)", "2026-10-12T09:30:00+09:00", "2026-10-12T10:00:00+09:00", { recurrence: ["RRULE:FREQ=DAILY"] })], nextSyncToken: "tok-3" });
    await run({ syncToken: "tok-2", mode: "incremental" });
    expect(store.byGoogle("m")!.title).toBe("스탠드업 (제목 변경)");
    expect(store.byGoogle("m")!.exdates).toEqual(["2026-10-14T00:30:00.000Z"]);
  });

  it("반복 마스터 삭제 시 예외 인스턴스도 삭제", async () => {
    api.pages.push({
      items: [timed("m_x", "변경", "2026-10-14T14:00:00+09:00", "2026-10-14T15:00:00+09:00", { recurringEventId: "m", originalStartTime: { dateTime: "2026-10-14T09:30:00+09:00" } })],
      nextSyncToken: "tok-2",
    });
    await run({ syncToken: "tok-1", mode: "incremental" });
    api.pages.push({ items: [{ id: "m", status: "cancelled" }], nextSyncToken: "tok-3" });
    await run({ syncToken: "tok-2", mode: "incremental" });
    expect(store.live().map((x) => x.google_event_id).sort()).toEqual(["a", "b"]);
  });

  it("삭제됐던 일정이 구글에서 복원되면 다시 보인다", async () => {
    api.pages.push({ items: [{ id: "b", status: "cancelled" }], nextSyncToken: "tok-2" });
    await run({ syncToken: "tok-1", mode: "incremental" });
    api.pages.push({ items: [timed("b", "복원")], nextSyncToken: "tok-3" });
    await run({ syncToken: "tok-2", mode: "incremental" });
    expect(store.byGoogle("b")).toMatchObject({ title: "복원", deleted_at: null });
  });
});

describe("410 전체 재동기화", () => {
  it("토큰을 버리고 다시 가져오며, 구글에서 사라진 일정만 삭제", async () => {
    api.pages.push({ items: [timed("a", "남는 일정"), timed("gone", "사라질 일정")], nextSyncToken: "tok-1" });
    await run();
    expect(store.live()).toHaveLength(2);

    // 시간이 흘러 재동기화 실행(시작 시각이 이전 stamp 보다 뒤)
    const later = new Date(NOW.getTime() + 3_600_000);
    api.pages.push(gone(), { items: [timed("a", "남는 일정")], nextSyncToken: "tok-2" });
    const r = await syncCalendar(
      { api, store, now: () => later, deadline: later.getTime() + 60_000, saveState: async () => {} },
      { calendarId: "cal-1", googleCalendarId: "primary@x.com", accessToken: "at", tz: TZ, state: { syncToken: "tok-1", mode: "incremental" } },
    );
    expect(r.stats.resynced).toBe(true);
    expect(r.state.syncToken).toBe("tok-2");
    expect(store.byGoogle("a")!.deleted_at).toBeNull();
    expect(store.byGoogle("gone")!.deleted_at).not.toBeNull();
    // calls[0]=최초, calls[1]=410 을 받은 증분 요청, calls[2]=syncToken 없이 시간 창으로 재요청
    expect(api.calls[1].params.syncToken).toBe("tok-1");
    expect(api.calls[2].params.syncToken).toBeUndefined();
    expect(api.calls[2].params.timeMin).toBeDefined();
  });

  it("재동기화가 중간에 끊겨도(예산) 확인 안 된 일정을 지우지 않는다", async () => {
    api.pages.push({ items: [timed("a", "A"), timed("b", "B")], nextSyncToken: "tok-1" });
    await run();
    const later = new Date(NOW.getTime() + 3_600_000);
    api.pages.push(gone(), { items: [timed("a", "A")], nextPageToken: "p2" });
    const r = await syncCalendar(
      { api, store, now: () => later, deadline: later.getTime() - 1, saveState: async () => {} },
      { calendarId: "cal-1", googleCalendarId: "primary@x.com", accessToken: "at", tz: TZ, state: { syncToken: "tok-1", mode: "incremental" } },
    );
    expect(r.done).toBe(false);
    expect(store.byGoogle("b")!.deleted_at).toBeNull(); // 아직 b 를 볼 기회가 없었으므로 유지
  });
});

describe("syncUser", () => {
  const ring = keyRingFromEnv((n) => (n === "TOKEN_ENC_KEY" ? btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) : undefined));
  const deps = () => ({ api, events: store, conn: store, ring, now: () => NOW, budgetMs: 60_000 });

  beforeEach(async () => {
    store.conn!.refresh_token_enc = await encryptToken("refresh-token", ring);
  });

  it("성공하면 last_synced_at 기록, last_error 비움, 락 해제", async () => {
    api.pages.push({ items: [timed("a", "A")], nextSyncToken: "t" });
    const r = await syncUser(deps(), "u1");
    expect(r.status).toBe("ok");
    expect(store.result).toEqual({ last_synced_at: NOW.toISOString(), last_error: null });
    expect(store.lockUntil).toBeNull();
    expect(store.states["primary@x.com"].syncToken).toBe("t");
  });

  it("락이 걸려 있으면 건너뜀", async () => {
    store.lockUntil = new Date(NOW.getTime() + 60_000);
    expect((await syncUser(deps(), "u1")).status).toBe("locked");
    expect(api.calls).toHaveLength(0);
  });

  it("invalid_grant 는 last_error 에 남기고 락을 풀며 재시도하지 않음", async () => {
    api.refreshError = new GoogleApiError(400, "invalid_grant", "Google 연결이 만료되었거나 권한이 철회되었습니다.", true);
    const r = await syncUser(deps(), "u1");
    expect(r).toEqual({ status: "error", code: "invalid_grant", permanent: true });
    expect(store.result?.last_error).toMatch(/^invalid_grant:/);
    expect(store.lockUntil).toBeNull();
  });

  it("일시 오류는 last_error 를 바꾸지 않고 로그만", async () => {
    api.pages.push(new GoogleApiError(503, "server", "Google 서버 오류입니다.", false));
    const r = await syncUser(deps(), "u1");
    expect(r).toMatchObject({ status: "error", permanent: false });
    expect(store.result).toBeNull();
    expect(store.logs).toHaveLength(1);
  });

  it("캘린더가 구글에서 사라졌으면(404) 그 캘린더만 건너뜀", async () => {
    store.calendars.push({ id: "cal-2", google_calendar_id: "other@x.com", name: " My Cal " });
    api.pages.push(new GoogleApiError(404, "not_found", "x", false), { items: [timed("z", "Z")], nextSyncToken: "t" });
    const r = await syncUser(deps(), "u1");
    expect(r.status).toBe("ok");
    expect(store.logs[0].detail).toMatchObject({ calendar: "mycal" });
    expect(store.byGoogle("z")).toBeDefined();
  });

  it("mycal 이 아닌 캘린더는 선택돼 있어도 동기화하지 않는다", async () => {
    store.calendars.push({ id: "cal-x", google_calendar_id: "family@x.com", name: "가족" });
    api.pages.push({ items: [timed("a", "A")], nextSyncToken: "t" });
    await syncUser(deps(), "u1");
    expect(api.calls.map((c) => c.calendarId)).toEqual(["primary@x.com"]);
  });

  it("연결 없음 / 선택된 캘린더 없음", async () => {
    store.calendars = [];
    expect((await syncUser(deps(), "u1")).status).toBe("no_calendars");
    store.conn = null;
    expect((await syncUser(deps(), "u1")).status).toBe("no_connection");
  });
});
