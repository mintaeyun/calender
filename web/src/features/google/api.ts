// 구글 연동 API. 상태 조회는 supabase(RLS; refresh_token_enc 는 컬럼 권한이 없어 읽을 수 없다), 동작은 Edge Function `gcal-sync` 호출.
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export type GoogleConnection = {
  id: string;
  google_email: string;
  sync_direction: "import_only" | "two_way";
  /** 로컬 일정을 구글(mycal)에도 만들지 (양방향일 때) */
  push_local: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

export type GoogleCalendar = {
  id: string;
  google_calendar_id: string | null;
  name: string;
  color: string;
  sync_enabled: boolean;
  read_only: boolean;
  event_count: number;
};

export type SyncResult =
  | { status: "ok" | "partial"; calendars: number; stats: { upserted: number; deleted: number; pages: number; resynced: boolean } }
  | { status: "locked" | "no_connection" | "no_calendars" }
  | { status: "error"; code: string; permanent: boolean };

export class GoogleFnError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function callFn<T>(path: string, body?: unknown): Promise<T> {
  if (!SUPABASE_URL) throw new GoogleFnError(0, "not_configured", "Supabase 설정이 없습니다.");
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new GoogleFnError(401, "unauthorized", "로그인이 필요합니다.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gcal-sync/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new GoogleFnError(res.status, json?.error?.code ?? "error", json?.error?.message ?? "요청에 실패했습니다.");
  return json as T;
}

export async function getConnection(): Promise<GoogleConnection | null> {
  const db = createClient();
  const cols = "id, google_email, sync_direction, last_synced_at, last_error";
  const { data, error } = await db.from("google_connections").select(`${cols}, push_local`).maybeSingle();
  if (!error) return data as unknown as GoogleConnection | null;
  // push_local 컬럼(양방향 마이그레이션)이 아직 없는 DB: 컬럼 없이 다시 읽고 기본값을 채운다.
  if (error.code === "42703") {
    const r = await db.from("google_connections").select(cols).maybeSingle();
    if (r.error) throw r.error;
    return r.data ? ({ ...(r.data as object), push_local: true } as GoogleConnection) : null;
  }
  throw error;
}

export async function listGoogleCalendars(): Promise<GoogleCalendar[]> {
  const db = createClient();
  const { data, error } = await db
    .from("calendars")
    .select("id, google_calendar_id, name, color, sync_enabled, read_only")
    .eq("source", "google")
    .order("name");
  if (error) throw error;
  const out: GoogleCalendar[] = [];

  for (const c of (data ?? []) as Omit<GoogleCalendar, "event_count">[]) {
    const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("calendar_id", c.id).is("deleted_at", null);
    out.push({ ...c, event_count: count ?? 0 });
  }
  return out;
}

/** OAuth 시작: 구글 동의 화면 URL 을 받아 이동한다. 돌아올 때 ?google=<결과> 가 붙는다. */
export async function startConnect(): Promise<string> {
  const returnTo = `${window.location.origin}/settings/google`;
  return (await callFn<{ url: string }>("oauth/start", { return_to: returnTo })).url;
}

export const syncNow = () => callFn<SyncResult>("sync");
/** 로컬 변경만 구글로 보낸다(일정 저장 직후). 양방향이 아니면 skipped. */
export const pushNow = () => callFn<{ status: string }>("push");
export const refreshCalendarList = () => callFn<{ calendars: GoogleCalendar[]; target_found: boolean; target_name: string }>("calendars");
export const disconnectGoogle = (deleteEvents = false) => callFn<{ ok: true; had_connection: boolean }>("disconnect", { delete_events: deleteEvents });

export async function setCalendarEnabled(calendarId: string, enabled: boolean) {
  const { error } = await createClient().from("calendars").update({ sync_enabled: enabled }).eq("id", calendarId);
  if (error) throw error;
}

export async function setSyncDirection(direction: GoogleConnection["sync_direction"]) {
  const { error } = await createClient().from("google_connections").update({ sync_direction: direction }).not("id", "is", null);
  if (error) throw error;
}

export async function setPushLocal(enabled: boolean) {
  const { error } = await createClient().from("google_connections").update({ push_local: enabled } as never) /* 마이그레이션 적용 후 타입 재생성하면 캐스트 제거 */.not("id", "is", null);
  if (error) throw error;
}
