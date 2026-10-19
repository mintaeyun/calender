// 로컬 → 구글 push (양방향의 앱→구글 방향). 가져오기(sync.ts)보다 먼저 실행한다(로컬 변경이 유실되지 않게).
//
// 대상: 구글에 아직 없는 로컬 일정(신규) + 구글과 맞춘 뒤 바뀐 일정(수정·소프트 삭제).
//   변경 감지는 DB 가 한다: events.updated_at > events.google_synced_at (마이그레이션 gcal_two_way 참고).
// 안전장치:
//   - 수정은 If-Match: etag 로 보낸다. 412 면 충돌: 양쪽의 수정 시각(updated)이 더 최근인 쪽을 채택하고 진 쪽의 값을 sync_logs 에 남긴다.
//   - 생성 전에 extendedProperties.private.appEventId 로 구글에 이미 있는지 확인(중간에 끊긴 push 의 중복 생성 방지).
//   - 한 일정의 실패가 다른 일정을 막지 않는다(영구 오류만 전체 중단).
import { convertGoogleEvent, type ConvertedEvent, type GoogleEvent } from "./convert.ts";
import { GoogleApiError, type GoogleApi } from "./google.ts";
import { instanceId, toGoogleBody, type LocalEvent } from "./push-convert.ts";

export interface PushStore {
  /** 푸시 후보(신규 로컬 일정 + 변경·삭제된 일정). 마스터가 예외보다 먼저 오도록 정렬. */
  listCandidates(userId: string, includeLocal: boolean): Promise<LocalEvent[]>;
  /** 로컬 일정 id 의 google_event_id */
  getGoogleIdOf(userId: string, localId: string): Promise<string | null>;
  /** 구글 응답을 로컬에 기록하고 "구글과 일치" 로 표시 */
  markPushed(userId: string, id: string, v: { google_event_id: string; google_etag: string | null; google_updated_at: string | null }): Promise<void>;
  /** 구글과 일치로만 표시(삭제 완료 등) */
  markSynced(userId: string, id: string): Promise<void>;
  /** 구글 연결 정보 제거(원격이 삭제돼 새로 만들어야 할 때) */
  detachGoogle(userId: string, id: string): Promise<void>;
  /** 원격 값으로 로컬을 덮어쓰고(삭제 해제 포함) 구글과 일치로 표시 */
  applyRemote(userId: string, id: string, ev: ConvertedEvent): Promise<void>;
  log(userId: string, kind: "conflict" | "error" | "info", detail: Record<string, unknown>): Promise<void>;
}

export type PushStats = { created: number; updated: number; deleted: number; conflicts: number; errors: number; skipped: number };

export type PushDeps = {
  api: GoogleApi;
  store: PushStore;
  accessToken: string;
  googleCalendarId: string;
  tz: string;
};

const stripNull = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
const summary = (e: { title?: string; summary?: string; start_at?: string; end_at?: string; start?: unknown; end?: unknown }) => ({
  title: e.title ?? e.summary ?? null, start: e.start_at ?? e.start ?? null, end: e.end_at ?? e.end ?? null,
});
const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

export async function pushChanges(deps: PushDeps, userId: string, opts: { includeLocal: boolean }): Promise<PushStats> {
  const { api, store, accessToken: at, googleCalendarId: cal, tz } = deps;
  const stats: PushStats = { created: 0, updated: 0, deleted: 0, conflicts: 0, errors: 0, skipped: 0 };
  const candidates = await store.listCandidates(userId, opts.includeLocal);

  const record = (row: LocalEvent, r: GoogleEvent) =>
    store.markPushed(userId, row.id, {
      google_event_id: r.id, google_etag: r.etag ?? null, google_updated_at: r.updated ? new Date(r.updated).toISOString() : null,
    });

  async function create(row: LocalEvent) {
    // 이전 실행이 구글에는 만들고 로컬 기록에 실패했을 수 있으니 먼저 찾는다.
    const found = await api.findByAppEventId(at, cal, row.id);
    if (found) {
      const r = await api.patchEvent(at, cal, found.id, toGoogleBody(row, tz), null);
      await record(row, r);
      stats.updated++;
      return;
    }
    const r = await api.insertEvent(at, cal, stripNull(toGoogleBody(row, tz)));
    await record(row, r);
    stats.created++;
  }

  /** 수정(또는 예외 인스턴스 수정). 412 면 충돌 처리. */
  async function patch(row: LocalEvent, eventId: string, useEtag: boolean) {
    try {
      const r = await api.patchEvent(at, cal, eventId, toGoogleBody(row, tz), useEtag ? row.google_etag : null);
      await record(row, r);
      stats.updated++;
    } catch (e) {
      if (!(e instanceof GoogleApiError)) throw e;
      const gone = e.code === "not_found" || e.code === "gone";
      if (gone && row.recurring_event_id) {
        // 예외 인스턴스: 구글에 해당 회차가 없다(마스터가 바뀌었거나 삭제됨). 새로 만들 수 없으니 건너뛴다.
        stats.skipped++;
        await store.log(userId, "info", { event: row.id, reason: "instance_not_in_google" });
        return;
      }
      if (!gone && e.code !== "precondition_failed") throw e;
      stats.conflicts++;
      const remote = gone ? null : await api.getEvent(at, cal, eventId);
      if (!remote || remote.status === "cancelled") {
        // 구글에서는 지워졌는데 앱에서는 고쳤다: 데이터를 잃지 않도록 다시 만든다.
        await store.log(userId, "conflict", { event: row.id, winner: "local", reason: "remote_deleted_recreated", local: summary(row) });
        await store.detachGoogle(userId, row.id);
        await create({ ...row, google_event_id: null, google_etag: null });
        return;
      }
      if (ts(row.updated_at) >= ts(remote.updated)) {
        await store.log(userId, "conflict", { event: row.id, winner: "local", overwritten: summary(remote) });
        const r = await api.patchEvent(at, cal, eventId, toGoogleBody(row, tz), remote.etag ?? null);
        await record(row, r);
        stats.updated++;
      } else {
        const conv = convertGoogleEvent(remote, tz);
        await store.log(userId, "conflict", { event: row.id, winner: "remote", overwritten: summary(row) });
        if (conv.kind === "upsert") await store.applyRemote(userId, row.id, conv.event);
        else await store.markSynced(userId, row.id);
      }
    }
  }

  async function remove(row: LocalEvent) {
    const gid = row.google_event_id!;
    try {
      await api.deleteEvent(at, cal, gid, row.google_etag);
      await store.markSynced(userId, row.id);
      stats.deleted++;
    } catch (e) {
      if (!(e instanceof GoogleApiError) || e.code !== "precondition_failed") throw e;
      stats.conflicts++;
      const remote = await api.getEvent(at, cal, gid);
      if (!remote || remote.status === "cancelled") {
        await store.markSynced(userId, row.id);
      } else if (ts(remote.updated) > ts(row.updated_at)) {
        // 구글에서 더 최근에 고쳤다: 앱의 삭제를 되돌리고 구글 내용을 채택
        const conv = convertGoogleEvent(remote, tz);
        await store.log(userId, "conflict", { event: row.id, winner: "remote", reason: "delete_vs_edit", overwritten: summary(row) });
        if (conv.kind === "upsert") await store.applyRemote(userId, row.id, conv.event);
      } else {
        await store.log(userId, "conflict", { event: row.id, winner: "local", reason: "delete_vs_edit", overwritten: summary(remote) });
        await api.deleteEvent(at, cal, gid, null);
        await store.markSynced(userId, row.id);
        stats.deleted++;
      }
    }
  }

  for (const row of candidates) {
    try {
      if (row.deleted_at) {
        if (row.google_event_id) await remove(row);
        else stats.skipped++;
      } else if (row.recurring_event_id) {
        // 예외 인스턴스: 마스터가 구글에 있어야 한다. 구글 인스턴스 id 를 수정한다.
        const masterG = await store.getGoogleIdOf(userId, row.recurring_event_id);
        if (!masterG || !row.original_start_at) {
          stats.skipped++;
          await store.log(userId, "info", { event: row.id, reason: "master_not_in_google" });
          continue;
        }
        await patch(row, row.google_event_id ?? instanceId(masterG, row.original_start_at, row.all_day, tz), Boolean(row.google_event_id));
      } else if (!row.google_event_id) {
        await create(row);
      } else {
        await patch(row, row.google_event_id, true);
      }
    } catch (e) {
      if (e instanceof GoogleApiError && e.permanent) throw e; // 인증·권한 문제는 전체 중단
      stats.errors++;
      await store.log(userId, "error", { event: row.id, code: e instanceof GoogleApiError ? e.code : "internal", message: e instanceof Error ? e.message : String(e) });
    }
  }
  return stats;
}
