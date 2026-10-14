// 반복 일정 (RFC 5545 RRULE). React 비의존 순수 로직 — 05(알림 스캔)·06(MCP)·07(구글)이 재사용한다.
//
// 저장 형식: events.rrule = "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T145959Z" ("RRULE:" 접두사는 있어도 되고 없어도 된다).
//            DTSTART 는 저장하지 않고 events.start_at 을 쓴다.
// 시간대: BYDAY 같은 규칙은 "사용자 시간대의 달력"으로 해석해야 하므로, 전개할 때 시각을
//         사용자 시간대 벽시계 시각을 UTC인 척 바꾼 값(floating)으로 계산한 뒤 다시 실제 UTC로 되돌린다.
// 예외: events.exdates(제외할 발생 시각) 와 예외 인스턴스 행(recurring_event_id + original_start_at)을 반영한다.

import { RRule } from "rrule";
import type { Tables } from "@/lib/supabase/database.types";
import { DEFAULT_TIMEZONE, endOfDayUtc, zonedParts, zonedToUtc, dateKey, WEEKDAYS_KO } from "../../../lib/time";

export type EventRow = Tables<"events">;

export type Freq = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceEnd = { type: "never" } | { type: "until"; date: string } | { type: "count"; count: number };
/** byDays: 0=일 … 6=토 (lib/time 의 weekday 와 동일) */
export type RecurrenceSpec = { freq: Freq; interval: number; byDays: number[]; end: RecurrenceEnd };

const FREQ_NAME: Record<Freq, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const pad = (n: number) => String(n).padStart(2, "0");
const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const clean = (rule: string) =>
  rule
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^(RRULE:)?FREQ=/i.test(l))
    ?.replace(/^RRULE:/i, "") ?? "";

function parts(rule: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const seg of clean(rule).split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) m.set(seg.slice(0, i).toUpperCase(), seg.slice(i + 1));
  }
  return m;
}
const stringify = (m: Map<string, string>) => [...m].map(([k, v]) => `${k}=${v}`).join(";");

/** 화면 입력(RecurrenceSpec) → RRULE 문자열. 반복 없음이면 null. */
export function buildRRule(spec: RecurrenceSpec | null, tz: string = DEFAULT_TIMEZONE): string | null {
  if (!spec) return null;
  const m = new Map<string, string>([["FREQ", FREQ_NAME[spec.freq]]]);
  if (spec.interval > 1) m.set("INTERVAL", String(spec.interval));
  if (spec.freq === "weekly" && spec.byDays.length) {
    m.set("BYDAY", [...new Set(spec.byDays)].sort((a, b) => a - b).map((d) => DAY_CODES[d]).join(","));
  }
  if (spec.end.type === "count") m.set("COUNT", String(Math.max(1, Math.floor(spec.end.count))));
  if (spec.end.type === "until") m.set("UNTIL", fmtUtc(new Date(endOfDayUtc(spec.end.date, tz).getTime() - 1000)));
  return stringify(m);
}

/** RRULE 문자열 → 화면용 RecurrenceSpec. 앱이 편집할 수 없는 복잡한 규칙이면 supported=false. */
export function parseRRule(
  rule: string | null | undefined,
  tz: string = DEFAULT_TIMEZONE,
): { spec: RecurrenceSpec; supported: boolean } | null {
  if (!rule) return null;
  const m = parts(rule);
  const f = m.get("FREQ");
  const freq = (Object.keys(FREQ_NAME) as Freq[]).find((k) => FREQ_NAME[k] === f);
  if (!freq) return null;

  const SUPPORTED = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL", "WKST"]);
  let supported = [...m.keys()].every((k) => SUPPORTED.has(k));
  const byDays = (m.get("BYDAY") ?? "")
    .split(",")
    .map((s) => DAY_CODES.indexOf(s.trim().toUpperCase()))
    .filter((i) => i >= 0);
  if (m.get("BYDAY") && freq !== "weekly") supported = false; // 매월 둘째 화요일 등은 편집 불가
  if (m.get("BYDAY") && byDays.length !== m.get("BYDAY")!.split(",").length) supported = false;

  let end: RecurrenceEnd = { type: "never" };
  if (m.has("COUNT")) end = { type: "count", count: Number(m.get("COUNT")) };
  else if (m.has("UNTIL")) {
    const u = m.get("UNTIL")!;
    if (/^\d{8}$/.test(u)) end = { type: "until", date: `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` };
    else {
      const d = new Date(`${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`);
      end = { type: "until", date: dateKey(d, tz) };
    }
  }
  return { spec: { freq, interval: Math.max(1, Number(m.get("INTERVAL") ?? 1)), byDays, end }, supported };
}

/** "매주 월·수 · 2026년 12월 31일까지" */
export function summarizeRRule(rule: string | null | undefined, start: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  const parsed = parseRRule(rule, tz);
  if (!parsed) return "반복 안 함";
  const { spec } = parsed;
  const p = zonedParts(start, tz);
  const every = spec.interval > 1;
  let base = "";
  if (spec.freq === "daily") base = every ? `${spec.interval}일마다` : "매일";
  if (spec.freq === "weekly") {
    const days = (spec.byDays.length ? spec.byDays : [p.weekday]).map((d) => WEEKDAYS_KO[d]).join("·");
    base = `${every ? `${spec.interval}주마다` : "매주"} ${days}`;
  }
  if (spec.freq === "monthly") base = `${every ? `${spec.interval}개월마다` : "매월"} ${p.day}일`;
  if (spec.freq === "yearly") base = `${every ? `${spec.interval}년마다` : "매년"} ${p.month}월 ${p.day}일`;
  const end =
    spec.end.type === "never" ? "" :
    spec.end.type === "count" ? ` · ${spec.end.count}회` :
    ` · ${spec.end.date.slice(0, 4)}년 ${+spec.end.date.slice(5, 7)}월 ${+spec.end.date.slice(8, 10)}일까지`;
  return base + end;
}

// ---------------------------------------------------------------------------
// floating 변환 (사용자 시간대 벽시계 시각을 UTC 로 표현)
// ---------------------------------------------------------------------------
const toFloating = (d: Date | number | string, tz: string) => {
  const p = zonedParts(d, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
};
const fromFloating = (f: Date, tz: string) =>
  zonedToUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), tz);

function makeRule(rule: string, start: Date | string, tz: string): RRule | null {
  const text = clean(rule);
  if (!text) return null;
  const opts = RRule.parseString(text);
  opts.dtstart = toFloating(start, tz);
  const m = parts(rule);
  const until = m.get("UNTIL");
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

/** 규칙에 따른 발생 시각(UTC) 목록. [from, to] 범위(양끝 포함). */
export function occurrencesBetween(rule: string, start: Date | string, from: Date, to: Date, tz: string = DEFAULT_TIMEZONE): Date[] {
  const r = makeRule(rule, start, tz);
  if (!r) return [];
  return r.between(toFloating(from, tz), toFloating(to, tz), true).map((f) => fromFloating(f, tz));
}

// ---------------------------------------------------------------------------
// 전개
// ---------------------------------------------------------------------------
export type EventInstance = {
  /** 화면 key: `${id}@${start ISO}` */
  key: string;
  event: EventRow;
  start: Date;
  end: Date;
  /** 반복 시리즈에 속하는가 (마스터의 발생분 또는 예외 인스턴스) */
  recurring: boolean;
  /** 이 발생이 속한 마스터 id (비반복이면 null) */
  masterId: string | null;
  /** 예외 인스턴스 행인가 */
  isException: boolean;
  /** 마스터 기준 원래 발생 시각 (비반복이면 null) */
  originalStart: Date | null;
};

export type DateRange = { start: Date; end: Date };

const overlaps = (s: number, e: number, r: DateRange) =>
  e > s ? s < r.end.getTime() && e > r.start.getTime() : s >= r.start.getTime() && s < r.end.getTime();

/**
 * events 행들을 [range.start, range.end) 에 보이는 발생(인스턴스)으로 전개한다.
 * 삭제된(deleted_at) 행은 무시한다. 입력에는 마스터·예외·일반 일정이 섞여 있어도 된다.
 */
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

// ---------------------------------------------------------------------------
// "이후 전체" 분할 지원
// ---------------------------------------------------------------------------

/** 규칙의 끝을 지정 시각(포함)으로 바꾼다. COUNT 는 UNTIL 로 대체. */
export function truncateRRule(rule: string, lastInclusive: Date): string {
  const m = parts(rule);
  m.delete("COUNT");
  m.set("UNTIL", fmtUtc(lastInclusive));
  return stringify(m);
}

/** 시작(start)부터 before(미포함) 사이의 발생 횟수 */
export function countBefore(rule: string, start: Date | string, before: Date, tz: string = DEFAULT_TIMEZONE): number {
  const s = new Date(start);
  if (before.getTime() <= s.getTime()) return 0;
  return occurrencesBetween(rule, s, s, new Date(before.getTime() - 1000), tz).length;
}

/** 분할 후 새 시리즈(tail)의 규칙: COUNT 가 있으면 남은 횟수로 바꾼다. */
export function tailRRule(rule: string, masterStart: Date | string, splitAt: Date, tz: string = DEFAULT_TIMEZONE): string {
  const m = parts(rule);
  if (m.has("COUNT")) {
    const remaining = Math.max(1, Number(m.get("COUNT")) - countBefore(rule, masterStart, splitAt, tz));
    m.set("COUNT", String(remaining));
  }
  return stringify(m);
}
