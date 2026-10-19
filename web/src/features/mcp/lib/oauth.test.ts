import { describe, expect, it } from "vitest";
import { approvalBody, authorizationServerMetadata, parseAuthorizeQuery, redirectHost, scopeSummary } from "./oauth";

const q = (s: string) => new URLSearchParams(s);
const base = "response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcb&code_challenge=abc&code_challenge_method=S256&state=st";

describe("parseAuthorizeQuery", () => {
  it("정상 요청", () => {
    const r = parseAuthorizeQuery(q(base));
    expect(r).toEqual({ ok: true, request: { client_id: "c1", redirect_uri: "https://chatgpt.com/cb", code_challenge: "abc", code_challenge_method: "S256", state: "st" } });
  });
  it("PKCE S256·response_type=code·필수 값이 아니면 오류", () => {
    expect(parseAuthorizeQuery(q(base.replace("S256", "plain"))).ok).toBe(false);
    expect(parseAuthorizeQuery(q(base.replace("response_type=code", "response_type=token"))).ok).toBe(false);
    expect(parseAuthorizeQuery(q("response_type=code&client_id=c1")).ok).toBe(false);
  });
  it("resource 가 있으면 전달", () => {
    const r = parseAuthorizeQuery(q(base + "&resource=https%3A%2F%2Fx.supabase.co%2Ffunctions%2Fv1%2Fmcp"));
    expect(r.ok && r.request.resource).toBe("https://x.supabase.co/functions/v1/mcp");
  });
});

describe("표시·본문", () => {
  it("돌아갈 호스트와 권한 요약", () => {
    expect(redirectHost("https://chatgpt.com/cb")).toBe("chatgpt.com");
    expect(redirectHost("nope")).toBeNull();
    expect(scopeSummary({ calendar: "read", todo: "write", ledger: "none" })).toBe("일정 읽기, 할일 읽기·쓰기");
    expect(scopeSummary({ calendar: "none", todo: "none", ledger: "none" })).toBe("허용 없음");
  });
  it("승인 본문에 범위와 결정 포함", () => {
    const r = parseAuthorizeQuery(q(base));
    if (!r.ok) throw new Error("x");
    expect(approvalBody(r.request, { calendar: "read", todo: "read", ledger: "read" }, "deny")).toMatchObject({ client_id: "c1", decision: "deny", scopes: { ledger: "read" } });
  });
});

describe("인가 서버 메타데이터", () => {
  it("S256·공개 클라이언트·함수 엔드포인트", () => {
    const m = authorizationServerMetadata("https://app.example", "https://x.supabase.co/functions/v1/mcp");
    expect(m.issuer).toBe("https://app.example");
    expect(m.authorization_endpoint).toBe("https://app.example/oauth/authorize");
    expect(m.token_endpoint).toBe("https://x.supabase.co/functions/v1/mcp/token");
    expect(m.registration_endpoint).toBe("https://x.supabase.co/functions/v1/mcp/register");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});
