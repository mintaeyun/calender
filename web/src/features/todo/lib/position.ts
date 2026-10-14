// 칸반 열 내 순서(position, double precision). 드롭 시 이웃 사이 값을 계산해 한 행만 갱신한다.

const STEP = 1024;

/** prev/next는 드롭 위치 바로 위·아래 카드의 position(없으면 null). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return STEP;
  if (prev === null) return next! - STEP;
  if (next === null) return prev + STEP;
  return (prev + next) / 2;
}

/** 이웃 간격이 부동소수점 한계에 가까우면 재정렬이 필요하다. */
export const needsRebalance = (prev: number, next: number) => Math.abs(next - prev) < 1e-6;

/** 새 할일은 열의 맨 끝에 붙인다. */
export const positionForAppend = (positions: number[]): number =>
  positions.length ? Math.max(...positions) + STEP : STEP;
