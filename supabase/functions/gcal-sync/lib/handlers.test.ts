import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken, keyRingFromEnv, signState } from "./crypto.ts";
import { FakeGoogle, FakeStore } from "./fake.ts";
import { disconnect, oauthCallback, oauthStart, refreshCalendars, type HandlerDeps } from "./handlers.ts";

const NOW = new Date("2026-10-14T03:00:00Z");
const ring = keyRingFromEnv((n) => (n === "TOKEN_ENC_KEY" ? btoa(String.fromCharCode(...new Uint8Array(32).fill(5))) : undefined));
let api: FakeGoogle;
let store: FakeStore;
let deps: HandlerDeps;

beforeEach(() => {
  api = new FakeGoogle();
  store = new FakeStore();
  store.conn = null;
  api.calendarList = [
    { id: "me@gmail.com", summary: "개인", backgroundColor: "#9fe1e7", accessRole: "owner", primary: true },
    { id: "holiday@group", summary: "대한민국 공휴일", backgroundColor: "#ff0000", accessRole: "reader" },
    { id: "family@group", summary: "가족", accessRole: "writer" },
    { id: "mycal@group", summary: " MyCal ", backgroundColor: "#123456", accessRole: "owner" },
  ];
  deps = {
    api, ring, now: () => NOW, redirectUri: "https://p.supabase.co/functions/v1/gcal-sync/oauth/callback",
    allowedReturnOrigins: ["http://localhost:3000"], admin: store, runDeps: () => { throw new Error("unused"); },
    syncBudgetMs: 1000, syncAllBudgetMs: 1000,
  };
});

const stateFor = (u = "user-1", r = "http://localhost:3000/settings/google", e = Math.floor(NOW.getTime() / 1000) + 600) => signState({ u, r, e }, ring);

describe("oauthStart", () => {
  it("허용된 origin 이면 서명된 state 로 구글 URL 생성", async () => {
    const { url } = await oauthStart("user-1", "http://localhost:3000/settings/google", deps);
    expect(url).toBe("https://accounts.example/auth");
  });
  it("허용되지 않은 origin 은 거부 (오픈 리다이렉트 방지)", async () => {
    await expect(oauthStart("user-1", "https://evil.example/x", deps)).rejects.toMatchObject({ status: 400 });
    await expect(oauthStart("user-1", "not a url", deps)).rejects.toMatchObject({ status: 400 });
  });
});

describe("oauthCallback", () => {
  it("성공: 토큰을 암호화 저장하고 mycal 캘린더만 저장·활성화한 뒤 앱으로 돌아간다", async () => {
    const r = await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    expect(r).toEqual({ redirect: "http://localhost:3000/settings/google?google=connected" });
    expect(store.conn?.refresh_token_enc).not.toContain("refresh-token-plain");
    expect(await decryptToken(store.conn!.refresh_token_enc, ring)).toBe("refresh-token-plain");
    expect(store.email).toBe("me@gmail.com"); // 계정 이메일은 기본 캘린더 id
    expect(store.calendarRows.map((c) => [c.google_calendar_id, c.sync_enabled])).toEqual([["mycal@group", true]]); // 다른 캘린더는 가져오지 않음
  });

  it("mycal 이 없으면 연결은 하되 no_target 으로 안내", async () => {
    api.calendarList = api.calendarList.filter((c) => c.id !== "mycal@group");
    const r = await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    expect(r).toEqual({ redirect: "http://localhost:3000/settings/google?google=no_target" });
    expect(store.conn).not.toBeNull();
    expect(store.calendarRows).toEqual([]);
  });

  it("재연결이면 사용자가 꺼 둔 선택을 바꾸지 않는다", async () => {
    await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    store.calendarRows[0].sync_enabled = false;
    await oauthCallback(new URLSearchParams({ code: "c2", state: await stateFor() }), deps);
    expect(store.calendarRows).toHaveLength(1);
    expect(store.calendarRows[0].sync_enabled).toBe(false);
  });

  it("state 가 없거나 위조·만료되면 오류(연결 안 함)", async () => {
    expect(await oauthCallback(new URLSearchParams({ code: "c" }), deps)).toHaveProperty("error");
    expect(await oauthCallback(new URLSearchParams({ code: "c", state: "x.y" }), deps)).toHaveProperty("error");
    const expired = await stateFor("u", "http://localhost:3000/", 1);
    expect(await oauthCallback(new URLSearchParams({ code: "c", state: expired }), deps)).toHaveProperty("error");
    expect(store.conn).toBeNull();
  });

  it("사용자가 거부하면 denied 로 돌려보냄", async () => {
    const r = await oauthCallback(new URLSearchParams({ error: "access_denied", state: await stateFor() }), deps);
    expect(r).toEqual({ redirect: "http://localhost:3000/settings/google?google=denied" });
  });

  it("refresh token 이 없으면 연결하지 않음", async () => {
    api.exchange = { refreshToken: null, accessToken: "a" };
    const r = await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    expect(r).toEqual({ redirect: "http://localhost:3000/settings/google?google=no_refresh" });
    expect(store.conn).toBeNull();
  });
});

describe("refreshCalendars / disconnect", () => {
  it("연결이 없으면 404", async () => {
    await expect(refreshCalendars("user-1", deps)).rejects.toMatchObject({ status: 404 });
  });

  it("목록 새로고침도 mycal 만 반영하고 target_found 를 알려 준다", async () => {
    await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    api.calendarList.push({ id: "new@group", summary: "새 캘린더", accessRole: "owner" });
    const r = await refreshCalendars("user-1", deps);
    expect(r.target_found).toBe(true);
    expect(r.target_name).toBe("mycal");
    expect(r.calendars.map((c) => c.google_calendar_id)).toEqual(["mycal@group"]);

    api.calendarList = api.calendarList.filter((c) => c.id !== "mycal@group");
    expect((await refreshCalendars("user-1", deps)).target_found).toBe(false);
  });

  it("해제: 구글 revoke(평문 토큰) + 로컬 토큰 삭제 + 동기화 중지", async () => {
    await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    const r = await disconnect("user-1", false, deps);
    expect(r).toEqual({ ok: true, had_connection: true });
    expect(api.revoked).toEqual(["refresh-token-plain"]);
    expect(store.conn).toBeNull();
    expect(store.calendarRows.every((c) => !c.sync_enabled)).toBe(true);
    expect(store.deleteEventsCalled).toBe(false);
  });

  it("구글 revoke 가 실패해도 로컬 토큰은 삭제됨", async () => {
    await oauthCallback(new URLSearchParams({ code: "c", state: await stateFor() }), deps);
    api.revokeError = true;
    await expect(disconnect("user-1", true, deps)).resolves.toMatchObject({ ok: true });
    expect(store.conn).toBeNull();
    expect(store.deleteEventsCalled).toBe(true);
  });

  it("이미 해제된 상태에서 다시 호출해도 안전", async () => {
    expect(await disconnect("user-1", false, deps)).toEqual({ ok: true, had_connection: false });
    expect(api.revoked).toEqual([]);
  });
});
