import { describe, expect, it } from "vitest";
import { classifyGoogleError, lastSyncedLabel, oauthReturnMessage, shouldAutoSync } from "./errors";

describe("classifyGoogleError", () => {
  it("오류 없음", () => {
    expect(classifyGoogleError(null)).toBeNull();
    expect(classifyGoogleError("")).toBeNull();
  });
  it("토큰 만료는 재연결 + 테스트 상태 안내", () => {
    const i = classifyGoogleError("invalid_grant: Google 연결이 만료되었거나 권한이 철회되었습니다.")!;
    expect(i.reconnect).toBe(true);
    expect(i.hint).toContain("테스트");
  });
  it("권한/설정/기타 분류", () => {
    expect(classifyGoogleError("forbidden: x")).toMatchObject({ kind: "permission", reconnect: true });
    expect(classifyGoogleError("invalid_client: x")).toMatchObject({ kind: "config", reconnect: false });
    expect(classifyGoogleError("whatever")).toMatchObject({ kind: "other", reconnect: false });
  });
});

describe("표시 유틸", () => {
  const now = new Date("2026-10-14T05:00:00Z");
  it("마지막 동기화 라벨", () => {
    expect(lastSyncedLabel(null, now, "Asia/Seoul")).toBe("아직 동기화 전");
    expect(lastSyncedLabel("2026-10-14T04:32:00Z", now, "Asia/Seoul")).toBe("오늘 13:32");
    expect(lastSyncedLabel("2026-10-13T04:32:00Z", now, "Asia/Seoul")).toBe("10월 13일 13:32");
  });
  it("OAuth 복귀 메시지", () => {
    expect(oauthReturnMessage("connected")?.ok).toBe(true);
    expect(oauthReturnMessage("denied")?.ok).toBe(false);
    expect(oauthReturnMessage(null)).toBeNull();
  });
  it("자동 동기화 조건", () => {
    expect(shouldAutoSync({ last_synced_at: null, last_error: null }, now)).toBe(true);
    expect(shouldAutoSync({ last_synced_at: "2026-10-14T04:58:00Z", last_error: null }, now)).toBe(false);
    expect(shouldAutoSync({ last_synced_at: "2026-10-14T04:00:00Z", last_error: null }, now)).toBe(true);
    expect(shouldAutoSync({ last_synced_at: "2026-10-14T04:00:00Z", last_error: "invalid_grant: x" }, now)).toBe(false);
  });
});
