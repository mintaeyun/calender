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
  calendars: { id: string; google_calendar_id: string; name: string }[] = [{ id: "cal-1", google_calendar_id: "primary@x.com", name: "mycal" }];
  tz = "Asia/Seoul";
  result: { last_synced_at?: string; last_error: string | null } | null = null;
  logs: { kind: string; detail: Record<string, unknown> }[] = [];
  states: Record<string, CalendarState> = {};

  live = () => this.rows.filter((r) => !r.deleted_at);
  byGoogle = (g: string) => this.rows.find((r) => r.google_event_id === g);

  async findByGoogleIds(calendarId: string, ids: string[]) {
    const m = new Map<string, { id: string; exdates: string[] }>();
    for (const r of this.rows) if (r.calendar_id === calendarId && ids.includes(r.google_event_id)) m.set(r.google_event_id, { id: r.id, exdates: r.exdates });
    return m;
  }

  async upsertEvents(calendarId: string, rows: UpsertRow[]) {
    const out = new Map<string, string>();
    for (const row of rows) {
      const existing = this.rows.find((r) => r.calendar_id === calendarId && r.google_event_id === row.google_event_id);
      if (existing) {
        Object.assign(existing, row, { exdates: [...new Set([...existing.exdates, ...row.exdates])], deleted_at: null });
        out.set(row.google_event_id, existing.id);
      } else {
        const id = `ev-${++this.seq}`;
        this.rows.push({ ...row, id, calendar_id: calendarId, deleted_at: null });
        out.set(row.google_event_id, id);
      }
    }
    return out;
  }

  async softDeleteByGoogleIds(calendarId: string, ids: string[]) {
    let n = 0;
    for (const r of this.rows) {
      if (r.calendar_id !== calendarId || r.deleted_at) continue;
      const parent = this.rows.find((p) => p.id === r.recurring_event_id);
      if (ids.includes(r.google_event_id) || (parent && ids.includes(parent.google_event_id))) { r.deleted_at = "now"; n++; }
    }
    return n;
  }

  async addExdates(calendarId: string, masterGoogleId: string, iso: string[]) {
    const m = this.rows.find((r) => r.calendar_id === calendarId && r.google_event_id === masterGoogleId);
    if (m) m.exdates = [...new Set([...m.exdates, ...iso])];
  }

  async softDeleteStale(calendarId: string, window: { min: string; max: string }, before: string) {
    let n = 0;
    for (const r of this.rows) {
      if (r.calendar_id !== calendarId || r.deleted_at) continue;
      const inWindow = r.rrule ? r.start_at < window.max : r.start_at < window.max && r.end_at >= window.min;
      if (inWindow && (!r.google_synced_at || r.google_synced_at < before)) { r.deleted_at = "now"; n++; }
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
  async log(_u: string, kind: "error" | "info", detail: Record<string, unknown>) { this.logs.push({ kind, detail }); }
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
}

export const gone = () => new GoogleApiError(410, "gone", "gone", false);
