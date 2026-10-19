// 가져오기(구글 → 앱) 동기화 엔진. DB·구글 API 는 주입(Store, GoogleApi)해서 Deno 없이 테스트한다.
//
// 흐름(캘린더 하나):
//  - syncToken 이 있으면 증분(변경분만, 삭제는 status=cancelled 로 옴). 없으면 전체 가져오기(과거 1개월 ~ 미래 1년).
//  - 410 Gone(syncToken/pageToken 만료)이면 토큰을 버리고 전체 재동기화. 재동기화 중 "확인된" 일정에 google_synced_at 을 찍고,
//    끝난 뒤 확인되지 않은(=구글에서 사라진) 일정만 소프트 삭제한다(중간에 끊겨도 오탐 삭제가 없다).
//  - 페이지마다 진행 상태(state)를 저장해 시간 예산을 넘으면 중단하고 다음 실행에서 이어간다.
import { convertGoogleEvent, type ConvertedEvent, type GoogleEvent } from "./convert.ts";
import { GoogleApiError, type GoogleApi } from "./google.ts";

/** sync_token_by_calendar[googleCalendarId] 에 저장되는 값 */
export type CalendarState = {
  syncToken?: string;
  /** 진행 중인 전체 가져오기: 다음에 받을 페이지 */
  pageToken?: string;
  mode?: "full" | "incremental";
  windowMin?: string;
  windowMax?: string;
  /** 전체 가져오기를 시작한 시각 — 이 시각보다 오래된 google_synced_at 은 "사라진 일정" */
  startedAt?: string;
};

/** 옛 형식(문자열 syncToken)도 읽는다 */
export function normalizeState(raw: unknown): CalendarState {
  if (typeof raw === "string") return { syncToken: raw };
  if (raw && typeof raw === "object") return raw as CalendarState;
  return {};
}

export type UpsertRow = ConvertedEvent & { recurring_event_id: string | null; google_synced_at: string };

export interface EventStore {
  /** 이 캘린더에서 google_event_id 로 로컬 일정을 찾는다(삭제된 행 포함). */
  findByGoogleIds(calendarId: string, googleIds: string[]): Promise<Map<string, { id: string; exdates: string[] }>>;
  /** insert/update. 기존 행은 exdates 를 합집합으로 병합한다. 반환: google id → 로컬 id */
  upsertEvents(calendarId: string, rows: UpsertRow[]): Promise<Map<string, string>>;
  /** 구글에서 삭제된 일정 소프트 삭제(마스터면 그 예외 인스턴스도). 반환: 삭제한 수 */
  softDeleteByGoogleIds(calendarId: string, googleIds: string[]): Promise<number>;
  /** 마스터(구글 id)의 exdates 에 추가 */
  addExdates(calendarId: string, masterGoogleId: string, iso: string[]): Promise<void>;
  /** 전체 가져오기 후 확인되지 않은 구글 일정 소프트 삭제 */
  softDeleteStale(calendarId: string, window: { min: string; max: string }, before: string): Promise<number>;
}

export type Stats = { pages: number; upserted: number; deleted: number; cancelledInstances: number; skipped: number; resynced: boolean };

export type SyncDeps = {
  api: GoogleApi;
  store: EventStore;
  now: () => Date;
  /** 이 실행에서 쓸 수 있는 시간(ms). 넘으면 상태를 저장하고 중단한다. */
  deadline: number;
  /** 페이지 처리 후 호출 — 진행 상태 저장 */
  saveState: (state: CalendarState) => Promise<void>;
};

export type CalendarCtx = {
  calendarId: string;
  googleCalendarId: string;
  accessToken: string;
  tz: string;
  state: CalendarState;
};

const MONTH_MS = 31 * 86_400_000;
const CHUNK = 500;

/** 한 캘린더를 동기화. done=false 면 시간 예산 때문에 중단(다음 실행에서 이어감). */
export async function syncCalendar(deps: SyncDeps, ctx: CalendarCtx): Promise<{ state: CalendarState; done: boolean; stats: Stats }> {
  const stats: Stats = { pages: 0, upserted: 0, deleted: 0, cancelledInstances: 0, skipped: 0, resynced: false };
  let state = { ...ctx.state };
  let restarted = false;

  const startFull = (): CalendarState => {
    const now = deps.now();
    return {
      mode: "full",
      windowMin: new Date(now.getTime() - MONTH_MS).toISOString(),
      windowMax: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
      startedAt: now.toISOString(),
    };
  };

  if (!state.syncToken && !state.pageToken) state = startFull();
  else if (state.syncToken && !state.pageToken) state = { ...state, mode: "incremental" };

  for (;;) {
    let page;
    try {
      page = await deps.api.listEvents(ctx.accessToken, ctx.googleCalendarId, {
        syncToken: state.mode === "incremental" ? state.syncToken : undefined,
        pageToken: state.pageToken,
        timeMin: state.mode === "full" ? state.windowMin : undefined,
        timeMax: state.mode === "full" ? state.windowMax : undefined,
        showDeleted: false,
      });
    } catch (e) {
      if (e instanceof GoogleApiError && e.code === "gone" && !restarted) {
        // 410: 토큰을 버리고 전체 재동기화
        restarted = true;
        stats.resynced = true;
        state = startFull();
        await deps.saveState(state);
        continue;
      }
      throw e;
    }

    stats.pages++;
    const stamp = deps.now().toISOString();
    await processItems(deps, ctx, page.items, stamp, stats);

    if (page.nextPageToken) {
      state = { ...state, pageToken: page.nextPageToken };
      await deps.saveState(state);
      if (deps.now().getTime() > deps.deadline) return { state, done: false, stats };
      continue;
    }

    // 마지막 페이지
    if (state.mode === "full" && state.startedAt && state.windowMin && state.windowMax) {
      stats.deleted += await deps.store.softDeleteStale(ctx.calendarId, { min: state.windowMin, max: state.windowMax }, state.startedAt);
    }
    state = { syncToken: page.nextSyncToken ?? state.syncToken, mode: "incremental" };
    await deps.saveState(state);
    return { state, done: true, stats };
  }
}

async function processItems(deps: SyncDeps, ctx: CalendarCtx, items: GoogleEvent[], stamp: string, stats: Stats) {
  const masters: UpsertRow[] = [];
  const exceptions: ConvertedEvent[] = [];
  const deletes: string[] = [];
  const cancels: { master: string; at: string; id: string }[] = [];

  for (const g of items) {
    const r = convertGoogleEvent(g, ctx.tz);
    if (r.kind === "skip") stats.skipped++;
    else if (r.kind === "delete") deletes.push(r.google_event_id);
    else if (r.kind === "cancel_instance") cancels.push({ master: r.master_google_id, at: r.original_start_at, id: r.google_event_id });
    else if (r.event.master_google_id) exceptions.push(r.event);
    else masters.push({ ...r.event, recurring_event_id: null, google_synced_at: stamp });
  }

  const idByGoogle = new Map<string, string>();
  for (const part of chunks(masters)) {
    for (const [g, id] of await deps.store.upsertEvents(ctx.calendarId, part)) idByGoogle.set(g, id);
  }
  stats.upserted += masters.length;

  // 예외 인스턴스: 마스터의 로컬 id 가 필요하다. 이번 페이지에 없으면 DB, 그래도 없으면 구글에서 마스터를 직접 가져온다.
  const needMasters = [...new Set(exceptions.map((e) => e.master_google_id!))].filter((id) => !idByGoogle.has(id));
  if (needMasters.length) {
    for (const [g, v] of await deps.store.findByGoogleIds(ctx.calendarId, needMasters)) idByGoogle.set(g, v.id);
    const missing = needMasters.filter((id) => !idByGoogle.has(id));
    for (const mid of missing) {
      const g = await deps.api.getEvent(ctx.accessToken, ctx.googleCalendarId, mid);
      const r = g ? convertGoogleEvent(g, ctx.tz) : null;
      if (r?.kind === "upsert" && !r.event.master_google_id) {
        const map = await deps.store.upsertEvents(ctx.calendarId, [{ ...r.event, recurring_event_id: null, google_synced_at: stamp }]);
        for (const [gid, id] of map) idByGoogle.set(gid, id);
        stats.upserted++;
      }
    }
  }
  const excRows: UpsertRow[] = exceptions.map((e) => {
    const parent = idByGoogle.get(e.master_google_id!) ?? null;
    // 마스터를 끝내 못 찾으면(삭제됨 등) 독립 일정으로 보존한다.
    return parent ? { ...e, recurring_event_id: parent, google_synced_at: stamp } : { ...e, master_google_id: null, original_start_at: null, recurring_event_id: null, google_synced_at: stamp };
  });
  for (const part of chunks(excRows)) await deps.store.upsertEvents(ctx.calendarId, part);
  stats.upserted += excRows.length;

  if (deletes.length) stats.deleted += await deps.store.softDeleteByGoogleIds(ctx.calendarId, deletes);

  for (const c of cancels) {
    await deps.store.addExdates(ctx.calendarId, c.master, [c.at]);
    await deps.store.softDeleteByGoogleIds(ctx.calendarId, [c.id]); // 이미 예외 행으로 가져온 적이 있으면 제거
    stats.cancelledInstances++;
  }
}

function* chunks<T>(list: T[]): Generator<T[]> {
  for (let i = 0; i < list.length; i += CHUNK) yield list.slice(i, i + CHUNK);
}
