import { describe, expect, it } from "vitest";
import { createGoogleApi, GoogleApiError, SCOPES } from "./google.ts";

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function make(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const api = createGoogleApi({
    clientId: "cid", clientSecret: "csecret",
    fetchFn: (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      const r = responses.shift();
      if (!r) throw new Error("no response");
      if (r instanceof Error) throw r;
      return r;
    }) as unknown as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { api, calls, sleeps };
}

describe("authUrl", () => {
  it("offline + consent + 최소 스코프", () => {
    const { api } = make([]);
    const u = new URL(api.authUrl({ redirectUri: "https://x/cb", state: "S" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(u.searchParams.get("state")).toBe("S");
    expect(u.searchParams.get("client_id")).toBe("cid");
  });
});

describe("재시도와 오류 분류", () => {
  it("429/5xx 는 지수 백오프로 재시도 후 성공", async () => {
    const { api, sleeps, calls } = make([res(503, {}), res(429, {}, { "Retry-After": "2" }), res(200, { items: [{ id: "a" }], nextSyncToken: "t" })]);
    const page = await api.listEvents("at", "cal@x.com", { timeMin: "a", timeMax: "b" });
    expect(page.items).toHaveLength(1);
    expect(sleeps).toEqual([500, 2000]);
    expect(calls).toHaveLength(3);
  });

  it("재시도 한도를 넘으면 오류", async () => {
    const { api } = make([res(500, {}), res(500, {}), res(500, {}), res(500, {}), res(500, {})]);
    await expect(api.listEvents("at", "c", {})).rejects.toMatchObject({ code: "server", permanent: false });
  });

  it("invalid_grant 는 영구 오류(재시도 없음)", async () => {
    const { api, calls } = make([res(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })]);
    await expect(api.refreshAccessToken("rt")).rejects.toMatchObject({ code: "invalid_grant", permanent: true });
    expect(calls).toHaveLength(1);
  });

  it("403 rateLimitExceeded 는 재시도, insufficientPermissions 는 영구", async () => {
    const limited = { error: { errors: [{ reason: "rateLimitExceeded" }] } };
    const denied = { error: { errors: [{ reason: "insufficientPermissions" }] } };
    const ok = make([res(403, limited), res(200, { items: [] })]);
    await expect(ok.api.listEvents("at", "c", {})).resolves.toBeDefined();
    const bad = make([res(403, denied)]);
    await expect(bad.api.listEvents("at", "c", {})).rejects.toMatchObject({ code: "forbidden", permanent: true });
  });

  it("410 은 gone, 네트워크 오류는 재시도 후 network", async () => {
    await expect(make([res(410, {})]).api.listEvents("at", "c", { syncToken: "x" })).rejects.toMatchObject({ code: "gone" });
    const net = make(Array.from({ length: 5 }, () => new Error("boom")));
    await expect(net.api.listEvents("at", "c", {})).rejects.toBeInstanceOf(GoogleApiError);
  });

  it("오류 메시지에 토큰·시크릿이 들어가지 않는다", async () => {
    const { api } = make([res(400, { error: "invalid_grant" })]);
    const e = (await api.refreshAccessToken("super-secret-refresh").catch((x) => x)) as Error;
    expect(e.message).not.toContain("super-secret-refresh");
    expect(e.message).not.toContain("csecret");
  });
});

describe("요청 형태", () => {
  it("syncToken 사용 시 timeMin/timeMax 를 보내지 않고, singleEvents=false", async () => {
    const { api, calls } = make([res(200, { items: [] }), res(200, { items: [] })]);
    await api.listEvents("at", "a@b.com", { syncToken: "S", timeMin: "x", timeMax: "y" });
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("syncToken")).toBe("S");
    expect(u.searchParams.has("timeMin")).toBe(false);
    expect(u.searchParams.get("singleEvents")).toBe("false");
    expect(u.pathname).toContain(encodeURIComponent("a@b.com"));
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
  });

  it("getEvent 는 404 를 null 로", async () => {
    const { api } = make([res(404, { error: { errors: [{ reason: "notFound" }] } })]);
    expect(await api.getEvent("at", "c", "e")).toBeNull();
  });

  it("calendarList 는 페이지를 모두 읽는다", async () => {
    const { api } = make([res(200, { items: [{ id: "1" }], nextPageToken: "n" }), res(200, { items: [{ id: "2" }] })]);
    expect((await api.listCalendars("at")).map((c) => c.id)).toEqual(["1", "2"]);
  });
});
