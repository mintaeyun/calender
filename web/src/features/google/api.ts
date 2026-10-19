// 구글 연동 API. 상태 조회는 supabase(RLS; refresh_token_enc 는 컬럼 권한이 없어 읽을 수 없다), 동작은 Edge Function `gcal-sync` 호출.
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export type GoogleConnection = {
  id: string;
  google_email: string;
  sync_direction: "import_only" | "two_way";
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
  const { data, error } = await createClient()
    .from("google_connections")
    .select("id, google_email, sync_direction, last_synced_at, last_error")
    .maybeSingle();
  if (error) throw error;
  return data as GoogleConnection | null;
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
  // read_only 컬럼은 07 마이그레이션 적용 후 생성 타입에 들어온다(그 전에는 unknown 경유).
  for (const c of (data ?? []) as unknown as Omit<GoogleCalendar, "event_count">[]) {
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
export const refreshCalendarList = () => callFn<{ calendars: GoogleCalendar[] }>("calendars");
export const disconnectGoogle = (deleteEvents = false) => callFn<{ ok: true; had_connection: boolean }>("disconnect", { delete_events: deleteEvents });

export async function setCalendarEnabled(calendarId: string, enabled: boolean) {
  const { error } = await createClient().from("calendars").update({ sync_enabled: enabled }).eq("id", calendarId);
  if (error) throw error;
}

export async function setSyncDirection(direction: GoogleConnection["sync_direction"]) {
  const { error } = await createClient().from("google_connections").update({ sync_direction: direction }).not("id", "is", null);
  if (error) throw error;
}
