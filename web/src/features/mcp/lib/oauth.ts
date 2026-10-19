// OAuth 동의 화면(/oauth/authorize)의 순수 로직. 실제 검증(client·redirect·PKCE)은 mcp 함수가 하고, 여기서는 화면에 필요한 형태만 다룬다.
import type { Scopes } from "./mcp";

export type AuthorizeRequest = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  resource?: string;
};

export type ParsedQuery = { ok: true; request: AuthorizeRequest } | { ok: false; error: string };

/** 인가 요청 쿼리를 읽는다. 필수 값이 빠졌거나 response_type 이 code 가 아니면 오류 문구를 돌려준다. */
export function parseAuthorizeQuery(q: URLSearchParams): ParsedQuery {
  if (q.get("response_type") !== "code") return { ok: false, error: "지원하지 않는 요청이에요 (response_type=code 필요)." };
  const client_id = q.get("client_id"), redirect_uri = q.get("redirect_uri"), code_challenge = q.get("code_challenge");
  if (!client_id || !redirect_uri || !code_challenge) return { ok: false, error: "연결 요청 정보가 부족해요. 연결을 시작한 앱에서 다시 시도해 주세요." };
  if (q.get("code_challenge_method") !== "S256") return { ok: false, error: "안전한 연결 방식(PKCE S256)이 아닌 요청이에요." };
  return {
    ok: true,
    request: {
      client_id, redirect_uri, code_challenge, code_challenge_method: "S256",
      ...(q.get("state") ? { state: q.get("state")! } : {}),
      ...(q.get("resource") ? { resource: q.get("resource")! } : {}),
    },
  };
}

/** 승인 후 돌아갈 주소의 호스트(피싱 방지를 위해 사용자에게 보여 준다). 잘못된 주소면 null. */
export function redirectHost(uri: string): string | null {
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/** 승인 API 요청 본문 */
export function approvalBody(req: AuthorizeRequest, scopes: Scopes, decision: "approve" | "deny") {
  return { ...req, scopes, decision };
}

/** 권한 요약 문장: '일정 읽기, 할일 읽기·쓰기' (없음 제외) */
export function scopeSummary(s: Scopes): string {
  const name = { calendar: "일정", todo: "할일", ledger: "가계부" } as const;
  const lvl = { read: "읽기", write: "읽기·쓰기" } as const;
  const parts = (Object.keys(name) as (keyof Scopes)[]).filter((k) => s[k] !== "none").map((k) => `${name[k]} ${lvl[s[k] as "read" | "write"]}`);
  return parts.length ? parts.join(", ") : "허용 없음";
}

/** 인가 서버 메타데이터(RFC 8414). 웹 앱 루트의 /.well-known/oauth-authorization-server 가 제공한다. */
export function authorizationServerMetadata(issuer: string, fnBase: string) {
  const scopes = ["calendar:read", "calendar:write", "todo:read", "todo:write", "ledger:read", "ledger:write"];
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
    scopes_supported: scopes,
  };
}
