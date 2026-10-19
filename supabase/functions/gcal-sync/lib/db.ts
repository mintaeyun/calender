// Store 의 실제 구현(Supabase service role). RLS 가 적용되지 않으므로 모든 쿼리에 user_id 조건을 직접 넣는다.
import type { CalendarOut, ConnAdmin } from "./handlers.ts";
import type { GoogleCalendarEntry } from "./google.ts";
import type { ConnStore, Connection } from "./run.ts";
import type { CalendarState, EventStore, UpsertRow } from "./sync.ts";

// deno-lint-ignore no-explicit-any
type Db = any; // 07 마이그레이션 컬럼(sync_lock_until, google_synced_at …)이 생성 타입에 반영되기 전에도 컴파일되도록 느슨하게 둔다.

const IN_CHUNK = 150;
function* chunked<T>(list: T[], size: number): Generator<T[]> {
  for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size);
}
const fail = (what: string, error: { message?: string } | null): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown"}`);
};

export class DbStore implements EventStore, ConnStore, ConnAdmin {
  constructor(private db: Db, private userId: string) {}

  // --- EventStore ---
  async findByGoogleIds(calendarId: string, googleIds: string[]) {
    const out = new Map<string, { id: string; exdates: string[] }>();
    for (const part of chunked(googleIds, IN_CHUNK)) {
      const { data, error } = await this.db.from("events").select("id, google_event_id, exdates")
        .eq("user_id", this.userId).eq("calendar_id", calendarId).in("google_event_id", part);
      if (error) fail("events 조회 실패", error);
      for (const r of data ?? []) out.set(r.google_event_id, { id: r.id, exdates: r.exdates ?? [] });
    }
    return out;
  }

  async upsertEvents(calendarId: string, rows: UpsertRow[]) {
    const existing = await this.findByGoogleIds(calendarId, rows.map((r) => r.google_event_id));
    const payload = rows.map((r) => {
      const ex = existing.get(r.google_event_id);
      return {
        ...(ex ? { id: ex.id } : {}),
        user_id: this.userId,
        calendar_id: calendarId,
        google_event_id: r.google_event_id,
        google_etag: r.google_etag,
        google_updated_at: r.google_updated_at,
        google_synced_at: r.google_synced_at,
        title: r.title,
        start_at: r.start_at,
        end_at: r.end_at,
        all_day: r.all_day,
        location: r.location,
        notes: r.notes,
        rrule: r.rrule,
        // 구글의 EXDATE 와, 이전에 취소 인스턴스로 쌓인 exdates 의 합집합
        exdates: [...new Set([...(ex?.exdates ?? []), ...r.exdates])],
        recurring_event_id: r.recurring_event_id,
        original_start_at: r.original_start_at,
        deleted_at: null, // 삭제됐다가 구글에서 복원된 일정을 되살린다
        // color 는 쓰지 않는다(사용자가 앱에서 정한 색을 보존하고, 없으면 캘린더 색을 따른다)
      };
    });
    // 새 행은 id 가 없어 insert, 기존 행은 id 로 update 된다(부분 유니크 인덱스는 onConflict 에 쓸 수 없다).
    const { data, error } = await this.db.from("events").upsert(payload, { onConflict: "id", defaultToNull: false }).select("id, google_event_id");
    if (error) fail("events upsert 실패", error);
    return new Map<string, string>((data ?? []).map((r: { id: string; google_event_id: string }) => [r.google_event_id, r.id]));
  }

  async softDeleteByGoogleIds(calendarId: string, googleIds: string[]) {
    const now = new Date().toISOString();
    let n = 0;
    for (const part of chunked(googleIds, IN_CHUNK)) {
      const { data, error } = await this.db.from("events").update({ deleted_at: now })
        .eq("user_id", this.userId).eq("calendar_id", calendarId).in("google_event_id", part).is("deleted_at", null).select("id");
      if (error) fail("events 삭제 실패", error);
      const ids: string[] = (data ?? []).map((r: { id: string }) => r.id);
      n += ids.length;
      if (ids.length) {
        // 삭제된 마스터의 예외 인스턴스도 함께 삭제
        const { data: kids, error: e2 } = await this.db.from("events").update({ deleted_at: now })
          .eq("user_id", this.userId).in("recurring_event_id", ids).is("deleted_at", null).select("id");
        if (e2) fail("예외 인스턴스 삭제 실패", e2);
        n += (kids ?? []).length;
      }
    }
    return n;
  }

  async addExdates(calendarId: string, masterGoogleId: string, iso: string[]) {
    const { data, error } = await this.db.from("events").select("id, exdates")
      .eq("user_id", this.userId).eq("calendar_id", calendarId).eq("google_event_id", masterGoogleId).maybeSingle();
    if (error) fail("마스터 조회 실패", error);
    if (!data) return;
    const merged = [...new Set([...(data.exdates ?? []), ...iso])];
    const { error: e2 } = await this.db.from("events").update({ exdates: merged }).eq("id", data.id).eq("user_id", this.userId);
    if (e2) fail("exdates 갱신 실패", e2);
  }

  async softDeleteStale(calendarId: string, window: { min: string; max: string }, before: string) {
    const { data, error } = await this.db.rpc("gcal_soft_delete_stale", {
      p_user: this.userId, p_calendar: calendarId, p_min: window.min, p_max: window.max, p_before: before,
    });
    if (error) fail("정리 실패", error);
    return Number(data ?? 0);
  }

  // --- ConnStore ---
  async getConnection(userId: string): Promise<Connection | null> {
    const { data, error } = await this.db.from("google_connections")
      .select("refresh_token_enc, sync_direction, sync_token_by_calendar").eq("user_id", userId).maybeSingle();
    if (error) fail("연결 조회 실패", error);
    return data ?? null;
  }

  async tryLock(userId: string, until: Date, now: Date) {
    const { data, error } = await this.db.from("google_connections")
      .update({ sync_lock_until: until.toISOString() })
      .eq("user_id", userId)
      .or(`sync_lock_until.is.null,sync_lock_until.lte.${now.toISOString()}`)
      .select("id");
    if (error) fail("락 획득 실패", error);
    return (data ?? []).length > 0;
  }

  async unlock(userId: string) {
    await this.db.from("google_connections").update({ sync_lock_until: null }).eq("user_id", userId);
  }

  async getTimezone(userId: string) {
    const { data } = await this.db.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    return data?.timezone ?? "Asia/Seoul";
  }

  async listSyncCalendars(userId: string) {
    const { data, error } = await this.db.from("calendars").select("id, google_calendar_id, name")
      .eq("user_id", userId).eq("source", "google").eq("sync_enabled", true).not("google_calendar_id", "is", null);
    if (error) fail("캘린더 조회 실패", error);
    return data ?? [];
  }

  async saveCalendarState(userId: string, googleCalendarId: string, state: CalendarState) {
    const { data } = await this.db.from("google_connections").select("sync_token_by_calendar").eq("user_id", userId).maybeSingle();
    const merged = { ...(data?.sync_token_by_calendar ?? {}), [googleCalendarId]: state };
    const { error } = await this.db.from("google_connections").update({ sync_token_by_calendar: merged }).eq("user_id", userId);
    if (error) fail("동기화 상태 저장 실패", error);
  }

  async markResult(userId: string, r: { last_synced_at?: string; last_error: string | null }) {
    const { error } = await this.db.from("google_connections").update(r).eq("user_id", userId);
    if (error) fail("결과 기록 실패", error);
  }

  async log(userId: string, kind: "error" | "info", detail: Record<string, unknown>) {
    await this.db.from("sync_logs").insert({ user_id: userId, kind, detail });
  }

  // --- ConnAdmin ---
  async upsertConnection(userId: string, v: { google_email: string; refresh_token_enc: string }) {
    const { data: existing, error } = await this.db.from("google_connections").select("id").eq("user_id", userId).maybeSingle();
    if (error) fail("연결 조회 실패", error);
    if (existing) {
      // 재연결: 토큰·이메일을 바꾸고 오류·락을 초기화한다. sync_direction 과 동기화 상태는 유지.
      const { error: e2 } = await this.db.from("google_connections")
        .update({ ...v, last_error: null, sync_lock_until: null }).eq("user_id", userId);
      if (e2) fail("연결 갱신 실패", e2);
      return { created: false };
    }
    const { error: e3 } = await this.db.from("google_connections").insert({ user_id: userId, ...v });
    if (e3) fail("연결 생성 실패", e3);
    return { created: true };
  }

  async upsertCalendars(userId: string, entries: GoogleCalendarEntry[], enableIds: string[]) {
    const { data, error } = await this.db.from("calendars").select("id, google_calendar_id")
      .eq("user_id", userId).eq("source", "google");
    if (error) fail("캘린더 조회 실패", error);
    const byGoogle = new Map<string, string>((data ?? []).map((r: { id: string; google_calendar_id: string }) => [r.google_calendar_id, r.id]));
    for (const e of entries) {
      const fields = {
        name: e.summary || e.id,
        color: e.backgroundColor ?? "#8d8d94",
        google_access_role: e.accessRole,
        read_only: e.accessRole === "reader" || e.accessRole === "freeBusyReader",
      };
      const id = byGoogle.get(e.id);
      const res = id
        ? await this.db.from("calendars").update(fields).eq("id", id).eq("user_id", userId)
        : await this.db.from("calendars").insert({
          user_id: userId, source: "google", google_calendar_id: e.id, sync_enabled: enableIds.includes(e.id), ...fields,
        });
      if (res.error) fail("캘린더 저장 실패", res.error);
    }
  }

  async listGoogleCalendars(userId: string): Promise<CalendarOut[]> {
    const { data, error } = await this.db.from("calendars")
      .select("id, google_calendar_id, name, color, sync_enabled, read_only, google_access_role")
      .eq("user_id", userId).eq("source", "google").order("name");
    if (error) fail("캘린더 조회 실패", error);
    const out: CalendarOut[] = [];
    for (const c of data ?? []) {
      const { count } = await this.db.from("events").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("calendar_id", c.id).is("deleted_at", null);
      out.push({ ...c, event_count: count ?? 0 });
    }
    return out;
  }

  async deleteConnection(userId: string) {
    const { data } = await this.db.from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
    const { error } = await this.db.from("google_connections").delete().eq("user_id", userId);
    if (error) fail("연결 삭제 실패", error);
    return (data?.refresh_token_enc as string | undefined) ?? null;
  }

  async disconnectCalendars(userId: string, deleteEvents: boolean) {
    const { data, error } = await this.db.from("calendars").select("id").eq("user_id", userId).eq("source", "google");
    if (error) fail("캘린더 조회 실패", error);
    const ids: string[] = (data ?? []).map((r: { id: string }) => r.id);
    if (!ids.length) return;
    const { error: e1 } = await this.db.from("calendars").update({ sync_enabled: false }).eq("user_id", userId).in("id", ids);
    if (e1) fail("동기화 중지 실패", e1);
    if (deleteEvents) {
      const { error: e2 } = await this.db.from("events").update({ deleted_at: new Date().toISOString() })
        .eq("user_id", userId).in("calendar_id", ids).is("deleted_at", null);
      if (e2) fail("일정 삭제 실패", e2);
      const { error: e3 } = await this.db.from("calendars").delete().eq("user_id", userId).in("id", ids);
      if (e3) fail("캘린더 삭제 실패", e3);
    }
  }

  async getRefreshToken(userId: string) {
    const { data } = await this.db.from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
    return (data?.refresh_token_enc as string | undefined) ?? null;
  }

  async listConnectedUsers() {
    const { data, error } = await this.db.from("google_connections").select("user_id");
    if (error) fail("연결 목록 조회 실패", error);
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }
}
