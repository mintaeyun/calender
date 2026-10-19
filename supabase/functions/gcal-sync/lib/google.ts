// Google OAuth / Calendar API 클라이언트. fetch 와 sleep 을 주입할 수 있어 테스트에서는 스텁으로 대체한다.
// 토큰·코드·client secret 은 로그에 남기지 않는다(오류 메시지에도 넣지 않는다).
import type { GoogleEvent } from "./convert.ts";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/** code: 'invalid_grant'(토큰 만료·철회), 'unauthorized', 'forbidden', 'not_found', 'gone'(410), 'rate_limited', 'server', 'network' */
export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** 재시도해도 소용없는 오류(재연결·권한 조치 필요) */
    public permanent: boolean,
  ) {
    super(message);
  }
}

export type GoogleCalendarEntry = {
  id: string;
  summary: string;
  backgroundColor?: string;
  accessRole: string;
  primary?: boolean;
  selected?: boolean;
};

export type EventsPage = { items: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };

export type ListEventsParams = {
  syncToken?: string;
  pageToken?: string;
  timeMin?: string;
  timeMax?: string;
  showDeleted?: boolean;
};

export interface GoogleApi {
  authUrl(args: { redirectUri: string; state: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string | null; accessToken: string }>;
  refreshAccessToken(refreshToken: string): Promise<string>;
  revoke(token: string): Promise<void>;
  listCalendars(accessToken: string): Promise<GoogleCalendarEntry[]>;
  listEvents(accessToken: string, calendarId: string, params: ListEventsParams): Promise<EventsPage>;
  getEvent(accessToken: string, calendarId: string, eventId: string): Promise<GoogleEvent | null>;
}

type Opts = {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
};

const API = "https://www.googleapis.com/calendar/v3";
const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError"]);

export function createGoogleApi(o: Opts): GoogleApi {
  const doFetch = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = o.maxRetries ?? 4;

  async function request(url: string, init: RequestInit, accessToken?: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        });
      } catch {
        if (attempt >= maxRetries) throw new GoogleApiError(0, "network", "Google 서버에 연결하지 못했습니다.", false);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res;

      const body = await res.clone().json().catch(() => null) as { error?: string | { errors?: { reason?: string }[]; message?: string }; error_description?: string } | null;
      const reason = typeof body?.error === "object" ? body.error?.errors?.[0]?.reason : undefined;
      const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && reason !== undefined && RETRYABLE_REASONS.has(reason));
      if (retryable && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 500 * 2 ** attempt);
        continue;
      }
      throw classify(res.status, body, reason);
    }
  }

  function classify(status: number, body: { error?: unknown; error_description?: string } | null, reason?: string): GoogleApiError {
    const oauthError = typeof body?.error === "string" ? body.error : undefined;
    if (oauthError === "invalid_grant" || oauthError === "invalid_token") {
      return new GoogleApiError(status, "invalid_grant", "Google 연결이 만료되었거나 권한이 철회되었습니다.", true);
    }
    if (oauthError === "invalid_client" || oauthError === "unauthorized_client") {
      return new GoogleApiError(status, "invalid_client", "Google OAuth 클라이언트 설정이 올바르지 않습니다.", true);
    }
    if (status === 401) return new GoogleApiError(status, "unauthorized", "Google 인증이 거부되었습니다.", true);
    if (status === 403) {
      const limited = reason !== undefined && RETRYABLE_REASONS.has(reason);
      return new GoogleApiError(status, limited ? "rate_limited" : "forbidden", limited ? "Google 호출 한도를 초과했습니다." : "Google 캘린더 접근 권한이 없습니다.", !limited);
    }
    if (status === 404) return new GoogleApiError(status, "not_found", "Google 캘린더 또는 일정을 찾을 수 없습니다.", false);
    if (status === 410) return new GoogleApiError(status, "gone", "동기화 토큰이 만료되었습니다.", false);
    if (status === 429) return new GoogleApiError(status, "rate_limited", "Google 호출 한도를 초과했습니다.", false);
    if (status >= 500) return new GoogleApiError(status, "server", "Google 서버 오류입니다.", false);
    return new GoogleApiError(status, "error", `Google 요청이 실패했습니다 (${status}).`, false);
  }

  const form = (data: Record<string, string>) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data).toString(),
  });

  return {
    authUrl({ redirectUri, state }) {
      const p = new URLSearchParams({
        client_id: o.clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "),
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
    },

    async exchangeCode(code, redirectUri) {
      const res = await request("https://oauth2.googleapis.com/token", form({
        code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code",
      }));
      const j = await res.json() as { refresh_token?: string; access_token: string };
      return { refreshToken: j.refresh_token ?? null, accessToken: j.access_token };
    },

    async refreshAccessToken(refreshToken) {
      const res = await request("https://oauth2.googleapis.com/token", form({
        refresh_token: refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: "refresh_token",
      }));
      return (await res.json() as { access_token: string }).access_token;
    },

    async revoke(token) {
      // 실패해도 호출 측이 로컬 토큰을 지우므로 오류는 삼킨다.
      try {
        await doFetch("https://oauth2.googleapis.com/revoke", form({ token }));
      } catch { /* 무시 */ }
    },

    async listCalendars(accessToken) {
      const out: GoogleCalendarEntry[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`${API}/users/me/calendarList`);
        url.searchParams.set("maxResults", "250");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const j = await (await request(url.toString(), { method: "GET" }, accessToken)).json() as { items?: GoogleCalendarEntry[]; nextPageToken?: string };
        out.push(...(j.items ?? []));
        pageToken = j.nextPageToken;
      } while (pageToken);
      return out;
    },

    async listEvents(accessToken, calendarId, params) {
      const url = new URL(`${API}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("singleEvents", "false"); // 반복 원본과 예외를 그대로 가져온다
      url.searchParams.set("maxResults", "250");
      if (params.syncToken) url.searchParams.set("syncToken", params.syncToken);
      else {
        if (params.timeMin) url.searchParams.set("timeMin", params.timeMin);
        if (params.timeMax) url.searchParams.set("timeMax", params.timeMax);
        if (params.showDeleted) url.searchParams.set("showDeleted", "true");
      }
      if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);
      const j = await (await request(url.toString(), { method: "GET" }, accessToken)).json() as EventsPage;
      return { items: j.items ?? [], nextPageToken: j.nextPageToken, nextSyncToken: j.nextSyncToken };
    },

    async getEvent(accessToken, calendarId, eventId) {
      try {
        const res = await request(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "GET" }, accessToken);
        return await res.json() as GoogleEvent;
      } catch (e) {
        if (e instanceof GoogleApiError && (e.code === "not_found" || e.code === "gone")) return null;
        throw e;
      }
    },
  };
}
