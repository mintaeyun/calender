// 이번 주 일정 밀도 히트맵 (DASH, 목업의 '이번 주 일정 밀도'). 순수 로직.
// 행 = 시간대 구간, 열 = 요일(주 시작 요일 설정 반영), 값 = 0~4 단계(겹친 분 수 기준).
import { addDays, endOfDayUtc, startOfDayUtc, weekdayOf, zonedToUtc } from "@/lib/time";

/** 작업 시간대만 본다 (09~24). 구간은 [시작, 끝) 시. */
export const DENSITY_BINS: readonly (readonly [number, number])[] = [[9, 12], [12, 15], [15, 17], [17, 19], [19, 21], [21, 24]];
export const binLabel = (bin: readonly [number, number]) => `${String(bin[0]).padStart(2, "0")}시`;

export type TimedEvent = { start: Date; end: Date; allDay: boolean };

/** 겹친 분 → 단계: 0 없음, 1 <30분, 2 <60분, 3 <120분, 4 그 이상 */
export function level(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

/** 주의 첫날(오늘이 속한 주) 'YYYY-MM-DD'. weekStart: 'monday' | 'sunday' */
export function weekStartOf(today: string, weekStart: "monday" | "sunday"): string {
  const dow = weekdayOf(today); // 0=일
  const back = weekStart === "monday" ? (dow + 6) % 7 : dow;
  return addDays(today, -back);
}

/**
 * 한 주(7일)의 밀도 행렬. matrix[binIndex][dayIndex]. 종일 일정은 시간을 점유하지 않는 것으로 본다.
 * 여러 일정이 겹치면 각각의 분을 더한다(동시 일정이 많을수록 진하게).
 */
export function weekDensity(events: TimedEvent[], firstDay: string, tz: string): { days: string[]; matrix: (0 | 1 | 2 | 3 | 4)[][] } {
  const days = Array.from({ length: 7 }, (_, i) => addDays(firstDay, i));
  const minutes = DENSITY_BINS.map(() => days.map(() => 0));
  for (const e of events) {
    if (e.allDay) continue;
    days.forEach((d, di) => {
      // 하루 범위와 겹치는 일정만 구간별로 계산
      if (e.end <= startOfDayUtc(d, tz) || e.start >= endOfDayUtc(d, tz)) return;
      const [y, m, dd] = d.split("-").map(Number);
      DENSITY_BINS.forEach(([h0, h1], bi) => {
        const a = zonedToUtc(y, m, dd, h0, 0, tz).getTime();
        const b = h1 >= 24 ? endOfDayUtc(d, tz).getTime() : zonedToUtc(y, m, dd, h1, 0, tz).getTime();
        const overlap = Math.min(b, e.end.getTime()) - Math.max(a, e.start.getTime());
        if (overlap > 0) minutes[bi][di] += overlap / 60_000;
      });
    });
  }
  return { days, matrix: minutes.map((row) => row.map(level)) };
}

/** 가장 일정이 몰린 요일(총 분 기준). 일정이 없으면 null. 규칙 기반 요약 문구에 쓴다. */
export function busiestDay(events: TimedEvent[], firstDay: string, tz: string): { date: string; hours: number } | null {
  const days = Array.from({ length: 7 }, (_, i) => addDays(firstDay, i));
  let best: { date: string; ms: number } | null = null;
  for (const d of days) {
    const a = startOfDayUtc(d, tz).getTime(), b = endOfDayUtc(d, tz).getTime();
    const ms = events.filter((e) => !e.allDay).reduce((s, e) => s + Math.max(0, Math.min(b, e.end.getTime()) - Math.max(a, e.start.getTime())), 0);
    if (ms > 0 && (!best || ms > best.ms)) best = { date: d, ms };
  }
  return best && { date: best.date, hours: Math.round((best.ms / 3_600_000) * 10) / 10 };
}
