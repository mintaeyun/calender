// 도구 입력 날짜·시간 해석과 출력 포맷. 시간대 없는 값은 사용자 시간대로 해석한다. 종일 규칙은 web 의 allday.ts 와 동일:
// start_at = 첫날 00:00(사용자 시간대), end_at = 마지막 날 다음 날 00:00(exclusive, 구글과 동일).
import { dateKey, endOfDayUtc, startOfDayUtc, zonedParts, zonedToUtc } from "../../_shared/time.ts";
import { ToolError } from "./resolve.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(Z|[+-]\d{2}:\d{2})$/i;

export const isDateOnly = (s: string) => DATE_ONLY.test(s);

/** 입력 → UTC Date. 날짜만 오면 edge 에 따라 그날 시작(start) 또는 그날 끝=다음 날 00:00(end). */
export function parseInput(value: string, tz: string, edge: "start" | "end" = "start"): Date {
  let d: Date;
  if (isDateOnly(value)) d = edge === "end" ? endOfDayUtc(value, tz) : startOfDayUtc(value, tz);
  else if (HAS_ZONE.test(value)) d = new Date(value);
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (!m) throw new ToolError(`날짜·시간을 해석할 수 없습니다: ${value}`, "예: 2026-10-15T15:00:00+09:00");
    d = zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
  }
  if (Number.isNaN(d.getTime())) throw new ToolError(`날짜·시간을 해석할 수 없습니다: ${value}`);
  return d;
}

/** UTC → 'YYYY-MM-DDTHH:mm:ss+09:00' (사용자 시간대 벽시계 + 오프셋) */
export function formatLocal(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 시점의 UTC 오프셋(분) */
export function offsetMinutes(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** 종일 일정 표시용: 시작일과 마지막 날(포함) */
export function allDayDates(start: Date, end: Date, tz: string) {
  const startDate = dateKey(start, tz);
  const lastDate = dateKey(new Date(end.getTime() - 1000), tz);
  return { start: startDate, end: lastDate < startDate ? startDate : lastDate };
}
