// Store 의 실제 구현(Supabase service role). RLS 가 적용되지 않으므로 모든 쿼리에 user_id 조건을 직접 넣는다.
import type { ConvertedEvent } from "./convert.ts";
import type { GoogleCalendarEntry } from "./google.ts";
import type { CalendarOut, ConnAdmin } from "./handlers.ts";
import type { LocalEvent } from "./push-convert.ts";
import type { PushStore } from "./push.ts";
import type { ConnStore, Connection } from "./run.ts";
import type { CalendarState, EventStore, UpsertRow } from "./sync.ts";

// deno-lint-ignore no-explicit-any
type Db = any; // 07 마이그레이션 컬럼이 생성 타입에 반영되기 전에도 컴파일되도록 느슨하게 둔다.

const IN_CHUNK = 150;
function* chunked<T>(list: T[], size: number): Generator<T[]> {
  for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size);
}
const fail = (what: string, error: { message?: string } | null): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown"}`);
};

/** google_synced_at 에 이 값을 쓰면 DB 트리거가 그 행의 updated_at 으로 바꿔 저장한다("구글과 일치" 표시). */
const STAMP = "infinity";

type Existing = { id: string; exdates: string[]; google_event_id: string | null; updated_at: string; google_synced_at: string | null; calendar_id: string | null; deleted_at: string | null };

/** 로컬에서 고쳤는데 아직 구글에 반영되지 않은 행인가 (updated_at > google_synced_at) */
const isDirty = (e: Pick<Existing, "updated_at" | "google_synced_at">) =>
  e.google_synced_at !== null && Date.parse(e.updated_at) > Date.parse(e.google_synced_at);

export class DbStore implements EventStore, ConnStore, ConnAdmin, PushStore {
  constructor(private db: Db, private userId: string) {}

  // --- EventStore ---
  private async existingByGoogleIds(googleIds: string[]): Promise<Map<string, Existing>> {
    const out = new Map<string, Existing>();
    for (const part of chunked(googleIds, IN_CHUNK)) {
      const { data, error } = await this.db.from("events")
        .select("id, google_event_id, exdates, updated_at, google_synced_at, calendar_id, deleted_at")
        .eq("user_id", this.userId).in("google_event_id", part);
      if (error) fail("events 조회 실패", error);
      for (const r of data ?? []) out.set(r.google_event_id, { ...r, exdates: r.exdates ?? [] });
    }
    return out;
  }

  /** 앱이 push 한 일정은 로컬 캘린더에 있으므로 캘린더와 무관하게 사용자 전체에서 찾는다. */
  async findByGoogleIds(_calendarId: string, googleIds: string[]) {
    const m = await this.existingByGoogleIds(googleIds);
    return new Map([...m].map(([g, v]) => [g, { id: v.id, exdates: v.exdates }]));
  }

  async upsertEvents(calendarId: string, rows: UpsertRow[]) {
    const existing = await this.existingByGoogleIds(rows.map((r) => r.google_event_id));

    // push 도중 끊겨 로컬에 구글 id 가 기록되지 않은 일정: appEventId 로 로컬 행을 찾아 연결한다.
    const appIds = rows.filter((r) => !existing.has(r.google_event_id) && r.app_event_id).map((r) => r.app_event_id!);
    const adopt = new Map<string, Existing>();
    for (const part of chunked(appIds, IN_CHUNK)) {
      const { data, error } = await this.db.from("events")
        .select("id, google_event_id, exdates, updated_at, google_synced_at, calendar_id, deleted_at")
        .eq("user_id", this.userId).in("id", part).is("google_event_id", null);
      if (error) fail("events 조회 실패", error);
      for (const r of data ?? []) adopt.set(r.id, { ...r, exdates: r.exdates ?? [] });
    }

    const result = new Map<string, string>();
    const payload: Record<string, unknown>[] = [];
    for (const r of rows) {
      const ex = existing.get(r.google_event_id) ?? (r.app_event_id ? adopt.get(r.app_event_id) : undefined);
      if (ex && isDirty(ex)) {
        // 로컬 변경이 아직 구글에 반영되지 않았다(push 실패 등). 구글 값으로 덮어쓰지 않는다 — 다음 push 가 처리한다.
        result.set(r.google_event_id, ex.id);
        continue;
      }
      payload.push({
        ...(ex ? { id: ex.id } : { calendar_id: calendarId }), // 기존 일정의 캘린더(로컬 캘린더 포함)는 옮기지 않는다
        user_id: this.userId,
        google_event_id: r.google_event_id,
        google_etag: r.google_etag,
        google_updated_at: r.google_updated_at,
        google_synced_at: STAMP,
        google_seen_run: r.seen_run,
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
      });
    }
    if (payload.length) {
      // 새 행은 id 가 없어 insert, 기존 행은 id 로 update 된다(부분 유니크 인덱스는 onConflict 에 쓸 수 없다).
      const { data, error } = await this.db.from("events").upsert(payload, { onConflict: "id", defaultToNull: false }).select("id, google_event_id");
      if (error) fail("events upsert 실패", error);
      for (const r of data ?? []) result.set(r.google_event_id, r.id);
    }
    return result;
  }

  async softDeleteByGoogleIds(_calendarId: string, googleIds: string[]) {
    const now = new Date().toISOString();
    let n = 0;
    const existing = await this.existingByGoogleIds(googleIds);
    // 로컬에서 고친 뒤 아직 push 되지 않은 일정은 지우지 않는다(다음 push 가 충돌로 처리한다).
    const targets = googleIds.filter((g) => {
      const e = existing.get(g);
      return e && !e.deleted_at && !isDirty(e);
    });
    for (const part of chunked(targets, IN_CHUNK)) {
      const { data, error } = await this.db.from("events").update({ deleted_at: now, google_synced_at: STAMP })
        .eq("user_id", this.userId).in("google_event_id", part).is("deleted_at", null).select("id");
      if (error) fail("events 삭제 실패", error);
      const ids: string[] = (data ?? []).map((r: { id: string }) => r.id);
      n += ids.length;
      if (ids.length) {
        // 삭제된 마스터의 예외 인스턴스도 함께 삭제
        const { data: kids, error: e2 } = await this.db.from("events").update({ deleted_at: now, google_synced_at: STAMP })
          .eq("user_id", this.userId).in("recurring_event_id", ids).is("deleted_at", null).select("id");
        if (e2) fail("예외 인스턴스 삭제 실패", e2);
        n += (kids ?? []).length;
      }
    }
    return n;
  }

  async addExdates(_calendarId: string, masterGoogleId: string, iso: string[]) {
    const { data, error } = await this.db.from("events").select("id, exdates, updated_at, google_synced_at")
      .eq("user_id", this.userId).eq("google_event_id", masterGoogleId).maybeSingle();
    if (error) fail("마스터 조회 실패", error);
    if (!data || isDirty(data)) return;
    const merged = [...new Set([...(data.exdates ?? []), ...iso])];
    const { error: e2 } = await this.db.from("events").update({ exdates: merged, google_synced_at: STAMP }).eq("id", data.id).eq("user_id", this.userId);
    if (e2) fail("exdates 갱신 실패", e2);
  }

  async softDeleteStale(calendarId: string, window: { min: string; max: string }, runId: string) {
    const { data, error } = await this.db.rpc("gcal_soft_delete_stale_run", {
      p_user: this.userId, p_calendar: calendarId, p_min: window.min, p_max: window.max, p_run: runId,
    });
    if (error) fail("정리 실패", error);
    return Number(data ?? 0);
  }

  // --- PushStore ---
  async listCandidates(userId: string, includeLocal: boolean): Promise<LocalEvent[]> {
    const { data, error } = await this.db.rpc("gcal_push_candidates", { p_user: userId, p_include_local: includeLocal });
    if (error) fail("push 후보 조회 실패", error);
    return (data ?? []) as LocalEvent[];
  }

  async getGoogleIdOf(userId: string, localId: string) {
    const { data } = await this.db.from("events").select("google_event_id").eq("user_id", userId).eq("id", localId).maybeSingle();
    return (data?.google_event_id as string | null | undefined) ?? null;
  }

  async markPushed(userId: string, id: string, v: { google_event_id: string; google_etag: string | null; google_updated_at: string | null }) {
    const { error } = await this.db.from("events").update({ ...v, google_synced_at: STAMP }).eq("user_id", userId).eq("id", id);
    if (error) fail("push 결과 기록 실패", error);
  }

  async markSynced(userId: string, id: string) {
    const { error } = await this.db.from("events").update({ google_synced_at: STAMP }).eq("user_id", userId).eq("id", id);
    if (error) fail("동기화 표시 실패", error);
  }

  async detachGoogle(userId: string, id: string) {
    const { error } = await this.db.from("events").update({ google_event_id: null, google_etag: null, google_updated_at: null, google_synced_at: null }).eq("user_id", userId).eq("id", id);
    if (error) fail("구글 연결 해제 실패", error);
  }

  async applyRemote(userId: string, id: string, ev: ConvertedEvent) {
    const { error } = await this.db.from("events").update({
      title: ev.title, start_at: ev.start_at, end_at: ev.end_at, all_day: ev.all_day, location: ev.location, notes: ev.notes,
      rrule: ev.rrule, exdates: ev.exdates, google_event_id: ev.google_event_id, google_etag: ev.google_etag,
      google_updated_at: ev.google_updated_at, google_synced_at: STAMP, deleted_at: null,
    }).eq("user_id", userId).eq("id", id);
    if (error) fail("원격 값 적용 실패", error);
  }

  // --- ConnStore ---
  async getConnection(userId: string): Promise<Connection | null> {
    const { data, error } = await this.db.from("google_connections")
      .select("refresh_token_enc, sync_direction, push_local, sync_token_by_calendar").eq("user_id", userId).maybeSingle();
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
    const { data, error } = await this.db.from("calendars").select("id, google_calendar_id, name, read_only")
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

  async log(userId: string, kind: "conflict" | "error" | "info", detail: Record<string, unknown>) {
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
    // 처음 연결의 기본 방향은 양방향(사용자 요구). 설정에서 가져오기만으로 되돌릴 수 있다.
    const { error: e3 } = await this.db.from("google_connections").insert({ user_id: userId, sync_direction: "two_way", ...v });
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
      const { error: e2 } = await this.db.from("events").update({ deleted_at: new Date().toISOString(), google_synced_at: STAMP })
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
