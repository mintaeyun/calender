import { describe, expect, it } from "vitest";
import { authorize, exchangeCode, parseScopeString, refreshGrant, registerClient, revoke, tokenUsable, type Client, type CodeRow, type Store, type TokenRow } from "./oauth-flow.ts";
import { challengeOf, isSubset, OAuthError, parseRegistration, redirectMatches, validRedirectUri, verifyPkce } from "./oauth.ts";
import { hashSecret } from "./oauth.ts";

// ── 메모리 저장소 ─────────────────────────────────────────
function memoryStore() {
  const clients = new Map<string, Client & { created_at: string }>();
  const codes = new Map<string, CodeRow>();
  const tokens = new Map<string, TokenRow & { token_hash: string; expires_at: string }>();
  let n = 0;
  const store: Store = {
    async countClients() { return clients.size; },
    async insertClient(c) { const row = { id: `c${++n}`, ...c, created_at: new Date().toISOString() }; clients.set(row.id, row); return row; },
    async getClient(id) { return clients.get(id) ?? null; },
    async touchClient() {},
    async insertCode(c) { codes.set(c.code_hash, { ...c, used_at: null, token_id: null }); },
    async consumeCode(hash) {
      const row = codes.get(hash);
      if (!row) return { row: null, used: false };
      if (row.used_at) return { row, used: true };
      row.used_at = new Date().toISOString();
      return { row, used: false };
    },
    async attachTokenToCode(hash, id) { codes.get(hash)!.token_id = id; },
    async insertToken(t) {
      const id = `t${++n}`;
      tokens.set(id, { id, user_id: t.user_id, client_id: t.client_id, scopes: t.scopes, revoked_at: null, refresh_hash: t.refresh_hash, prev_refresh_hash: null, refresh_expires_at: t.refresh_expires_at, client_name: t.client_name, token_hash: t.token_hash, expires_at: t.expires_at });
      return id;
    },
    async revokeToken(id) { const t = tokens.get(id); if (t) t.revoked_at = new Date().toISOString(); },
    async findByRefresh(h) { return [...tokens.values()].find((t) => t.refresh_hash === h) ?? null; },
    async findByPrevRefresh(h) { return [...tokens.values()].find((t) => t.prev_refresh_hash === h) ?? null; },
    async findByAccess(h) { return [...tokens.values()].find((t) => t.token_hash === h) ?? null; },
    async rotate(id, expected, next) {
      const t = tokens.get(id);
      if (!t || t.refresh_hash !== expected) return false;
      Object.assign(t, { token_hash: next.token_hash, expires_at: next.expires_at, refresh_hash: next.refresh_hash, prev_refresh_hash: next.prev_refresh_hash, refresh_expires_at: next.refresh_expires_at });
      return true;
    },
  };
  return { store, clients, codes, tokens };
}

const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const RESOURCE = "https://x.supabase.co/functions/v1/mcp";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // RFC 7636 부록 B
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const read = { calendar: "read", todo: "read", ledger: "none" } as const;

async function setup() {
  const m = memoryStore();
  const reg = await registerClient(m.store, { client_name: "ChatGPT", redirect_uris: [REDIRECT] });
  const params = (over: Record<string, unknown> = {}) => ({
    client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: "S256", state: "st", scopes: read, decision: "approve", ...over,
  });
  const getCode = async (over: Record<string, unknown> = {}) => {
    const { redirect } = await authorize(m.store, "user-A", params(over), { resourceUrl: RESOURCE });
    return new URL(redirect).searchParams.get("code")!;
  };
  const form = (code: string, over: Record<string, unknown> = {}) => ({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER, ...over });
  return { ...m, reg, params, getCode, form };
}

describe("PKCE", () => {
  it("RFC 7636 예제 벡터와 일치", async () => {
    expect(await challengeOf(VERIFIER)).toBe(CHALLENGE);
    expect(await verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
  });
  it("틀린 verifier·짧은 verifier·타입 오류는 거부", async () => {
    expect(await verifyPkce(VERIFIER + "x", CHALLENGE)).toBe(false);
    expect(await verifyPkce("short", CHALLENGE)).toBe(false);
    expect(await verifyPkce(undefined, CHALLENGE)).toBe(false);
  });
});

describe("리디렉션 URI·등록", () => {
  it("https 와 루프백 http 만, 프래그먼트·와일드카드·사용자정보 거부", () => {
    expect(["https://a.com/cb", "http://localhost:3000/cb", "http://127.0.0.1/cb"].every(validRedirectUri)).toBe(true);
    expect(["http://a.com/cb", "https://a.com/cb#x", "https://*.a.com/cb", "https://u:p@a.com/cb", "javascript:alert(1)", "nope", 5].some(validRedirectUri)).toBe(false);
  });
  it("완전 일치만 허용 (접두사·쿼리 추가 불가)", () => {
    expect(redirectMatches([REDIRECT], REDIRECT)).toBe(true);
    expect(redirectMatches([REDIRECT], REDIRECT + "/evil")).toBe(false);
    expect(redirectMatches([REDIRECT], REDIRECT + "?x=1")).toBe(false);
  });
  it("공개 클라이언트만 등록, 이름 기본값", () => {
    expect(() => parseRegistration({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" })).toThrow(OAuthError);
    expect(() => parseRegistration({ redirect_uris: [] })).toThrow(OAuthError);
    expect(parseRegistration({ redirect_uris: [REDIRECT, REDIRECT] })).toEqual({ client_name: "이름 없는 앱", redirect_uris: [REDIRECT] });
  });
});

describe("인가", () => {
  it("승인하면 redirect_uri 로 code 와 state 를 돌려준다", async () => {
    const s = await setup();
    const u = new URL((await authorize(s.store, "user-A", s.params(), { resourceUrl: RESOURCE })).redirect);
    expect(u.origin + u.pathname).toBe(REDIRECT);
    expect(u.searchParams.get("code")).toBeTruthy();
    expect(u.searchParams.get("state")).toBe("st");
  });
  it("등록되지 않은 redirect_uri·client 는 리디렉션하지 않고 오류", async () => {
    const s = await setup();
    await expect(authorize(s.store, "u", s.params({ redirect_uri: "https://evil.example/cb" }), { resourceUrl: RESOURCE })).rejects.toThrow(/일치하지 않습니다/);
    await expect(authorize(s.store, "u", s.params({ client_id: "nope" }), { resourceUrl: RESOURCE })).rejects.toThrow(OAuthError);
  });
  it("PKCE 없음/plain, resource 불일치, 거절, 빈 범위는 오류 리디렉션(코드 미발급)", async () => {
    const s = await setup();
    const err = async (over: Record<string, unknown>) => new URL((await authorize(s.store, "u", s.params(over), { resourceUrl: RESOURCE })).redirect).searchParams.get("error");
    expect(await err({ code_challenge_method: "plain" })).toBe("invalid_request");
    expect(await err({ code_challenge: undefined })).toBe("invalid_request");
    expect(await err({ resource: "https://other.example/mcp" })).toBe("invalid_target");
    expect(await err({ decision: "deny" })).toBe("access_denied");
    expect(await err({ scopes: { calendar: "none", todo: "none", ledger: "none" } })).toBe("access_denied");
    expect(s.codes.size).toBe(0);
    expect(await err({ resource: RESOURCE + "/" })).toBeNull(); // 끝 슬래시 차이는 같은 리소스로 보고 허용(코드 발급)
    expect(s.codes.size).toBe(1);
  });
});

describe("토큰 교환", () => {
  it("성공: 승인한 범위로 액세스·리프레시 발급, 저장은 해시만", async () => {
    const s = await setup();
    const r = await exchangeCode(s.store, s.form(await s.getCode()));
    expect(r.access_token).toMatch(/^lm_/);
    expect(r.refresh_token).toMatch(/^lmr_/);
    expect(r.scope).toBe("calendar:read todo:read");
    expect(r.expires_in).toBe(3600);
    const t = [...s.tokens.values()][0];
    expect(t.user_id).toBe("user-A");
    expect(t.token_hash).toBe(await hashSecret(r.access_token));
    expect(JSON.stringify([...s.tokens.values()])).not.toContain(r.refresh_token);
  });
  it("코드 재사용: 거부하고 이미 발급된 연결을 폐기", async () => {
    const s = await setup();
    const code = await s.getCode();
    await exchangeCode(s.store, s.form(code));
    await expect(exchangeCode(s.store, s.form(code))).rejects.toThrow(/이미 사용/);
    expect([...s.tokens.values()][0].revoked_at).not.toBeNull();
  });
  it("PKCE 불일치·redirect 불일치·다른 클라이언트·만료는 거부", async () => {
    const s = await setup();
    await expect(exchangeCode(s.store, s.form(await s.getCode(), { code_verifier: "x".repeat(50) }))).rejects.toThrow(/PKCE/);
    await expect(exchangeCode(s.store, s.form(await s.getCode(), { redirect_uri: REDIRECT + "/x" }))).rejects.toThrow(/redirect_uri/);
    const other = await registerClient(s.store, { client_name: "다른 앱", redirect_uris: ["https://b.example/cb"] });
    await expect(exchangeCode(s.store, s.form(await s.getCode(), { client_id: other.client_id }))).rejects.toThrow(/다른 앱/);
    await expect(exchangeCode(s.store, s.form(await s.getCode()), new Date(Date.now() + 6 * 60_000))).rejects.toThrow(/만료/);
    await expect(exchangeCode(s.store, s.form("garbage"))).rejects.toThrow(/유효하지 않은/);
    expect(s.tokens.size).toBe(0);
  });
});

describe("갱신·폐기", () => {
  it("회전: 새 토큰을 주고 이전 액세스는 더 쓰이지 않으며, 옛 리프레시 재사용 시 연결 전체 폐기", async () => {
    const s = await setup();
    const first = await exchangeCode(s.store, s.form(await s.getCode()));
    const second = await refreshGrant(s.store, { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: s.reg.client_id });
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    const row = [...s.tokens.values()][0];
    expect(row.token_hash).toBe(await hashSecret(second.access_token)); // 이전 액세스 해시는 더 이상 유효하지 않음
    // 옛 리프레시 재사용(탈취 의심)
    await expect(refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: s.reg.client_id })).rejects.toThrow(/유효하지 않은/);
    expect(row.revoked_at).not.toBeNull();
    // 폐기 후에는 최신 리프레시도 거부
    await expect(refreshGrant(s.store, { refresh_token: second.refresh_token, client_id: s.reg.client_id })).rejects.toThrow(/폐기/);
  });
  it("범위 상승 시도는 거부, 같거나 줄이는 것은 허용", async () => {
    const s = await setup();
    const first = await exchangeCode(s.store, s.form(await s.getCode()));
    await expect(refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: s.reg.client_id, scope: "calendar:write" })).rejects.toThrow(/범위/);
    await expect(refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: s.reg.client_id, scope: "ledger:read" })).rejects.toThrow(/범위/);
    const ok = await refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: s.reg.client_id, scope: "calendar:read" });
    expect(ok.scope).toBe("calendar:read todo:read"); // 승인 범위 유지
  });
  it("다른 클라이언트·만료된 리프레시는 거부", async () => {
    const s = await setup();
    const first = await exchangeCode(s.store, s.form(await s.getCode()));
    await expect(refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: "other" })).rejects.toThrow(/다른 앱/);
    await expect(refreshGrant(s.store, { refresh_token: first.refresh_token, client_id: s.reg.client_id }, new Date(Date.now() + 91 * 86_400_000))).rejects.toThrow(/만료/);
  });
  it("폐기 엔드포인트: 액세스·리프레시 어느 쪽이든 연결 폐기, 모르는 토큰은 조용히 성공", async () => {
    const s = await setup();
    const t = await exchangeCode(s.store, s.form(await s.getCode()));
    await revoke(s.store, { token: "unknown", client_id: s.reg.client_id });
    expect([...s.tokens.values()][0].revoked_at).toBeNull();
    await revoke(s.store, { token: t.access_token, client_id: s.reg.client_id });
    expect([...s.tokens.values()][0].revoked_at).not.toBeNull();
  });
  it("다른 클라이언트는 남의 연결을 폐기할 수 없다", async () => {
    const s = await setup();
    const t = await exchangeCode(s.store, s.form(await s.getCode()));
    await revoke(s.store, { token: t.refresh_token, client_id: "someone-else" });
    expect([...s.tokens.values()][0].revoked_at).toBeNull();
  });
});

describe("범위·토큰 사용 가능 판정", () => {
  it("scope 문자열 파싱과 부분집합", () => {
    expect(parseScopeString("calendar:read todo:write bogus ledger:admin")).toEqual({ calendar: "read", todo: "write", ledger: "none" });
    expect(isSubset({ calendar: "read", todo: "none", ledger: "none" }, { calendar: "write", todo: "read", ledger: "none" })).toBe(true);
    expect(isSubset({ calendar: "write", todo: "none", ledger: "none" }, { calendar: "read", todo: "read", ledger: "read" })).toBe(false);
  });
  it("폐기·만료된 토큰은 사용 불가, 수동 토큰(만료 없음)은 가능", () => {
    const now = new Date("2026-10-21T00:00:00Z");
    expect(tokenUsable({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(tokenUsable({ revoked_at: null, expires_at: "2026-10-21T01:00:00Z" }, now)).toBe(true);
    expect(tokenUsable({ revoked_at: null, expires_at: "2026-10-20T23:59:59Z" }, now)).toBe(false);
    expect(tokenUsable({ revoked_at: "2026-10-20T00:00:00Z", expires_at: null }, now)).toBe(false);
  });
});
