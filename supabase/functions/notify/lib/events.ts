// 일정 시작 알림 계획(NOTI-1, CAL-7). 반복 일정은 인스턴스별로 전개한다.
//
// 02 calendar 의 규칙을 따른다(web/src/features/calendar/lib/recurrence.ts · allday.ts):
//  - 시간 일정: fireAt = 발생 시각 − minutes_before
//  - 종일 일정: 기준 = 첫날 09:00(사용자 시간대), fireAt = 기준 − minutes_before
//  - 반복 규칙은 사용자 시간대의 벽시계 기준으로 해석(floating 변환 후 되돌림), exdates·예외 인스턴스 제외
// Edge Function 은 web/ 코드를 import 할 수 없어 같은 규칙을 여기에 구현하고,
// events.parity.test.ts 가 web 구현(expandEvents)과 결과가 같은지 검증한다.
import { RRule } from "rrule";
import { DEFAULT_TIMEZONE, zonedParts, zonedToUtc } from "../../_shared/time.ts";
import { inWindow, type Planned, type Window } from "./types.ts";

export type EventLike = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  rrule: string | null;
  exdates: string[] | null;
  recurring_event_id: string | null;
  original_start_at: string | null;
  deleted_at: string | null;
};

export const ALLDAY_REMINDER_HOUR = 9;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const toFloating = (d: Date, tz: string) => {
  const p = zonedParts(d, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
};
const fromFloating = (f: Date, tz: string) =>
  zonedToUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), tz);

function makeRule(rule: string, start: Date, tz: string): RRule | null {
  const text = rule.split(/\r?\n/).map((l) => l.trim()).find((l) => /^(RRULE:)?FREQ=/i.test(l))?.replace(/^RRULE:/i, "");
  if (!text) return null;
  try {
    const opts = RRule.parseString(text);
    opts.dtstart = toFloating(start, tz);
    const until = /UNTIL=([0-9TZ]+)/i.exec(text)?.[1];
    if (until) {
      opts.until = /^\d{8}$/.test(until)
        ? new Date(Date.UTC(+until.slice(0, 4), +until.slice(4, 6) - 1, +until.slice(6, 8), 23, 59, 59))
        : toFloating(opts.until as Date, tz);
    }
    return new RRule(opts);
  } catch {
    return null;
  }
}

/** 규칙에 따른 발생 시각(UTC) 목록. [from, to] 포함. */
export function occurrencesBetween(rule: string, start: Date, from: Date, to: Date, tz: string): Date[] {
  const r = makeRule(rule, start, tz);
  return r ? r.between(toFloating(from, tz), toFloating(to, tz), true).map((f) => fromFloating(f, tz)) : [];
}

/** 알림 기준 시각: 시간 일정은 발생 시각, 종일은 그날 09:00(사용자 시간대) */
export function anchorOf(occurrence: Date, allDay: boolean, tz: string): Date {
  if (!allDay) return occurrence;
  const p = zonedParts(occurrence, tz);
  return zonedToUtc(p.year, p.month, p.day, ALLDAY_REMINDER_HOUR, 0, tz);
}

/** 알림이 울릴 시각이 window 안에 드는 (일정 발생 × minutes_before) 조합 */
export function planEventNotifications(
  events: EventLike[],
  reminders: Map<string, number[]>,
  window: Window,
  tz: string = DEFAULT_TIMEZONE,
): Planned[] {
  const live = events.filter((e) => !e.deleted_at);
  const skipByMaster = new Map<string, Set<number>>();
  for (const e of live) {
    if (e.recurring_event_id && e.original_start_at) {
      const set = skipByMaster.get(e.recurring_event_id) ?? new Set<number>();
      set.add(new Date(e.original_start_at).getTime());
      skipByMaster.set(e.recurring_event_id, set);
    }
  }

  const out: Planned[] = [];
  for (const e of live) {
    const mins = reminders.get(e.id) ?? [];
    if (mins.length === 0) continue; // 알림을 지정하지 않은 일정은 알리지 않는다

    let occurrences: Date[];
    if (e.rrule && !e.recurring_event_id) {
      const skip = new Set<number>((e.exdates ?? []).map((x) => new Date(x).getTime()));
      for (const x of skipByMaster.get(e.id) ?? []) skip.add(x);
      // 알림 시각이 window 에 들려면 발생 시각은 [from, to + 가장 이른 알림 + 종일 보정(1일)] 사이
      const horizon = new Date(window.to.getTime() + Math.max(...mins) * MIN + DAY);
      occurrences = occurrencesBetween(e.rrule, new Date(e.start_at), new Date(window.from.getTime() - DAY), horizon, tz).filter((o) => !skip.has(o.getTime()));
    } else {
      occurrences = [new Date(e.start_at)];
    }

    for (const occ of occurrences) {
      const anchor = anchorOf(occ, e.all_day, tz);
      for (const m of mins) {
        const fireAt = new Date(anchor.getTime() - m * MIN);
        if (!inWindow(fireAt, window)) continue;
        out.push({
          type: "event_start",
          title: e.title,
          body: describe(anchor, m, e.all_day, tz),
          link: "/calendar",
          dedupe_key: `event_start:${e.id}:${occ.toISOString()}:${m}`,
          scheduled_at: fireAt,
        });
      }
    }
  }
  return out;
}

function describe(anchor: Date, minutesBefore: number, allDay: boolean, tz: string): string {
  const p = zonedParts(anchor, tz);
  const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  if (allDay) return minutesBefore === 0 ? "오늘 종일 일정이에요" : minutesBefore < 1440 ? "내일 종일 일정이에요" : `${Math.round(minutesBefore / 1440)}일 뒤 종일 일정이에요`;
  if (minutesBefore === 0) return `지금 시작해요 · ${hhmm}`;
  if (minutesBefore < 60) return `${minutesBefore}분 후 시작 · ${hhmm}`;
  if (minutesBefore < 1440) return `${Math.round(minutesBefore / 60)}시간 후 시작 · ${hhmm}`;
  return `${Math.round(minutesBefore / 1440)}일 후 시작 · ${hhmm}`;
}
