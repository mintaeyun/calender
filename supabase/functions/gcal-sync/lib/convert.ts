// 구글 캘린더 이벤트(Events resource) → events 행 변환 (순수 함수).
//
// 규칙(02 calendar 의 저장 규칙과 동일):
//  - 종일: start_at = 시작일 00:00(사용자 시간대), end_at = 구글의 end.date(exclusive) 00:00  → 그대로 저장하면 02 규칙과 일치
//  - 시간: dateTime(오프셋 포함)을 UTC 로. 오프셋이 없으면 이벤트의 timeZone(없으면 사용자 시간대)으로 해석
//  - 반복: recurrence 의 RRULE 줄을 events.rrule 에 접두사 없이 그대로(변환하지 않음), EXDATE 줄은 events.exdates 로
//  - 예외 인스턴스: recurringEventId/originalStartTime → recurring_event_id(로컬 id는 호출 측이 채움)/original_start_at
//  - 취소(status=cancelled): 일반/마스터는 소프트 삭제, 반복의 한 인스턴스 취소는 마스터 exdates 에 추가
import { startOfDayUtc, zonedToUtc } from "../../_shared/time.ts";

export type GoogleDateTime = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleDateTime;
  updated?: string;
  /** 앱이 push 할 때 넣는 보조 매칭 키(extendedProperties.private.appEventId) */
  extendedProperties?: { private?: Record<string, string> };
};

/** events 테이블에 쓸 값(로컬 id·user_id·calendar_id·recurring_event_id 는 호출 측이 채운다) */
export type ConvertedEvent = {
  google_event_id: string;
  google_etag: string | null;
  google_updated_at: string | null;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  rrule: string | null;
  exdates: string[];
  /** 예외 인스턴스일 때 마스터의 구글 id 와 원래 발생 시각 */
  master_google_id: string | null;
  original_start_at: string | null;
  /** 이 이벤트를 앱이 만들어 push 했다면 그 로컬 일정 id */
  app_event_id: string | null;
};

export type ConvertResult =
  | { kind: "upsert"; event: ConvertedEvent }
  /** 삭제된 일정 또는 일정 전체 취소 */
  | { kind: "delete"; google_event_id: string }
  /** 반복 일정의 한 인스턴스만 취소: 마스터 exdates 에 추가 */
  | { kind: "cancel_instance"; master_google_id: string; original_start_at: string; google_event_id: string }
  | { kind: "skip"; reason: string };

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/** 구글 날짜/시각 값 → { utc, allDay } */
export function parseGoogleTime(v: GoogleDateTime | undefined, userTz: string): { at: Date; allDay: boolean } | null {
  if (!v) return null;
  if (v.date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.date);
    if (!m) return null;
    return { at: startOfDayUtc(v.date, userTz), allDay: true };
  }
  if (v.dateTime) {
    if (HAS_OFFSET.test(v.dateTime)) {
      const d = new Date(v.dateTime);
      return Number.isNaN(d.getTime()) ? null : { at: d, allDay: false };
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v.dateTime);
    if (!m) return null;
    return { at: zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], v.timeZone ?? userTz), allDay: false };
  }
  return null;
}

/** recurrence 줄들에서 RRULE 한 줄(접두사 제거)을 꺼낸다. 여러 줄이면 첫 줄만(앱은 단일 규칙만 지원). */
export function extractRRule(lines: string[] | undefined): string | null {
  const l = lines?.find((x) => /^RRULE:/i.test(x.trim()));
  return l ? l.trim().replace(/^RRULE:/i, "") : null;
}

/** EXDATE 줄들 → UTC ISO 목록. 형식: `EXDATE;TZID=Asia/Seoul:20261019T093000,…` / `EXDATE:20261019T003000Z` / `EXDATE;VALUE=DATE:20261019` */
export function extractExdates(lines: string[] | undefined, userTz: string, eventTz?: string): string[] {
  const out: string[] = [];
  for (const raw of lines ?? []) {
    const line = raw.trim();
    if (!/^EXDATE/i.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const params = line.slice(0, idx);
    const tzid = /TZID=([^;:]+)/i.exec(params)?.[1];
    const isDate = /VALUE=DATE(?!-)/i.test(params);
    for (const v of line.slice(idx + 1).split(",")) {
      const t = v.trim();
      let d: Date | null = null;
      if (/^\d{8}$/.test(t) || isDate) {
        d = startOfDayUtc(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`, userTz);
      } else {
        const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(t);
        if (!m) continue;
        d = m[7]
          ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)))
          : zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tzid ?? eventTz ?? userTz);
      }
      if (d && !Number.isNaN(d.getTime())) out.push(d.toISOString());
    }
  }
  return [...new Set(out)];
}

export function convertGoogleEvent(g: GoogleEvent, userTz: string): ConvertResult {
  if (g.status === "cancelled") {
    if (g.recurringEventId) {
      const orig = parseGoogleTime(g.originalStartTime, userTz);
      if (orig) {
        return { kind: "cancel_instance", master_google_id: g.recurringEventId, original_start_at: orig.at.toISOString(), google_event_id: g.id };
      }
    }
    return { kind: "delete", google_event_id: g.id };
  }

  const start = parseGoogleTime(g.start, userTz);
  if (!start) return { kind: "skip", reason: "시작 시각 없음" };
  let end = parseGoogleTime(g.end, userTz);
  if (!end || end.at.getTime() < start.at.getTime()) end = { at: start.at, allDay: start.allDay };

  const isException = Boolean(g.recurringEventId);
  const orig = isException ? parseGoogleTime(g.originalStartTime, userTz) : null;
  const eventTz = g.start?.timeZone;

  return {
    kind: "upsert",
    event: {
      google_event_id: g.id,
      google_etag: g.etag ?? null,
      google_updated_at: g.updated ? new Date(g.updated).toISOString() : null,
      title: g.summary?.trim() || "(제목 없음)",
      start_at: start.at.toISOString(),
      end_at: end.at.toISOString(),
      all_day: start.allDay,
      location: g.location?.trim() || null,
      notes: g.description?.trim() || null,
      // 예외 인스턴스는 자체 규칙을 갖지 않는다.
      rrule: isException ? null : extractRRule(g.recurrence),
      exdates: isException ? [] : extractExdates(g.recurrence, userTz, eventTz),
      master_google_id: isException && orig ? g.recurringEventId! : null,
      original_start_at: isException && orig ? orig.at.toISOString() : null,
      app_event_id: g.extendedProperties?.private?.appEventId ?? null,
    },
  };
}
