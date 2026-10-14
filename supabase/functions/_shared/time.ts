// 시간 유틸 (web/src/lib/time.ts 와 같은 규칙). DB 는 UTC, 사용자 시간대(기본 Asia/Seoul)로 해석·표시한다.
export const DEFAULT_TIMEZONE = "Asia/Seoul";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const cache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string) {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    cache.set(tz, f);
  }
  return f;
}

export function zonedParts(input: Date | string | number, tz = DEFAULT_TIMEZONE): Parts {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(new Date(input))) p[x.type] = x.value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WD[p.weekday] };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 시간대 기준 날짜 'YYYY-MM-DD' */
export function dateKey(input: Date | string | number, tz = DEFAULT_TIMEZONE): string {
  const p = zonedParts(input, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export const todayKey = (tz = DEFAULT_TIMEZONE) => dateKey(new Date(), tz);

export function zonedToUtc(y: number, m: number, d: number, hh = 0, mm = 0, tz = DEFAULT_TIMEZONE): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(ts, tz);
    ts += guess - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(ts);
}

export function startOfDayUtc(dateStr: string, tz = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, 0, tz);
}

export function endOfDayUtc(dateStr: string, tz = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return zonedToUtc(y, m, d + 1, 0, 0, tz);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
