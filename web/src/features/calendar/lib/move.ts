// 드래그 이동·크기 조절 계산 (순수 함수). 하루 단위 이동은 달력 날짜 기준으로 계산해 시각(벽시계)을 유지한다.
import { zonedParts, zonedToUtc } from "@/lib/time";

const shiftDays = (iso: string | Date, days: number, tz: string): Date => {
  const p = zonedParts(iso, tz);
  return zonedToUtc(p.year, p.month, p.day + days, p.hour, p.minute, tz);
};

export const SNAP_MINUTES = 15;

/** 분 단위를 SNAP 으로 반올림 */
export const snap = (minutes: number, step = SNAP_MINUTES) => Math.round(minutes / step) * step;

/** 시작·종료를 dayDelta 일, minuteDelta 분만큼 이동 */
export function moveRange(start: Date, end: Date, dayDelta: number, minuteDelta: number, tz: string) {
  const s = new Date(shiftDays(start, dayDelta, tz).getTime() + minuteDelta * 60_000);
  const e = new Date(shiftDays(end, dayDelta, tz).getTime() + minuteDelta * 60_000);
  return { start_at: s.toISOString(), end_at: e.toISOString() };
}

/** 종료 시각만 minuteDelta 분 조절. 최소 길이(기본 15분)를 지킨다. */
export function resizeRange(start: Date, end: Date, minuteDelta: number, minLength = SNAP_MINUTES) {
  const e = Math.max(end.getTime() + minuteDelta * 60_000, start.getTime() + minLength * 60_000);
  return { start_at: start.toISOString(), end_at: new Date(e).toISOString() };
}
