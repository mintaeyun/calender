// 테스트용 인메모리 Store / 구글 API 가짜. (프로덕션 코드에서 import 하지 않는다)
import { GoogleApiError, type EventsPage, type GoogleApi, type GoogleCalendarEntry, type ListEventsParams } from "./google.ts";
import type { GoogleEvent } from "./convert.ts";
import type { CalendarOut, ConnAdmin } from "./handlers.ts";
import type { ConnStore, Connection } from "./run.ts";
import type { CalendarState, EventStore, UpsertRow } from "./sync.ts";

export type FakeRow = UpsertRow & { id: string; calendar_id: string; deleted_at: string | null };

export class FakeStore implements EventStore, ConnStore, ConnAdmin {
  rows: FakeRow[] = [];
  private seq = 0;
  conn: Connection | null = { refresh_token_enc: "enc", sync_direction: "import_only", sync_token_by_calendar: {} };
  lockUntil: Date | null = null;
  calendars: { id: string; google_calendar_id: string; name: string; read_only?: boolean }[] = [{ id: "cal-1", google_calendar_id: "primary@x.com", name: "mycal" }];
  tz = "Asia/Seoul";
  result: { last_synced_at?: string; last_error: string | null } | null = null;
  logs: { kind: string; detail: Record<string, unknown> }[] = [];
  states: Record<string, CalendarState> = {};

  live = () => this.rows.filter((r) => !r.deleted_at);
  byGoogle = (g: string) => this.rows.find((r) => r.google_event_id === g);

  async findByGoogleIds(calendarId: string, ids: string[]) {
    const m = new Map<string, { id: string; exdates: string[] }>();
    void calendarId; // 사용자 전체에서 찾는다(앱이 push 한 일정은 로컬 캘린더에 있다)
    for (const r of this.rows) if (ids.includes(r.google_event_id)) m.set(r.google_event_id, { id: r.id, exdates: r.exdates });
    return m;
  }

  async upsertEvents(calendarId: string, rows: UpsertRow[]) {
    const out = new Map<string, string>();
    for (const row of rows) {
      const existing = this.rows.find((r) => r.google_event_id === row.google_event_id);
      if (existing) {
        const { recurring_event_id, ...rest } = row;
        Object.assign(existing, rest, { recurring_event_id }, { exdates: [...new Set([...existing.exdates, ...row.exdates])], deleted_at: null });
        out.set(row.google_event_id, existing.id);
      } else {
        const id = `ev-${++this.seq}`;
        this.rows.push({ ...row, id, calendar_id: calendarId, deleted_at: null });
        out.set(row.google_event_id, id);
      }
    }
    return out;
  }

  async softDeleteByGoogleIds(_calendarId: string, ids: string[]) {
    let n = 0;
    for (const r of this.rows) {
      if (r.deleted_at) continue;
      const parent = this.rows.find((p) => p.id === r.recurring_event_id);
      if (ids.includes(r.google_event_id) || (parent && ids.includes(parent.google_event_id))) { r.deleted_at = "now"; n++; }
    }
    return n;
  }

  async addExdates(_calendarId: string, masterGoogleId: string, iso: string[]) {
    const m = this.rows.find((r) => r.google_event_id === masterGoogleId);
    if (m) m.exdates = [...new Set([...m.exdates, ...iso])];
  }

  async softDeleteStale(calendarId: string, window: { min: string; max: string }, runId: string) {
    let n = 0;
    for (const r of this.rows) {
      if (r.calendar_id !== calendarId || r.deleted_at) continue;
      const inWindow = r.rrule ? r.start_at < window.max : r.start_at < window.max && r.end_at >= window.min;
      if (inWindow && r.seen_run !== runId) { r.deleted_at = "now"; n++; }
    }
    return n;
  }

  // --- ConnStore ---
  async getConnection() { return this.conn; }
  async tryLock(_u: string, until: Date, now: Date) {
    if (this.lockUntil && this.lockUntil > now) return false;
    this.lockUntil = until;
    return true;
  }
  async unlock() { this.lockUntil = null; }
  async getTimezone() { return this.tz; }
  async listSyncCalendars() { return this.calendars; }
  async saveCalendarState(_u: string, gcal: string, state: CalendarState) {
    this.states[gcal] = state;
    if (this.conn) this.conn.sync_token_by_calendar = { ...(this.conn.sync_token_by_calendar ?? {}), [gcal]: state };
  }
  async markResult(_u: string, r: { last_synced_at?: string; last_error: string | null }) { this.result = r; }
  async log(_u: string, kind: "conflict" | "error" | "info", detail: Record<string, unknown>) { this.logs.push({ kind, detail }); }
  async listConnectedUsers() { return this.conn ? ["u1"] : []; }

  // --- ConnAdmin ---
  calendarRows: CalendarOut[] = [];
  deleteEventsCalled: boolean | null = null;
  email = "";
  async upsertConnection(_u: string, v: { google_email: string; refresh_token_enc: string }) {
    const created = !this.conn;
    this.conn = { refresh_token_enc: v.refresh_token_enc, sync_direction: "import_only", sync_token_by_calendar: this.conn?.sync_token_by_calendar ?? {} };
    this.email = v.google_email;
    return { created };
  }
  async upsertCalendars(_u: string, entries: GoogleCalendarEntry[], enableIds: string[]) {
    for (const e of entries) {
      const existing = this.calendarRows.find((c) => c.google_calendar_id === e.id);
      const read_only = e.accessRole === "reader" || e.accessRole === "freeBusyReader";
      if (existing) Object.assign(existing, { name: e.summary, color: e.backgroundColor ?? "#8d8d94", google_access_role: e.accessRole, read_only });
      else {
        this.calendarRows.push({
          id: "c-" + e.id, google_calendar_id: e.id, name: e.summary, color: e.backgroundColor ?? "#8d8d94",
          sync_enabled: enableIds.includes(e.id), read_only, google_access_role: e.accessRole, event_count: 0,
        });
      }
    }
  }
  async listGoogleCalendars() { return this.calendarRows; }
  async deleteConnection() {
    const enc = this.conn?.refresh_token_enc ?? null;
    this.conn = null;
    return enc;
  }
  async disconnectCalendars(_u: string, deleteEvents: boolean) {
    this.deleteEventsCalled = deleteEvents;
    for (const c of this.calendarRows) c.sync_enabled = false;
  }
  async getRefreshToken() { return this.conn?.refresh_token_enc ?? null; }
}

/** 시나리오를 직접 구성하는 가짜 구글 API: 호출 순서대로 응답 큐를 소비한다. */
export class FakeGoogle implements GoogleApi {
  calls: { calendarId: string; params: ListEventsParams }[] = [];
  pages: (EventsPage | GoogleApiError)[] = [];
  events = new Map<string, GoogleEvent>();
  refreshError: GoogleApiError | null = null;
  revoked: string[] = [];

  authUrl = () => "https://accounts.example/auth";
  exchange: { refreshToken: string | null; accessToken: string } = { refreshToken: "refresh-token-plain", accessToken: "access" };
  calendarList: GoogleCalendarEntry[] = [];
  revokeError = false;
  async exchangeCode() { return this.exchange; }
  async refreshAccessToken() {
    if (this.refreshError) throw this.refreshError;
    return "access";
  }
  async revoke(t: string) {
    this.revoked.push(t);
    if (this.revokeError) throw new Error("revoke failed");
  }
  async listCalendars(): Promise<GoogleCalendarEntry[]> { return this.calendarList; }
  async listEvents(_at: string, calendarId: string, params: ListEventsParams) {
    this.calls.push({ calendarId, params });
    const next = this.pages.shift();
    if (!next) throw new Error("no more fake pages");
    if (next instanceof GoogleApiError) throw next;
    return next;
  }
  async getEvent(_at: string, _c: string, id: string) { return this.events.get(id) ?? null; }

  // --- push 용 원격 모델: events 맵을 구글 쪽 저장소로 쓴다 ---
  /** 원격 시계(updated 값). */
  clock = Date.parse("2026-10-14T03:00:00Z");
  private seq = 0;
  /** push 호출 기록 */
  ops: { op: string; id?: string; etag?: string | null; body?: Record<string, unknown> }[] = [];
  private tick() { this.clock += 1000; return new Date(this.clock).toISOString(); }

  async insertEvent(_at: string, _c: string, body: Record<string, unknown>) {
    const id = `g${++this.seq}`;
    const ev = { ...(body as object), id, etag: `"${id}-1"`, updated: this.tick(), status: "confirmed" } as GoogleEvent;
    this.events.set(id, ev);
    this.ops.push({ op: "insert", id, body });
    return ev;
  }
  async patchEvent(_at: string, _c: string, id: string, body: Record<string, unknown>, etag?: string | null) {
    this.ops.push({ op: "patch", id, etag, body });
    let cur = this.events.get(id);
    if (!cur && /_\d{8}/.test(id)) {
      // 반복 인스턴스 id 를 처음 수정하면 구글이 예외 이벤트를 만든다
      cur = { id, etag: `"${id}-0"`, status: "confirmed", updated: this.tick() } as GoogleEvent;
      this.events.set(id, cur);
    }
    if (!cur) throw new GoogleApiError(404, "not_found", "x", false);
    if (etag && etag !== cur.etag) throw new GoogleApiError(412, "precondition_failed", "x", false);
    const next = { ...cur } as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    next.etag = `"${id}-${++this.seq + 1}"`;
    next.updated = this.tick();
    this.events.set(id, next as unknown as GoogleEvent);
    return next as unknown as GoogleEvent;
  }
  async deleteEvent(_at: string, _c: string, id: string, etag?: string | null) {
    this.ops.push({ op: "delete", id, etag });
    const cur = this.events.get(id);
    if (!cur) return;
    if (etag && etag !== cur.etag) throw new GoogleApiError(412, "precondition_failed", "x", false);
    this.events.set(id, { ...cur, status: "cancelled" });
  }
  async findByAppEventId(_at: string, _c: string, appId: string) {
    return [...this.events.values()].find((e) => e.status !== "cancelled" && e.extendedProperties?.private?.appEventId === appId) ?? null;
  }
  /** 구글 앱에서 일정을 고친 것처럼 etag/updated 를 바꾼다 */
  remoteEdit(id: string, patch: Partial<GoogleEvent>) {
    const cur = this.events.get(id)!;
    this.events.set(id, { ...cur, ...patch, etag: `"${id}-remote${++this.seq}"`, updated: this.tick() });
  }
}

export const gone = () => new GoogleApiError(410, "gone", "gone", false);

/** push 테스트용 로컬 저장소: events 행 + "구글과 마지막으로 맞춘 updated_at" 을 흉내 낸다. */
import type { LocalEvent } from "./push-convert.ts";
import type { PushStore } from "./push.ts";
import type { ConvertedEvent } from "./convert.ts";

export class FakePushStore implements PushStore {
  events: LocalEvent[] = [];
  /** id → 구글과 일치한 시점의 updated_at (없으면 한 번도 맞춘 적 없음) */
  syncedAt = new Map<string, string>();
  logs: { kind: string; detail: Record<string, unknown> }[] = [];
  private clock = Date.parse("2026-10-14T05:00:00Z");

  /** 앱에서 일정을 고친 것처럼 updated_at 을 올린다 */
  edit(id: string, patch: Partial<LocalEvent>) {
    this.clock += 1000;
    Object.assign(this.events.find((e) => e.id === id)!, patch, { updated_at: new Date(this.clock).toISOString() });
  }
  add(e: Partial<LocalEvent> & { id: string }): LocalEvent {
    this.clock += 1000;
    const row: LocalEvent = {
      title: "일정", start_at: "2026-10-15T06:00:00.000Z", end_at: "2026-10-15T07:00:00.000Z", all_day: false, location: null, notes: null,
      rrule: null, exdates: [], recurring_event_id: null, original_start_at: null, google_event_id: null, google_etag: null,
      deleted_at: null, calendar_id: "local-1", updated_at: new Date(this.clock).toISOString(), ...e,
    };
    this.events.push(row);
    return row;
  }
  get = (id: string) => this.events.find((e) => e.id === id)!;
  isClean = (id: string) => this.syncedAt.get(id) === this.get(id).updated_at;

  async listCandidates(_u: string, includeLocal: boolean) {
    return this.events
      .filter((e) => (!e.google_event_id && !e.deleted_at && includeLocal) || (e.google_event_id && this.syncedAt.has(e.id) && e.updated_at > this.syncedAt.get(e.id)!))
      .sort((a, b) => Number(!!a.recurring_event_id) - Number(!!b.recurring_event_id) || a.updated_at.localeCompare(b.updated_at));
  }
  async getGoogleIdOf(_u: string, id: string) { return this.get(id)?.google_event_id ?? null; }
  async markPushed(_u: string, id: string, v: { google_event_id: string; google_etag: string | null; google_updated_at: string | null }) {
    const e = this.get(id);
    e.google_event_id = v.google_event_id;
    e.google_etag = v.google_etag;
    this.syncedAt.set(id, e.updated_at);
  }
  async markSynced(_u: string, id: string) { this.syncedAt.set(id, this.get(id).updated_at); }
  async detachGoogle(_u: string, id: string) {
    const e = this.get(id);
    e.google_event_id = null;
    e.google_etag = null;
    this.syncedAt.delete(id);
  }
  async applyRemote(_u: string, id: string, ev: ConvertedEvent) {
    const e = this.get(id);
    Object.assign(e, { title: ev.title, start_at: ev.start_at, end_at: ev.end_at, all_day: ev.all_day, location: ev.location, notes: ev.notes, rrule: ev.rrule, exdates: ev.exdates, google_event_id: ev.google_event_id, google_etag: ev.google_etag, deleted_at: null });
    this.syncedAt.set(id, e.updated_at);
  }
  async log(_u: string, kind: "conflict" | "error" | "info", detail: Record<string, unknown>) { this.logs.push({ kind, detail }); }
}
