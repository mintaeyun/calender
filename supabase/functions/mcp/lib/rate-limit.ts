// 토큰당 분당 호출 제한 (MCP-8). 분 단위 버킷 카운트 판단만 담당하고, 카운터 저장은 DB(mcp_rate)가 한다.

export const RATE_LIMIT_PER_MIN = 60;

export function minuteBucket(now: Date): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}

export type RateDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number; message: string };

// count: 이번 호출을 포함한 현재 버킷의 호출 수
export function decideRate(count: number, now: Date, limit = RATE_LIMIT_PER_MIN): RateDecision {
  if (count <= limit) return { allowed: true, remaining: limit - count };
  const retryAfterSec = Math.max(1, 60 - Math.floor((now.getTime() % 60_000) / 1000));
  return {
    allowed: false,
    retryAfterSec,
    message: `호출 한도(분당 ${limit}회)를 초과했습니다. ${retryAfterSec}초 후에 다시 시도해 주세요.`,
  };
}
