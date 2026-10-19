// OAuth 2.1 순수 로직: PKCE, 리디렉션 URI 검증, 범위 정규화, 응답 형식. DB·네트워크 비의존.
import { sha256Hex } from "./token.ts";
import type { Scopes } from "./tools-schema.ts";

export const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1시간
export const REFRESH_TOKEN_TTL_SEC = 90 * 24 * 60 * 60; // 90일
export const CODE_TTL_SEC = 5 * 60; // 인가 코드 5분
export const MAX_CLIENTS = 500; // 익명 DCR 남용 방지 상한

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// ── 인코딩 ────────────────────────────────────────────────
const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** 인가 코드·리프레시 토큰 등 불투명 랜덤 값 (256비트) */
export const randomSecret = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));

// ── PKCE (S256 만 허용, RFC 7636) ─────────────────────────
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/; // base64url(SHA-256) 길이 43

export const isValidChallenge = (c: unknown): c is string => typeof c === "string" && CHALLENGE_RE.test(c);

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** code_verifier 가 저장된 code_challenge 와 일치하는가 (상수 시간 비교) */
export async function verifyPkce(verifier: unknown, challenge: string): Promise<boolean> {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return false;
  const got = await challengeOf(verifier);
  if (got.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

// ── 리디렉션 URI ─────────────────────────────────────────
const isLoopback = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/** 등록 가능한 redirect_uri 인가: https 이거나 루프백 http. 프래그먼트·와일드카드·사용자정보 금지. */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000 || raw.includes("*")) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && isLoopback(u.hostname));
}

/** 등록된 목록과 완전 일치(문자열 비교)해야 한다. 부분 일치·정규화 없음. */
export const redirectMatches = (registered: string[], given: unknown): given is string =>
  typeof given === "string" && registered.includes(given);

/** DCR 요청 본문 검증 (RFC 7591). 공개 클라이언트(token_endpoint_auth_method=none)만 지원한다. */
export function parseRegistration(body: unknown): { client_name: string; redirect_uris: string[] } {
  const b = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10 || !uris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris 는 https 또는 로컬 http 주소 1~10개여야 합니다.");
  }
  const method = b.token_endpoint_auth_method ?? "none";
  if (method !== "none") throw new OAuthError("invalid_client_metadata", "공개 클라이언트(token_endpoint_auth_method=none)만 지원합니다.");
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.every((g) => g === "authorization_code" || g === "refresh_token"))) {
    throw new OAuthError("invalid_client_metadata", "grant_types 는 authorization_code, refresh_token 만 지원합니다.");
  }
  const name = typeof b.client_name === "string" ? b.client_name.trim().slice(0, 100) : "";
  return { client_name: name || "이름 없는 앱", redirect_uris: [...new Set(uris as string[])] };
}

// ── 범위 ─────────────────────────────────────────────────
const LEVEL = { none: 0, read: 1, write: 2 } as const;
export type Level = keyof typeof LEVEL;

export function normalizeGranted(raw: unknown): Scopes {
  const o = (typeof raw === "object" && raw ? raw : {}) as Record<string, unknown>;
  const pick = (k: string): Level => (o[k] === "read" || o[k] === "write" ? o[k] : "none");
  return { calendar: pick("calendar"), todo: pick("todo"), ledger: pick("ledger") };
}

/** 모든 서비스가 none 이면 연결 의미가 없으므로 승인할 수 없다. */
export const hasAccess = (s: Scopes) => Object.values(s).some((v) => v !== "none");

/** a 가 b 를 넘지 않는가 (범위 상승 방지: 갱신 시 처음 승인한 범위를 넘을 수 없다) */
export const isSubset = (a: Scopes, b: Scopes) => (Object.keys(a) as (keyof Scopes)[]).every((k) => LEVEL[a[k]] <= LEVEL[b[k]]);

/** 응답의 scope 문자열: 'calendar:read todo:write' (none 제외) */
export const scopeString = (s: Scopes) => (Object.entries(s) as [string, Level][]).filter(([, v]) => v !== "none").map(([k, v]) => `${k}:${v}`).join(" ");

// ── 해시·응답 ────────────────────────────────────────────
export const hashSecret = sha256Hex;

export function tokenResponse(p: { accessToken: string; refreshToken: string; scopes: Scopes }) {
  return {
    access_token: p.accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: p.refreshToken,
    scope: scopeString(p.scopes),
  };
}

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

/** 메타데이터 문서 (RFC 9728 / RFC 8414). issuer 는 웹 앱 주소(루트 well-known 을 제공할 수 있는 곳). */
export function protectedResourceMetadata(resource: string, issuer: string) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["calendar:read", "calendar:write", "todo:read", "todo:write", "ledger:read", "ledger:write"],
    resource_name: "라이프 매니저",
  };
}

export function authorizationServerMetadata(issuer: string, fnBase: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${fnBase}/token`,
    registration_endpoint: `${fnBase}/register`,
    revocation_endpoint: `${fnBase}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["calendar:read", "calendar:write", "todo:read", "todo:write", "ledger:read", "ledger:write"],
  };
}
