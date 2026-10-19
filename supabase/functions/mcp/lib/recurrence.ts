// 반복 일정 전개. web/src/features/calendar/lib/recurrence.ts 의 expandEvents 와 같은 규칙을 Edge(Deno)용으로 옮긴 것.
// (웹 코드는 Edge 에서 import 할 수 없다. 규칙을 바꾸면 양쪽을 함께 고치고 recurrence.test.ts 로 동등성을 확인한다.)
//
// 저장 형식: events.rrule = "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=…" (DTSTART 는 start_at). 시간대는 사용자 시간대 달력 기준.
// 예외: events.exdates 와 예외 인스턴스 행(recurring_event_id + original_start_at)을 반영한다.
import * as rruleModule from "rrule";
import type { RRule as RRuleType } from "rrule";
// rrule 은 CJS(UMD) 패키지라 Node 에서는 named export 를 못 찾는다. default 경유로 모두 대응.
// deno-lint-ignore no-explicit-any
const RRule: typeof RRuleType = (rruleModule as any).RRule ?? (rruleModule as any).default.RRule;
import { DEFAULT_TIMEZONE, zonedParts, zonedToUtc } from "../../_shared/time.ts";

export type EventRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  calendar_id: string | null;
  rrule: string | null;
  recurring_event_id: string | null;
  original_start_at: string | null;
  exdates: string[] | null;
  deleted_at: string | null;
};

export type EventInstance = {
  key: string;
  event: EventRow;
  start: Date;
  end: Date;
  recurring: boolean;
  masterId: string | null;
  isException: boolean;
  originalStart: Date | null;
};
export type DateRange = { start: Date; end: Date };

const clean = (rule: string) =>
  rule.split(/\r?\n/).map((l) => l.trim()).find((l) => /^(RRULE:)?FREQ=/i.test(l))?.replace(/^RRULE:/i, "") ?? "";

function parts(rule: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const seg of clean(rule).split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) m.set(seg.slice(0, i).toUpperCase(), seg.slice(i + 1));
  }
  return m;
}

const toFloating = (d: Date | number | string, tz: string) => {
  const p = zonedParts(d, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
};
const fromFloating = (f: Date, tz: string) =>
  zonedToUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), tz);

function makeRule(rule: string, start: Date | string, tz: string): RRuleType | null {
  const text = clean(rule);
  if (!text) return null;
  const opts = RRule.parseString(text);
  opts.dtstart = toFloating(start, tz);
  const until = parts(rule).get("UNTIL");
  if (until) {
    // 날짜만 있는 UNTIL(구글 종일)은 그날 끝까지 포함
    opts.until = /^\d{8}$/.test(until)
      ? new Date(Date.UTC(+until.slice(0, 4), +until.slice(4, 6) - 1, +until.slice(6, 8), 23, 59, 59))
      : toFloating(opts.until as Date, tz);
  }
  try {
    return new RRule(opts);
  } catch {
    return null;
  }
}

export function occurrencesBetween(rule: string, start: Date | string, from: Date, to: Date, tz: string = DEFAULT_TIMEZONE): Date[] {
  const r = makeRule(rule, start, tz);
  if (!r) return [];
  return r.between(toFloating(from, tz), toFloating(to, tz), true).map((f) => fromFloating(f, tz));
}

const overlaps = (s: number, e: number, r: DateRange) =>
  e > s ? s < r.end.getTime() && e > r.start.getTime() : s >= r.start.getTime() && s < r.end.getTime();

export function expandEvents(events: EventRow[], range: DateRange, tz: string = DEFAULT_TIMEZONE): EventInstance[] {
  const live = events.filter((e) => !e.deleted_at);
  const exceptionsByMaster = new Map<string, Set<number>>();
  for (const e of live) {
    if (e.recurring_event_id && e.original_start_at) {
      const set = exceptionsByMaster.get(e.recurring_event_id) ?? new Set<number>();
      set.add(new Date(e.original_start_at).getTime());
      exceptionsByMaster.set(e.recurring_event_id, set);
    }
  }

  const out: EventInstance[] = [];
  for (const e of live) {
    const s = new Date(e.start_at);
    const en = new Date(e.end_at);

    if (e.recurring_event_id) {
      if (overlaps(s.getTime(), en.getTime(), range)) {
        out.push({
          key: `${e.id}@${e.start_at}`, event: e, start: s, end: en, recurring: true,
          masterId: e.recurring_event_id, isException: true,
          originalStart: e.original_start_at ? new Date(e.original_start_at) : null,
        });
      }
      continue;
    }

    if (!e.rrule) {
      if (overlaps(s.getTime(), en.getTime(), range)) {
        out.push({ key: `${e.id}@${e.start_at}`, event: e, start: s, end: en, recurring: false, masterId: null, isException: false, originalStart: null });
      }
      continue;
    }

    const duration = en.getTime() - s.getTime();
    const skip = new Set<number>((e.exdates ?? []).map((x) => new Date(x).getTime()));
    for (const x of exceptionsByMaster.get(e.id) ?? []) skip.add(x);
    const from = new Date(range.start.getTime() - duration);
    for (const o of occurrencesBetween(e.rrule, s, from, range.end, tz)) {
      if (skip.has(o.getTime())) continue;
      const oe = new Date(o.getTime() + duration);
      if (!overlaps(o.getTime(), oe.getTime(), range)) continue;
      out.push({
        key: `${e.id}@${o.toISOString()}`, event: e, start: o, end: oe, recurring: true,
        masterId: e.id, isException: false, originalStart: o,
      });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
}
