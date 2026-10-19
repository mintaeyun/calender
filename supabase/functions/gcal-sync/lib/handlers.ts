// HTTP 경로별 처리(oauth/start, oauth/callback, calendars, sync, sync-all, disconnect). 모든 외부 의존성은 주입한다.
import { badRequest, HttpError } from "../../_shared/errors.ts";
import { decryptToken, encryptToken, signState, verifyStateDetailed, type KeyRing, type StateFailure } from "./crypto.ts";
import { GoogleApiError, type GoogleApi, type GoogleCalendarEntry } from "./google.ts";
import { pushUser, syncAll, syncUser, type RunDeps } from "./run.ts";
import { isTargetCalendar, TARGET_CALENDAR_NAME } from "./target.ts";

export type CalendarOut = {
  id: string;
  google_calendar_id: string | null;
  name: string;
  color: string;
  sync_enabled: boolean;
  read_only: boolean;
  google_access_role: string | null;
  event_count: number;
};

/** 연결·캘린더 관리용 DB 접근 (service role, user_id 조건 필수) */
export interface ConnAdmin {
  /** 연결 생성 또는 갱신(토큰·이메일·오류 초기화). 기존 sync_direction 은 유지한다. */
  upsertConnection(userId: string, v: { google_email: string; refresh_token_enc: string }): Promise<{ created: boolean }>;
  /** 구글 캘린더 목록을 calendars 에 반영. 기존 행은 이름·색·권한만 갱신하고 sync_enabled 는 유지, 새 행은 enableIds 에 있을 때만 켠다. */
  upsertCalendars(userId: string, entries: GoogleCalendarEntry[], enableIds: string[]): Promise<void>;
  listGoogleCalendars(userId: string): Promise<CalendarOut[]>;
  /** 연결 행을 지우고 저장돼 있던 암호화 토큰을 돌려준다(없으면 null). */
  deleteConnection(userId: string): Promise<string | null>;
  /** 모든 구글 캘린더 동기화 중지. deleteEvents 면 가져온 일정도 소프트 삭제하고 구글 캘린더 행을 지운다. */
  disconnectCalendars(userId: string, deleteEvents: boolean): Promise<void>;
  getRefreshToken(userId: string): Promise<string | null>;
}

export type HandlerDeps = {
  api: GoogleApi;
  ring: KeyRing;
  now: () => Date;
  redirectUri: string;
  allowedReturnOrigins: string[];
  admin: ConnAdmin;
  /** 사용자별 동기화 실행 의존성 */
  runDeps: (userId: string) => RunDeps;
  syncBudgetMs: number;
  syncAllBudgetMs: number;
  /** 동기화할 구글 캘린더 이름 (기본 "mycal") */
  targetName?: string;
};

/** 구글 동의 화면에서 머물 수 있는 시간(검증 안 된 앱 경고·계정 선택 등을 거치는 시간 포함) */
export const STATE_TTL_SEC = 1800;

/** state 검증 실패 이유 → 사용자에게 보일 한국어 안내 (끝의 코드는 로그와 대조용, 민감값 아님) */
export function stateErrorMessage(reason: StateFailure): string {
  const code = `[state_${reason}]`;
  switch (reason) {
    case "missing": return `연결 요청에 state 값이 없습니다(주소의 쿼리가 잘렸을 수 있어요). 설정에서 다시 연결해 주세요. ${code}`;
    case "expired": return `연결 시간이 지났어요(${STATE_TTL_SEC / 60}분 제한). 설정에서 다시 연결해 주세요. ${code}`;
    case "signature": return `연결 요청을 확인하지 못했어요(서명 불일치). 서버 설정이 바뀌었거나 주소가 변형되었을 수 있어요. 설정에서 다시 연결해 주세요. ${code}`;
    default: return `연결 요청을 해석하지 못했어요. 설정에서 다시 연결해 주세요. ${code}`;
  }
}

function checkReturnTo(returnTo: string, allowed: string[]): string {
  let u: URL;
  try {
    u = new URL(returnTo);
  } catch {
    throw badRequest("return_to 가 올바른 URL이 아닙니다.");
  }
  if (!allowed.includes(u.origin)) throw new HttpError(400, "bad_request", "허용되지 않은 return_to 입니다.");
  return u.toString();
}

const withParam = (url: string, key: string, value: string) => {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
};

/** POST oauth/start { return_to } → { url } — 클라이언트가 이 URL 로 이동한다. */
export async function oauthStart(userId: string, returnTo: string, d: HandlerDeps) {
  const safe = checkReturnTo(returnTo, d.allowedReturnOrigins);
  const state = await signState({ u: userId, r: safe, e: Math.floor(d.now().getTime() / 1000) + STATE_TTL_SEC }, d.ring);
  return { url: d.api.authUrl({ redirectUri: d.redirectUri, state }) };
}

/** GET oauth/callback?code&state — 구글이 브라우저를 되돌려 보낸다. 항상 앱으로 리다이렉트할 URL 을 돌려준다. */
export async function oauthCallback(params: URLSearchParams, d: HandlerDeps): Promise<{ redirect: string } | { error: string }> {
  const state = params.get("state");
  const verified = await verifyStateDetailed(state, d.ring, Math.floor(d.now().getTime() / 1000));
  if (!verified.ok) {
    // 값 자체는 남기지 않고 이유와 길이만 기록한다.
    console.error(`oauth callback: state rejected reason=${verified.reason}${verified.detail ? ` (${verified.detail})` : ""} stateLen=${state?.length ?? 0} hasCode=${params.has("code")}`);
    return { error: stateErrorMessage(verified.reason) };
  }
  const payload = verified.payload;
  const back = (status: string) => ({ redirect: withParam(payload.r, "google", status) });

  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "error");
  const code = params.get("code");
  if (!code) return back("error");

  try {
    const { refreshToken, accessToken } = await d.api.exchangeCode(code, d.redirectUri);
    if (!refreshToken) return back("no_refresh"); // prompt=consent 인데도 없으면 앱 권한을 지우고 다시 연결해야 한다
    const all = await d.api.listCalendars(accessToken);
    const primary = all.find((c) => c.primary) ?? all[0]; // 계정 이메일은 기본 캘린더 id
    const targets = all.filter((c) => isTargetCalendar(c.summary, d.targetName));
    const enc = await encryptToken(refreshToken, d.ring);
    await d.admin.upsertConnection(payload.u, { google_email: primary?.id ?? "", refresh_token_enc: enc });
    // 대상 캘린더(mycal)만 저장하고 처음 연결할 때 자동으로 켠다. 다른 캘린더는 앱에 가져오지 않는다.
    await d.admin.upsertCalendars(payload.u, targets, targets.map((c) => c.id));
    return back(targets.length ? "connected" : "no_target");
  } catch (e) {
    console.error("oauth callback failed", e instanceof GoogleApiError ? `${e.code}` : (e as Error).name);
    return back("error");
  }
}

/** GET/POST calendars — 구글에서 목록을 다시 읽어 반영하고 calendars 행을 돌려준다. */
export async function refreshCalendars(userId: string, d: HandlerDeps) {
  const enc = await d.admin.getRefreshToken(userId);
  if (!enc) throw new HttpError(404, "not_connected", "Google 계정이 연결되어 있지 않습니다.");
  const access = await d.api.refreshAccessToken(await decryptToken(enc, d.ring));
  const targets = (await d.api.listCalendars(access)).filter((c) => isTargetCalendar(c.summary, d.targetName));
  await d.admin.upsertCalendars(userId, targets, targets.map((c) => c.id));
  return {
    calendars: (await d.admin.listGoogleCalendars(userId)).filter((c) => isTargetCalendar(c.name, d.targetName)),
    target_found: targets.length > 0,
    target_name: d.targetName ?? TARGET_CALENDAR_NAME,
  };
}

/** 일정 저장 직후 호출: 로컬 변경만 구글(mycal)로 보낸다. 양방향이 아니면 skipped. */
export async function runPush(userId: string, d: HandlerDeps) {
  return await pushUser(d.runDeps(userId), userId);
}

export async function runSync(userId: string, d: HandlerDeps) {
  return await syncUser(d.runDeps(userId), userId);
}

export async function runSyncAll(d: HandlerDeps, listUsers: () => Promise<string[]>) {
  return await syncAll({ listUsers, forUser: d.runDeps, now: d.now, totalBudgetMs: d.syncAllBudgetMs });
}

/** POST disconnect { delete_events? } — 구글 revoke(실패해도 계속) → 로컬 토큰 즉시 삭제. */
export async function disconnect(userId: string, deleteEvents: boolean, d: HandlerDeps) {
  const enc = await d.admin.deleteConnection(userId);
  if (enc) {
    try {
      await d.api.revoke(await decryptToken(enc, d.ring));
    } catch {
      // 토큰은 이미 지웠다. 구글 쪽 revoke 실패는 무시한다(사용자는 구글 계정 설정에서 직접 제거할 수 있다).
    }
  }
  await d.admin.disconnectCalendars(userId, deleteEvents);
  return { ok: true as const, had_connection: Boolean(enc) };
}

/**
 * 배포 환경 자가 점검(GET diag, 인증 없음): 이 런타임에서 state 를 서명→구글 URL 왕복→검증이 되는지와 설정 상태를 알려 준다.
 * 비밀값·토큰은 반환하지 않는다(키 버전과 불리언만).
 */
export async function diag(d: HandlerDeps) {
  const nowSec = Math.floor(d.now().getTime() / 1000);
  const state = await signState({ u: "diag", r: "http://localhost:3000/", e: nowSec + STATE_TTL_SEC }, d.ring);
  // 구글이 되돌려 줄 때와 같은 경로: authUrl 의 state 파라미터 → 콜백 쿼리 문자열 → URLSearchParams
  const url = new URL(d.api.authUrl({ redirectUri: d.redirectUri, state }));
  const echoed = new URLSearchParams(`state=${encodeURIComponent(url.searchParams.get("state") ?? "")}`).get("state");
  const direct = await verifyStateDetailed(state, d.ring, nowSec);
  const roundtrip = await verifyStateDetailed(echoed, d.ring, nowSec);
  const expired = await verifyStateDetailed(state, d.ring, nowSec + STATE_TTL_SEC + 1);
  return {
    key_version: d.ring.current,
    state_ttl_sec: STATE_TTL_SEC,
    sign_verify: direct.ok ? "ok" : direct.reason,
    url_roundtrip: roundtrip.ok ? "ok" : roundtrip.reason,
    expiry_detected: !expired.ok && expired.reason === "expired",
    redirect_uri: d.redirectUri,
    allowed_return_origins: d.allowedReturnOrigins,
    target_calendar: d.targetName ?? TARGET_CALENDAR_NAME,
  };
}
