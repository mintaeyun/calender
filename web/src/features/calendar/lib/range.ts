// 보기(월/주/일)별 날짜 범위 계산. 모든 날짜는 사용자 시간대 기준 'YYYY-MM-DD' 문자열.
import { addDays, endOfDayUtc, startOfDayUtc, weekdayOf } from "@/lib/time";

export type ViewKind = "month" | "week" | "day";
export type WeekStart = "monday" | "sunday";

/** dateKey 가 속한 주의 첫날 */
export function weekStartOf(dateKey: string, weekStart: WeekStart): string {
  const wd = weekdayOf(dateKey); // 0=일
  const back = weekStart === "monday" ? (wd + 6) % 7 : wd;
  return addDays(dateKey, -back);
}

export const monthFirst = (dateKey: string) => `${dateKey.slice(0, 7)}-01`;

/** 월간 달력 칸들 (주 단위로 꽉 채운 35 또는 42일) */
export function monthGrid(anchor: string, weekStart: WeekStart): string[] {
  const first = monthFirst(anchor);
  const start = weekStartOf(first, weekStart);
  const [y, m] = first.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastKey = `${first.slice(0, 8)}${String(daysInMonth).padStart(2, "0")}`;
  const weeks = Math.ceil(((Date.parse(lastKey) - Date.parse(start)) / 86_400_000 + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export function viewDays(view: ViewKind, anchor: string, weekStart: WeekStart): string[] {
  if (view === "month") return monthGrid(anchor, weekStart);
  if (view === "week") {
    const s = weekStartOf(anchor, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  return [anchor];
}

/** 보이는 날짜들의 UTC 범위 [start, end) */
export function rangeOfDays(days: string[], tz: string) {
  return { start: startOfDayUtc(days[0], tz), end: endOfDayUtc(days[days.length - 1], tz) };
}

export function addMonths(dateKey: string, n: number): string {
  const [y, m] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function shiftAnchor(view: ViewKind, anchor: string, dir: -1 | 1): string {
  if (view === "month") return addMonths(anchor, dir);
  return addDays(anchor, dir * (view === "week" ? 7 : 1));
}

/** "2026년 10월" / "10월 12일 – 18일" / "10월 14일" */
export function viewTitle(view: ViewKind, anchor: string, days: string[]): string {
  if (view === "month") return `${anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  const f = (k: string) => `${+k.slice(5, 7)}월 ${+k.slice(8, 10)}일`;
  if (view === "day") return f(anchor);
  const a = days[0];
  const b = days[6];
  return a.slice(0, 7) === b.slice(0, 7) ? `${f(a)} – ${+b.slice(8, 10)}일` : `${f(a)} – ${f(b)}`;
}
