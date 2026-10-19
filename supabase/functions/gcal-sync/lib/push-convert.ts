// 앱 일정(events 행) → 구글 이벤트 본문 변환 (순수 함수). 가져오기의 convert.ts 와 대칭이다.
//
//  - 종일: start.date = 첫날, end.date = 마지막 날 다음 날(exclusive). 앱의 end_at(마지막 날 다음 00:00)을 그대로 날짜로 바꾸면 된다.
//  - 시간: dateTime(UTC Z) + timeZone(사용자 시간대). 반복 일정은 timeZone 이 필수다.
//  - 반복: rrule → "RRULE:…"  (종일이면 UNTIL 을 날짜 형식으로), exdates → EXDATE 줄 (시간: TZID 벽시계, 종일: VALUE=DATE)
//  - 예외 인스턴스(recurring_event_id): 구글에서는 "마스터id_원래시작" 인스턴스 id 를 수정하는 방식이다. 반복 규칙은 보내지 않는다.
//  - 지울 수 있게 비운 필드는 null 로 보낸다(PATCH 에서 null = 삭제).
import { addDays, dateKey, zonedParts } from "../../_shared/time.ts";

export type LocalEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  rrule: string | null;
  exdates: string[] | null;
  recurring_event_id: string | null;
  original_start_at: string | null;
  google_event_id: string | null;
  google_etag: string | null;
  deleted_at: string | null;
  updated_at: string;
  calendar_id: string | null;
};

export type GoogleBody = Record<string, unknown>;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (key: string) => key.replaceAll("-", "");

function localBasic(iso: string, tz: string): string {
  const p = zonedParts(iso, tz);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/** 종일 이벤트의 구글 날짜 범위: end 는 시작보다 항상 이후(exclusive) */
export function allDayDates(startAt: string, endAt: string, tz: string) {
  const start = dateKey(startAt, tz);
  let end = dateKey(endAt, tz);
  if (end <= start) end = addDays(start, 1);
  return { start, end };
}

/** 종일 반복 규칙의 UNTIL(UTC 일시)을 날짜(사용자 시간대) 형식으로 바꾼다. 구글은 DATE 시작에 날짜 UNTIL 만 허용한다. */
export function rruleForGoogle(rrule: string, allDay: boolean, tz: string): string {
  if (!allDay) return rrule;
  return rrule.replace(/UNTIL=(\d{8}T\d{6}Z)/i, (_m, u: string) => {
    const d = new Date(`${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`);
    return `UNTIL=${ymd(dateKey(d, tz))}`;
  });
}

export function recurrenceLines(ev: Pick<LocalEvent, "rrule" | "exdates" | "all_day">, tz: string): string[] | null {
  if (!ev.rrule) return null;
  const lines = [`RRULE:${rruleForGoogle(ev.rrule, ev.all_day, tz)}`];
  const ex = ev.exdates ?? [];
  if (ex.length) {
    if (ev.all_day) lines.push(`EXDATE;VALUE=DATE:${ex.map((x) => ymd(dateKey(x, tz))).join(",")}`);
    else lines.push(`EXDATE;TZID=${tz}:${ex.map((x) => localBasic(x, tz)).join(",")}`);
  }
  return lines;
}

/** 구글 인스턴스 id: 마스터 id + "_" + 원래 시작(종일: 날짜, 시간: UTC 기본 형식) */
export function instanceId(masterGoogleId: string, originalStartAt: string, allDay: boolean, tz: string): string {
  if (allDay) return `${masterGoogleId}_${ymd(dateKey(originalStartAt, tz))}`;
  const d = new Date(originalStartAt);
  return `${masterGoogleId}_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function toGoogleBody(ev: LocalEvent, tz: string): GoogleBody {
  const isException = Boolean(ev.recurring_event_id);
  const body: GoogleBody = {
    summary: ev.title,
    location: ev.location,
    description: ev.notes,
    extendedProperties: { private: { appEventId: ev.id } },
  };
  if (ev.all_day) {
    const d = allDayDates(ev.start_at, ev.end_at, tz);
    body.start = { date: d.start };
    body.end = { date: d.end };
  } else {
    body.start = { dateTime: new Date(ev.start_at).toISOString(), timeZone: tz };
    body.end = { dateTime: new Date(ev.end_at).toISOString(), timeZone: tz };
  }
  if (!isException) body.recurrence = recurrenceLines(ev, tz); // null 이면 반복 해제
  return body;
}
