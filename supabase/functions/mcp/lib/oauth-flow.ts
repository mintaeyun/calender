// OAuth 2.1 흐름(등록 → 인가 → 토큰 교환 → 갱신 → 폐기). 저장소는 Store 인터페이스로 주입해 Node 에서 테스트한다.
// 원칙: 코드 1회용·단기 만료, PKCE S256 필수, redirect_uri 완전 일치, 리프레시 토큰 회전 + 재사용 감지(재사용하면 연결 전체 폐기),
//       갱신 시 범위 상승 불가, 모든 비밀값(코드·리프레시·액세스)은 해시만 저장.
import { generateToken } from "./token.ts";
import {
  ACCESS_TOKEN_TTL_SEC, CODE_TTL_SEC, MAX_CLIENTS, OAuthError, REFRESH_TOKEN_TTL_SEC,
  hasAccess, hashSecret, isSubset, isValidChallenge, normalizeGranted, parseRegistration, randomSecret, redirectMatches,
  tokenResponse, verifyPkce,
} from "./oauth.ts";
import type { Scopes } from "./tools-schema.ts";

export type Client = { id: string; client_name: string; redirect_uris: string[] };
export type CodeRow = {
  code_hash: string; user_id: string; client_id: string; redirect_uri: string; code_challenge: string;
  scopes: Scopes; resource: string | null; expires_at: string; used_at: string | null; token_id: string | null;
};
export type TokenRow = {
  id: string; user_id: string; client_id: string | null; scopes: Scopes; revoked_at: string | null;
  refresh_hash: string | null; prev_refresh_hash: string | null; refresh_expires_at: string | null; client_name: string | null;
};
export type NewToken = {
  user_id: string; name: string; token_hash: string; token_prefix: string; scopes: Scopes; client_id: string; client_name: string;
  expires_at: string; refresh_hash: string; refresh_expires_at: string;
};
export type Rotation = { token_hash: string; token_prefix: string; expires_at: string; refresh_hash: string; prev_refresh_hash: string; refresh_expires_at: string };

export interface Store {
  countClients(): Promise<number>;
  insertClient(c: { client_name: string; redirect_uris: string[] }): Promise<Client & { created_at: string }>;
  getClient(id: string): Promise<Client | null>;
  touchClient(id: string): Promise<void>;
  insertCode(c: Omit<CodeRow, "used_at" | "token_id">): Promise<void>;
  /** 코드를 원자적으로 사용 처리한다. 이미 쓰였으면 used=true 로 기존 행을 돌려준다(재사용 감지). */
  consumeCode(hash: string, now: Date): Promise<{ row: CodeRow | null; used: boolean }>;
  attachTokenToCode(hash: string, tokenId: string): Promise<void>;
  insertToken(t: NewToken): Promise<string>;
  revokeToken(id: string): Promise<void>;
  findByRefresh(hash: string): Promise<TokenRow | null>;
  findByPrevRefresh(hash: string): Promise<TokenRow | null>;
  findByAccess(hash: string): Promise<TokenRow | null>;
  /** 현재 refresh_hash 가 expectedRefreshHash 일 때만 회전(경쟁 시 한쪽만 성공). */
  rotate(id: string, expectedRefreshHash: string, next: Rotation): Promise<boolean>;
}

/** 끝 슬래시 차이는 같은 리소스로 본다(클라이언트가 입력한 주소 그대로 보내는 경우가 있음). */
const stripSlash = (s: string) => s.replace(/\/+$/, "");
const sameResource = (a: unknown, b: string) => typeof a === "string" && stripSlash(a) === stripSlash(b);

const iso = (d: Date, addSec: number) => new Date(d.getTime() + addSec * 1000).toISOString();

// ── 1. 동적 클라이언트 등록 ──────────────────────────────
export async function registerClient(store: Store, body: unknown) {
  const reg = parseRegistration(body);
  if ((await store.countClients()) >= MAX_CLIENTS) throw new OAuthError("temporarily_unavailable", "등록 가능한 앱 수를 초과했습니다.", 503);
  const c = await store.insertClient(reg);
  return {
    client_id: c.id, client_id_issued_at: Math.floor(new Date(c.created_at).getTime() / 1000), client_name: c.client_name,
    redirect_uris: c.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  };
}

// ── 2. 인가(사용자 승인) ─────────────────────────────────
export type AuthorizeParams = {
  client_id: unknown; redirect_uri: unknown; code_challenge: unknown; code_challenge_method: unknown; state?: unknown;
  resource?: unknown; scopes: unknown; decision: unknown;
};

/** 승인/거절 결과로 보낼 주소를 돌려준다. client·redirect 가 잘못되면 리디렉션하지 않고 오류를 던진다(오픈 리디렉터 방지). */
export async function authorize(store: Store, userId: string, p: AuthorizeParams, o: { resourceUrl: string; now?: Date }): Promise<{ redirect: string }> {
  const now = o.now ?? new Date();
  if (typeof p.client_id !== "string") throw new OAuthError("invalid_request", "client_id 가 필요합니다.");
  const client = await store.getClient(p.client_id);
  if (!client) throw new OAuthError("invalid_client", "등록되지 않은 앱입니다.");
  if (!redirectMatches(client.redirect_uris, p.redirect_uri)) throw new OAuthError("invalid_request", "redirect_uri 가 등록된 주소와 일치하지 않습니다.");
  const redirect = new URL(p.redirect_uri);
  const back = (q: Record<string, string>) => {
    for (const [k, v] of Object.entries(q)) redirect.searchParams.set(k, v);
    if (typeof p.state === "string" && p.state) redirect.searchParams.set("state", p.state);
    return { redirect: redirect.toString() };
  };

  if (p.code_challenge_method !== "S256" || !isValidChallenge(p.code_challenge)) {
    return back({ error: "invalid_request", error_description: "PKCE(S256) code_challenge 가 필요합니다." });
  }
  if (p.resource !== undefined && p.resource !== null && !sameResource(p.resource, o.resourceUrl)) {
    return back({ error: "invalid_target", error_description: "알 수 없는 resource 입니다." });
  }
  if (p.decision !== "approve") return back({ error: "access_denied" });

  const scopes = normalizeGranted(p.scopes);
  if (!hasAccess(scopes)) return back({ error: "access_denied", error_description: "허용된 범위가 없습니다." });

  const code = randomSecret();
  await store.insertCode({
    code_hash: await hashSecret(code), user_id: userId, client_id: client.id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge,
    scopes, resource: typeof p.resource === "string" ? p.resource : null, expires_at: iso(now, CODE_TTL_SEC),
  });
  return back({ code });
}

// ── 3. 토큰 교환 / 4. 갱신 ───────────────────────────────
type Form = Record<string, unknown>;

async function issue(store: Store, p: { userId: string; client: Client; scopes: Scopes; now: Date }) {
  const access = await generateToken();
  const refresh = "lmr_" + randomSecret();
  const refreshHash = await hashSecret(refresh);
  const id = await store.insertToken({
    user_id: p.userId, name: `${p.client.client_name} (OAuth)`, token_hash: access.hash, token_prefix: access.prefix, scopes: p.scopes,
    client_id: p.client.id, client_name: p.client.client_name, expires_at: iso(p.now, ACCESS_TOKEN_TTL_SEC),
    refresh_hash: refreshHash, refresh_expires_at: iso(p.now, REFRESH_TOKEN_TTL_SEC),
  });
  return { id, response: tokenResponse({ accessToken: access.raw, refreshToken: refresh, scopes: p.scopes }) };
}

export async function exchangeCode(store: Store, f: Form, now = new Date()) {
  if (typeof f.code !== "string" || typeof f.client_id !== "string") throw new OAuthError("invalid_request", "code 와 client_id 가 필요합니다.");
  const client = await store.getClient(f.client_id);
  if (!client) throw new OAuthError("invalid_client", "등록되지 않은 앱입니다.", 401);

  const hash = await hashSecret(f.code);
  const { row, used } = await store.consumeCode(hash, now);
  if (!row) throw new OAuthError("invalid_grant", "유효하지 않은 인가 코드입니다.");
  if (used) {
    // 코드 재사용 = 탈취 가능성. 이 코드로 이미 발급된 연결을 폐기한다.
    if (row.token_id) await store.revokeToken(row.token_id);
    throw new OAuthError("invalid_grant", "이미 사용된 인가 코드입니다.");
  }
  if (new Date(row.expires_at) <= now) throw new OAuthError("invalid_grant", "인가 코드가 만료되었습니다.");
  if (row.client_id !== client.id) throw new OAuthError("invalid_grant", "다른 앱에 발급된 코드입니다.");
  if (f.redirect_uri !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri 가 인가 요청과 다릅니다.");
  if (!(await verifyPkce(f.code_verifier, row.code_challenge))) throw new OAuthError("invalid_grant", "PKCE 검증에 실패했습니다.");
  if (f.resource !== undefined && row.resource && f.resource !== row.resource) throw new OAuthError("invalid_target", "resource 가 인가 요청과 다릅니다.");

  const { id, response } = await issue(store, { userId: row.user_id, client, scopes: normalizeGranted(row.scopes), now });
  await store.attachTokenToCode(hash, id);
  await store.touchClient(client.id);
  return response;
}

export async function refreshGrant(store: Store, f: Form, now = new Date()) {
  if (typeof f.refresh_token !== "string" || typeof f.client_id !== "string") throw new OAuthError("invalid_request", "refresh_token 과 client_id 가 필요합니다.");
  const hash = await hashSecret(f.refresh_token);

  const current = await store.findByRefresh(hash);
  if (!current) {
    // 이미 회전된 옛 리프레시 토큰이 다시 오면 탈취로 보고 연결을 폐기한다.
    const stale = await store.findByPrevRefresh(hash);
    if (stale && stale.client_id === f.client_id) await store.revokeToken(stale.id);
    throw new OAuthError("invalid_grant", "유효하지 않은 리프레시 토큰입니다.");
  }
  if (current.revoked_at) throw new OAuthError("invalid_grant", "폐기된 연결입니다.");
  if (current.client_id !== f.client_id) throw new OAuthError("invalid_grant", "다른 앱의 토큰입니다.");
  if (current.refresh_expires_at && new Date(current.refresh_expires_at) <= now) throw new OAuthError("invalid_grant", "리프레시 토큰이 만료되었습니다.");

  // 범위는 줄일 수만 있다(scope 파라미터가 있으면 승인 범위의 부분집합이어야 함). 이 구현은 승인 범위를 그대로 유지한다.
  if (typeof f.scope === "string" && f.scope.trim()) {
    const asked = parseScopeString(f.scope);
    if (!isSubset(asked, normalizeGranted(current.scopes))) throw new OAuthError("invalid_scope", "승인된 범위를 넘을 수 없습니다.");
  }

  const access = await generateToken();
  const refresh = "lmr_" + randomSecret();
  const next: Rotation = {
    token_hash: access.hash, token_prefix: access.prefix, expires_at: iso(now, ACCESS_TOKEN_TTL_SEC),
    refresh_hash: await hashSecret(refresh), prev_refresh_hash: hash, refresh_expires_at: iso(now, REFRESH_TOKEN_TTL_SEC),
  };
  if (!(await store.rotate(current.id, hash, next))) throw new OAuthError("invalid_grant", "이미 갱신된 토큰입니다.");
  if (current.client_id) await store.touchClient(current.client_id);
  return tokenResponse({ accessToken: access.raw, refreshToken: refresh, scopes: normalizeGranted(current.scopes) });
}

/** 'calendar:read todo:write' → Scopes. 알 수 없는 항목은 무시(none). */
export function parseScopeString(s: string): Scopes {
  const out: Scopes = { calendar: "none", todo: "none", ledger: "none" };
  for (const part of s.split(/\s+/)) {
    const [svc, lvl] = part.split(":");
    if ((svc === "calendar" || svc === "todo" || svc === "ledger") && (lvl === "read" || lvl === "write")) out[svc] = lvl;
  }
  return out;
}

// ── 5. 폐기 (RFC 7009) ───────────────────────────────────
/** 액세스 또는 리프레시 토큰을 받아 연결을 폐기한다. 모르는 토큰이어도 성공처럼 응답한다(정보 노출 방지). */
export async function revoke(store: Store, f: Form) {
  if (typeof f.token !== "string" || typeof f.client_id !== "string") throw new OAuthError("invalid_request", "token 과 client_id 가 필요합니다.");
  const hash = await hashSecret(f.token);
  const row = (await store.findByRefresh(hash)) ?? (await store.findByAccess(hash));
  if (row && row.client_id === f.client_id) await store.revokeToken(row.id);
}

/** MCP 요청 인증에서 쓰는 토큰 사용 가능 판정: 폐기되지 않았고 만료 전. */
export const tokenUsable = (t: { revoked_at: string | null; expires_at?: string | null }, now = new Date()) =>
  !t.revoked_at && (!t.expires_at || new Date(t.expires_at) > now);
