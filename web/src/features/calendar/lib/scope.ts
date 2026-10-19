// 반복 일정 수정·삭제의 "이번만 / 이후 전체 / 전체" 계획기. 순수 함수 — DB를 건드리지 않고 수행할 작업 목록(Op)만 만든다.
// api.ts 가 Op 를 순서대로 실행한다. (PostgREST 에는 다중 문 트랜잭션이 없으므로 "새 행 생성 → 기존 행 수정" 순서로 실패 시 손실을 줄인다.)
//
// 처리 방식
//  - 이번만:   마스터 발생분 → 예외 인스턴스 행 생성(recurring_event_id + original_start_at). 이미 예외 행이면 그 행만 수정.
//              삭제는 마스터 exdates 에 원래 발생 시각을 추가(예외 행이면 그 행도 소프트 삭제).
//  - 이후 전체: 마스터 rrule 에 UNTIL(=분할 시각 −1초)을 걸고, 분할 시각부터 새 마스터를 만든다.
//              이후의 예외 행·exdates 는 새 마스터로 옮기고 시각 차이(delta)만큼 평행이동한다. 분할 시각이 첫 발생이면 "전체"와 같다.
//  - 전체:     마스터를 수정. 시각을 바꾸면 delta 만큼 exdates·예외 행의 original_start_at 도 이동한다.
//  - 예외 행을 "전체/이후 전체"로 수정하면 그 행은 마스터에 흡수(소프트 삭제)된다.

import type { EventRow } from "./recurrence";
import { tailRRule, truncateRRule } from "./recurrence";

export type Scope = "this" | "following" | "all";

/** 폼이 결정한 새 값 (인스턴스의 새 시작/종료 포함) */
export type EventFields = {
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  color: string | null;
  calendar_id: string | null;
  /** 반복 규칙. null = 반복 없음으로 변경, 마스터와 같은 값 = 변경 없음 */
  rrule: string | null;
};

export type NewEvent = Omit<
  EventRow,
  "id" | "user_id" | "created_at" | "updated_at" | "deleted_at" | "google_event_id" | "google_etag" | "google_updated_at" | "google_synced_at"
>;

export type Op =
  | { op: "update"; id: string; patch: Partial<EventRow> }
  | { op: "insert"; ref: string; row: NewEvent; reminders: { copyFrom: string } | { minutes: number[] } }
  | { op: "softDelete"; id: string }
  | { op: "reparent"; id: string; toRef: string; patch: Partial<EventRow> }
  | { op: "setReminders"; id: string; minutes: number[] };

export type Target = {
  /** 사용자가 고른 발생의 (현재 화면상) 시작 시각 */
  instanceStart: Date;
  /** 고른 발생이 예외 인스턴스 행이면 그 행 */
  exception?: EventRow;
};

type Input = {
  master: EventRow;
  /** 이 마스터의 삭제되지 않은 예외 행들 */
  exceptions: EventRow[];
  target: Target;
  scope: Scope;
  tz: string;
};

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | Date) => new Date(s).getTime();
const originalOf = (t: Target) => (t.exception?.original_start_at ? ms(t.exception.original_start_at) : t.instanceStart.getTime());

function common(master: EventRow): NewEvent {
  return {
    calendar_id: master.calendar_id, title: master.title, start_at: master.start_at, end_at: master.end_at,
    all_day: master.all_day, location: master.location, notes: master.notes, color: master.color,
    rrule: master.rrule, recurring_event_id: null, original_start_at: null, exdates: [],
  };
}

const fieldPatch = (f: EventFields) => ({
  title: f.title, start_at: f.start_at, end_at: f.end_at, all_day: f.all_day,
  location: f.location, notes: f.notes, color: f.color, calendar_id: f.calendar_id,
});

export function planEdit(input: Input & { fields: EventFields; reminders?: number[] }): Op[] {
  const { master, exceptions, target, scope, fields, reminders } = input;
  const T = originalOf(target);
  const masterStart = ms(master.start_at);
  const currentStart = target.exception ? ms(target.exception.start_at) : target.instanceStart.getTime();
  const delta = ms(fields.start_at) - currentStart;
  const duration = ms(fields.end_at) - ms(fields.start_at);
  const ops: Op[] = [];
  const setRem = (id: string) => { if (reminders) ops.push({ op: "setReminders", id, minutes: reminders }); };

  if (scope === "this") {
    const rest = fieldPatch(fields); // 이번만 수정에서는 반복 규칙을 바꾸지 않는다
    if (target.exception) {
      ops.push({ op: "update", id: target.exception.id, patch: rest });
      setRem(target.exception.id);
    } else {
      ops.push({
        op: "insert", ref: "exception",
        row: { ...common(master), ...rest, rrule: null, recurring_event_id: master.id, original_start_at: iso(T), exdates: [] },
        reminders: reminders ? { minutes: reminders } : { copyFrom: master.id },
      });
    }
    return ops;
  }

  const toAll = scope === "all" || T <= masterStart;

  if (toAll) {
    const newMasterStart = masterStart + delta;
    const rrule = fields.rrule;
    const patch: Partial<EventRow> = {
      ...fieldPatch(fields),
      start_at: iso(newMasterStart),
      end_at: iso(newMasterStart + duration),
      rrule,
      exdates: rrule === null ? [] : master.exdates.map((x) => iso(ms(x) + delta)),
    };
    ops.push({ op: "update", id: master.id, patch });
    setRem(master.id);
    for (const e of exceptions) {
      if (target.exception && e.id === target.exception.id) ops.push({ op: "softDelete", id: e.id });
      else if (rrule === null) ops.push({ op: "softDelete", id: e.id });
      else if (delta !== 0) ops.push({ op: "update", id: e.id, patch: { original_start_at: iso(ms(e.original_start_at!) + delta) } });
    }
    return ops;
  }

  // 이후 전체
  const unchanged = fields.rrule === master.rrule;
  const tail = fields.rrule === null ? null : unchanged ? tailRRule(master.rrule!, master.start_at, new Date(T), input.tz) : fields.rrule;
  ops.push({
    op: "insert", ref: "tail",
    row: {
      ...common(master), ...fieldPatch(fields), rrule: tail,
      exdates: tail === null ? [] : master.exdates.filter((x) => ms(x) >= T).map((x) => iso(ms(x) + delta)),
    },
    reminders: reminders ? { minutes: reminders } : { copyFrom: master.id },
  });
  ops.push({
    op: "update", id: master.id,
    patch: {
      rrule: truncateRRule(master.rrule!, new Date(T - 1000)),
      exdates: master.exdates.filter((x) => ms(x) < T),
    },
  });
  for (const e of exceptions) {
    const orig = ms(e.original_start_at!);
    if (target.exception && e.id === target.exception.id) ops.push({ op: "softDelete", id: e.id });
    else if (orig >= T) {
      if (tail === null) ops.push({ op: "softDelete", id: e.id });
      else ops.push({ op: "reparent", id: e.id, toRef: "tail", patch: { original_start_at: iso(orig + delta) } });
    }
  }
  return ops;
}

export function planDelete(input: Input): Op[] {
  const { master, exceptions, target, scope } = input;
  const T = originalOf(target);
  const ops: Op[] = [];

  if (scope === "this") {
    if (target.exception) ops.push({ op: "softDelete", id: target.exception.id });
    ops.push({ op: "update", id: master.id, patch: { exdates: [...new Set([...master.exdates.map((x) => iso(ms(x))), iso(T)])] } });
    return ops;
  }

  if (scope === "all" || T <= ms(master.start_at)) {
    ops.push({ op: "softDelete", id: master.id });
    for (const e of exceptions) ops.push({ op: "softDelete", id: e.id });
    return ops;
  }

  ops.push({
    op: "update", id: master.id,
    patch: { rrule: truncateRRule(master.rrule!, new Date(T - 1000)), exdates: master.exdates.filter((x) => ms(x) < T) },
  });
  for (const e of exceptions) if (ms(e.original_start_at!) >= T) ops.push({ op: "softDelete", id: e.id });
  return ops;
}
