// 시간 유틸. DB에는 UTC(timestamptz)로 저장하고 사용자 시간대(profiles.timezone, 기본 Asia/Seoul)로 표시한다.
// 마감일·거래일은 시간대가 없는 'YYYY-MM-DD' 문자열(date)로 다룬다. 외부 라이브러리 없이 Intl만 쓴다.

export const DEFAULT_TIMEZONE = "Asia/Seoul";
export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 시각(UTC)을 해당 시간대의 달력 요소로 분해한다. weekday: 0=일 … 6=토 */
export function zonedParts(input: Date | string | number, tz: string = DEFAULT_TIMEZONE): Parts {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(new Date(input))) p[x.type] = x.value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WD[p.weekday],
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 해당 시간대 기준의 날짜 'YYYY-MM-DD' (일정을 날짜 셀에 배치하거나 date 컬럼과 비교할 때) */
export function dateKey(input: Date | string | number, tz: string = DEFAULT_TIMEZONE): string {
  const p = zonedParts(input, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 오늘 날짜 'YYYY-MM-DD' (사용자 시간대) */
export const todayKey = (tz: string = DEFAULT_TIMEZONE) => dateKey(new Date(), tz);

/** 해당 시간대에서 (y, m, d, hh, mm)에 해당하는 UTC 시각. 월/일은 넘쳐도 정규화된다. */
export function zonedToUtc(
  y: number, m: number, d: number, hh = 0, mm = 0, tz: string = DEFAULT_TIMEZONE,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // 시간대 오프셋을 두 번 보정해 DST 경계에서도 수렴시킨다.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(ts, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    ts += guess - asUtc;
  }
  return new Date(ts);
}

/** 'YYYY-MM-DD'의 시작 시각(UTC). 날짜 범위 쿼리의 하한에 쓴다. */
export function startOfDayUtc(dateStr: string, tz: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, 0, tz);
}

/** 'YYYY-MM-DD'의 다음 날 시작 시각(UTC). 범위의 배타적 상한에 쓴다. */
export function endOfDayUtc(dateStr: string, tz: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return zonedToUtc(y, m, d + 1, 0, 0, tz);
}

/** 'YYYY-MM-DD'에 일수를 더한 'YYYY-MM-DD' (시간대 무관한 달력 연산) */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 'YYYY-MM-DD'의 요일(0=일 … 6=토) */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "10월 14일 (수)" */
export function formatDateKo(input: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  const p = typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? { month: +input.slice(5, 7), day: +input.slice(8, 10), weekday: weekdayOf(input) }
    : zonedParts(input, tz);
  return `${p.month}월 ${p.day}일 (${WEEKDAYS_KO[p.weekday]})`;
}

/** "2026년 10월 14일 (수)" */
export function formatFullDateKo(input: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  const key = typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : dateKey(input, tz);
  return `${key.slice(0, 4)}년 ${formatDateKo(key, tz)}`;
}

/** "14:30" (24시간제) */
export function formatTime(input: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  const p = zonedParts(input, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "10월 14일 (수) 14:30" */
export function formatDateTimeKo(input: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  return `${formatDateKo(input, tz)} ${formatTime(input, tz)}`;
}
