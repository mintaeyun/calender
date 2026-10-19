// MCP 설정 화면의 순수 로직. 서버는 supabase/functions/mcp (토큰 발급·폐기: POST·DELETE /tokens).
export type Level = "none" | "read" | "write";
export type Scopes = { calendar: Level; todo: Level; ledger: Level };
export const SERVICES = [["calendar", "일정"], ["todo", "할일"], ["ledger", "가계부"]] as const;
export const LEVELS = [["none", "없음"], ["read", "읽기"], ["write", "읽기·쓰기"]] as const;
export const RATE_LIMIT_PER_MIN = 60;

/** 커넥터에 등록할 서버 주소. Supabase URL 이 없으면 null. */
export function serverUrl(supabaseUrl: string | undefined): string | null {
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/mcp` : null;
}

/** 서버가 저장한 scopes(jsonb)를 안전하게 정규화한다. 알 수 없는 값은 'none'. */
export function normalizeScopes(raw: unknown): Scopes {
  const o = (typeof raw === "object" && raw ? raw : {}) as Record<string, unknown>;
  const pick = (k: string): Level => (o[k] === "read" || o[k] === "write" ? o[k] : "none");
  return { calendar: pick("calendar"), todo: pick("todo"), ledger: pick("ledger") };
}

export const levelLabel = (l: Level) => LEVELS.find(([k]) => k === l)![1];

/** 토큰 표시용: 'lm_ab12••••' (원문은 발급 때만 알 수 있다) */
export const tokenHint = (prefix: string | null) => (prefix ? `${prefix}••••` : "lm_••••");

/** 마지막 사용 시각 문구 */
export function lastUsedLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "사용 기록 없음";
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}

/** 모든 서비스가 'none' 이면 쓸모없는 토큰이므로 발급을 막는다. */
export const hasAnyAccess = (s: Scopes) => Object.values(s).some((v) => v !== "none");

export type LogStatus = "ok" | "error" | "denied" | "rate_limited";
export const LOG_STATUS: Record<string, { label: string; tone: "ok" | "bad" }> = {
  ok: { label: "성공", tone: "ok" },
  error: { label: "오류", tone: "bad" },
  denied: { label: "권한 없음", tone: "bad" },
  rate_limited: { label: "호출 제한", tone: "bad" },
};
