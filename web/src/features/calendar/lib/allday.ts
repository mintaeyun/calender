// 종일 일정 · 알림 저장 규칙 (02 calendar). 다른 세션(05 notify, 06 MCP, 07 google)이 같은 규칙을 쓴다.
//
// [종일 일정]
//  - start_at = 첫날 00:00 (사용자 시간대) 의 UTC 시각
//  - end_at   = 마지막 날의 **다음 날** 00:00 (사용자 시간대) 의 UTC 시각  ← 구글의 종일 종료(exclusive)와 동일
//  - 화면에는 마지막 날(포함)을 표시한다. 예) 10/17~10/18 종일 → end_at = 10/19 00:00
//  - 같은 날 하루짜리 종일은 end_at = start_at + 1일
//
// [알림 (event_reminders.minutes_before)]
//  - 시간 일정: 기준 시각 = start_at.  fireAt = start_at − minutes_before 분
//  - 종일 일정: 기준 시각 = 첫날 09:00 (사용자 시간대).  fireAt = 그 시각 − minutes_before 분
//      당일 09:00 → 0,  전날 20:00 → 780(13시간),  1주 전 09:00 → 10080
//  - minutes_before 는 항상 0 이상 정수 (DB check).

import { endOfDayUtc, startOfDayUtc, zonedToUtc, zonedParts, dateKey } from "@/lib/time";

export const ALLDAY_REMINDER_HOUR = 9;

/** 'YYYY-MM-DD' 시작일 ~ 마지막 날(포함) → DB에 저장할 start_at / end_at (ISO UTC) */
export function allDayToRange(startDate: string, lastDateInclusive: string, tz: string) {
  const last = lastDateInclusive < startDate ? startDate : lastDateInclusive;
  return {
    start_at: startOfDayUtc(startDate, tz).toISOString(),
    end_at: endOfDayUtc(last, tz).toISOString(),
  };
}

/** 종일 일정의 표시용 날짜 범위. end_at 은 exclusive 이므로 1초 빼서 마지막 날(포함)을 구한다. */
export function allDayDates(startAt: string, endAt: string, tz: string) {
  const startDate = dateKey(startAt, tz);
  const lastDate = dateKey(new Date(new Date(endAt).getTime() - 1000), tz);
  return { startDate, lastDate: lastDate < startDate ? startDate : lastDate };
}

/** 알림 기준 시각 (시간 일정: start_at, 종일: 첫날 09:00) */
export function reminderAnchor(ev: { start_at: string; all_day: boolean }, tz: string): Date {
  if (!ev.all_day) return new Date(ev.start_at);
  const p = zonedParts(ev.start_at, tz);
  return zonedToUtc(p.year, p.month, p.day, ALLDAY_REMINDER_HOUR, 0, tz);
}

/** 알림이 울려야 하는 시각 */
export function reminderFireAt(ev: { start_at: string; all_day: boolean }, minutesBefore: number, tz: string): Date {
  return new Date(reminderAnchor(ev, tz).getTime() - minutesBefore * 60_000);
}

export type ReminderOption = { minutes: number; label: string };

export const TIMED_REMINDERS: ReminderOption[] = [
  { minutes: 0, label: "정시" },
  { minutes: 10, label: "10분 전" },
  { minutes: 60, label: "1시간 전" },
  { minutes: 1440, label: "1일 전" },
];

export const ALLDAY_REMINDERS: ReminderOption[] = [
  { minutes: 0, label: "당일 09:00" },
  { minutes: 780, label: "1일 전 20:00" },
  { minutes: 10080, label: "1주 전" },
];

export const reminderOptions = (allDay: boolean) => (allDay ? ALLDAY_REMINDERS : TIMED_REMINDERS);

/** 종일 ↔ 시간 일정 전환 시 알림 값을 새 기준으로 바꾼다. 대응이 없으면 기본값 하나로 대체. */
export function convertReminders(minutes: number[], toAllDay: boolean): number[] {
  const valid = new Set(reminderOptions(toAllDay).map((o) => o.minutes));
  const kept = minutes.filter((m) => valid.has(m));
  return kept;
}

