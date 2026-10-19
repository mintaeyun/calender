import { describe, expect, it } from "vitest";
import { hasAnyAccess, lastUsedLabel, normalizeScopes, serverUrl, tokenHint } from "./mcp";

describe("mcp 설정 로직", () => {
  it("서버 주소", () => {
    expect(serverUrl("https://abc.supabase.co/")).toBe("https://abc.supabase.co/functions/v1/mcp");
    expect(serverUrl(undefined)).toBeNull();
  });
  it("scopes 정규화: 알 수 없는 값은 none", () => {
    expect(normalizeScopes({ calendar: "write", todo: "read", ledger: "admin" })).toEqual({ calendar: "write", todo: "read", ledger: "none" });
    expect(normalizeScopes(null)).toEqual({ calendar: "none", todo: "none", ledger: "none" });
  });
  it("토큰 힌트·마지막 사용", () => {
    expect(tokenHint("lm_ab12")).toBe("lm_ab12••••");
    expect(tokenHint(null)).toBe("lm_••••");
    const now = new Date("2026-10-19T12:00:00Z");
    expect(lastUsedLabel(null, now)).toBe("사용 기록 없음");
    expect(lastUsedLabel("2026-10-19T11:59:40Z", now)).toBe("방금");
    expect(lastUsedLabel("2026-10-19T11:15:00Z", now)).toBe("45분 전");
    expect(lastUsedLabel("2026-10-19T07:00:00Z", now)).toBe("5시간 전");
    expect(lastUsedLabel("2026-10-16T12:00:00Z", now)).toBe("3일 전");
  });
  it("권한이 하나도 없으면 발급 불가", () => {
    expect(hasAnyAccess({ calendar: "none", todo: "none", ledger: "none" })).toBe(false);
    expect(hasAnyAccess({ calendar: "none", todo: "read", ledger: "none" })).toBe(true);
  });
});
