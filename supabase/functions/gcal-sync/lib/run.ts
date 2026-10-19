// 사용자 단위 동기화 실행: 락 → 토큰 갱신 → 선택된 캘린더 순회 → 결과 기록.
import { decryptToken, type KeyRing } from "./crypto.ts";
import { GoogleApiError, type GoogleApi } from "./google.ts";
import { pushChanges, type PushStats, type PushStore } from "./push.ts";
import { isTargetCalendar } from "./target.ts";
import { normalizeState, syncCalendar, type CalendarState, type EventStore, type Stats } from "./sync.ts";

export type Connection = {
  refresh_token_enc: string;
  sync_direction: string;
  /** 로컬 일정을 구글(mycal)에도 보낼지 (기본 true) */
  push_local?: boolean;
  sync_token_by_calendar: Record<string, unknown> | null;
};

export interface ConnStore {
  getConnection(userId: string): Promise<Connection | null>;
  /** 락 획득(만료되었거나 없을 때만). 성공하면 true */
  tryLock(userId: string, until: Date, now: Date): Promise<boolean>;
  unlock(userId: string): Promise<void>;
  getTimezone(userId: string): Promise<string>;
  /** sync_enabled 이고 source='google' 인 캘린더 */
  listSyncCalendars(userId: string): Promise<{ id: string; google_calendar_id: string; name: string; read_only?: boolean }[]>;
  saveCalendarState(userId: string, googleCalendarId: string, state: CalendarState): Promise<void>;
  markResult(userId: string, r: { last_synced_at?: string; last_error: string | null }): Promise<void>;
  log(userId: string, kind: "conflict" | "error" | "info", detail: Record<string, unknown>): Promise<void>;
  /** 연결이 있는 모든 사용자 id */
  listConnectedUsers(): Promise<string[]>;
}

export type RunDeps = {
  api: GoogleApi;
  events: EventStore;
  conn: ConnStore;
  ring: KeyRing;
  now: () => Date;
  /** 사용자 한 명에게 쓸 최대 시간(ms) */
  budgetMs: number;
  /** 동기화할 구글 캘린더 이름 (기본 "mycal"). 이 이름이 아닌 캘린더는 선택돼 있어도 건너뛴다. */
  targetName?: string;
  /** 양방향(sync_direction=two_way)일 때 로컬 변경을 구글로 보내는 저장소. 없으면 가져오기만 한다. */
  pushStore?: PushStore;
};

export type UserResult =
  | { status: "ok" | "partial"; calendars: number; stats: Stats; push?: PushStats }
  | { status: "locked" | "no_connection" | "no_calendars" }
  | { status: "error"; code: string; permanent: boolean };

const LOCK_MS = 3 * 60_000;
const emptyStats = (): Stats => ({ pages: 0, upserted: 0, deleted: 0, cancelledInstances: 0, skipped: 0, resynced: false });

export async function syncUser(deps: RunDeps, userId: string): Promise<UserResult> {
  const { conn, api } = deps;
  const conne = await conn.getConnection(userId);
  if (!conne) return { status: "no_connection" };

  const now = deps.now();
  if (!(await conn.tryLock(userId, new Date(now.getTime() + LOCK_MS), now))) return { status: "locked" };

  try {
    const calendars = (await conn.listSyncCalendars(userId)).filter((c) => isTargetCalendar(c.name, deps.targetName));
    if (!calendars.length) return { status: "no_calendars" };

    const tz = await conn.getTimezone(userId);
    const refreshToken = await decryptToken(conne.refresh_token_enc, deps.ring);
    const accessToken = await api.refreshAccessToken(refreshToken);
    const deadline = now.getTime() + deps.budgetMs;

    // 양방향이면 가져오기보다 먼저 로컬 변경을 구글로 보낸다(410 재동기화 등에서 로컬 변경이 유실되지 않게).
    let push: PushStats | undefined;
    const writable = calendars.find((c) => c.read_only !== true);
    if (conne.sync_direction === "two_way" && deps.pushStore && writable) {
      push = await pushChanges(
        { api, store: deps.pushStore, accessToken, googleCalendarId: writable.google_calendar_id, tz },
        userId,
        { includeLocal: conne.push_local !== false },
      );
    }

    const total = emptyStats();
    let allDone = true;
    const saved = { ...(conne.sync_token_by_calendar ?? {}) } as Record<string, unknown>;

    for (const cal of calendars) {
      if (deps.now().getTime() > deadline) { allDone = false; break; }
      try {
        const r = await syncCalendar(
          {
            api, store: deps.events, now: deps.now, deadline,
            saveState: (s) => conn.saveCalendarState(userId, cal.google_calendar_id, s),
          },
          {
            calendarId: cal.id, googleCalendarId: cal.google_calendar_id, accessToken, tz,
            state: normalizeState(saved[cal.google_calendar_id]),
          },
        );
        total.pages += r.stats.pages;
        total.upserted += r.stats.upserted;
        total.deleted += r.stats.deleted;
        total.cancelledInstances += r.stats.cancelledInstances;
        total.skipped += r.stats.skipped;
        total.resynced ||= r.stats.resynced;
        if (!r.done) allDone = false;
      } catch (e) {
        // 캘린더가 구글에서 삭제되었거나 접근할 수 없으면 그 캘린더만 건너뛰고 기록한다.
        if (e instanceof GoogleApiError && !e.permanent && e.code === "not_found") {
          await conn.log(userId, "error", { calendar: cal.name, code: e.code, message: e.message });
          continue;
        }
        throw e;
      }
    }

    if (allDone) await conn.markResult(userId, { last_synced_at: deps.now().toISOString(), last_error: null });
    return { status: allDone ? "ok" : "partial", calendars: calendars.length, stats: total, push };
  } catch (e) {
    if (e instanceof GoogleApiError) {
      // 재연결·권한 조치가 필요한 오류만 사용자에게 보이는 last_error 로 남긴다(일시 오류는 다음 주기에 다시 시도).
      if (e.permanent) await conn.markResult(userId, { last_error: `${e.code}: ${e.message}` });
      else await conn.log(userId, "error", { code: e.code, message: e.message });
      return { status: "error", code: e.code, permanent: e.permanent };
    }
    await conn.log(userId, "error", { code: "internal", message: e instanceof Error ? e.message : String(e) });
    return { status: "error", code: "internal", permanent: false };
  } finally {
    await conn.unlock(userId);
  }
}

/** 연결된 모든 사용자를 순서대로 동기화(pg_cron 15분 주기). 전체 예산을 넘으면 남은 사용자는 다음 주기로 미룬다. */
export async function syncAll(a: {
  listUsers: () => Promise<string[]>;
  /** 사용자별 의존성(DB 쿼리가 그 사용자의 user_id 로 제한되도록 사용자마다 새로 만든다) */
  forUser: (userId: string) => RunDeps;
  now: () => Date;
  totalBudgetMs: number;
}) {
  const started = a.now().getTime();
  const users = await a.listUsers();
  const results: Record<string, UserResult["status"]> = {};
  for (const id of users) {
    if (a.now().getTime() - started > a.totalBudgetMs) break;
    results[id] = (await syncUser(a.forUser(id), id)).status;
  }
  return { users: users.length, processed: Object.keys(results).length, results };
}

/** 로컬 변경 push 만 실행 (일정 저장 직후 호출). 양방향이 아니거나 mycal 이 없으면 아무것도 하지 않는다. */
export async function pushUser(deps: RunDeps, userId: string): Promise<{ status: "ok" | "skipped" | "locked" | "no_connection" | "error"; push?: PushStats; code?: string }> {
  const conne = await deps.conn.getConnection(userId);
  if (!conne) return { status: "no_connection" };
  if (conne.sync_direction !== "two_way" || !deps.pushStore) return { status: "skipped" };

  const now = deps.now();
  if (!(await deps.conn.tryLock(userId, new Date(now.getTime() + LOCK_MS), now))) return { status: "locked" };
  try {
    const cal = (await deps.conn.listSyncCalendars(userId)).filter((c) => isTargetCalendar(c.name, deps.targetName)).find((c) => c.read_only !== true);
    if (!cal) return { status: "skipped" };
    const tz = await deps.conn.getTimezone(userId);
    const accessToken = await deps.api.refreshAccessToken(await decryptToken(conne.refresh_token_enc, deps.ring));
    const push = await pushChanges(
      { api: deps.api, store: deps.pushStore, accessToken, googleCalendarId: cal.google_calendar_id, tz },
      userId,
      { includeLocal: conne.push_local !== false },
    );
    return { status: "ok", push };
  } catch (e) {
    if (e instanceof GoogleApiError) {
      if (e.permanent) await deps.conn.markResult(userId, { last_error: `${e.code}: ${e.message}` });
      return { status: "error", code: e.code };
    }
    await deps.conn.log(userId, "error", { code: "internal", message: e instanceof Error ? e.message : String(e) });
    return { status: "error", code: "internal" };
  } finally {
    await deps.conn.unlock(userId);
  }
}
