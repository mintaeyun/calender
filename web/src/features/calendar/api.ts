// 일정 데이터 접근. supabase 호출은 이 파일에만 둔다. (RLS가 user_id 를 강제하지만 insert 에는 user_id 를 직접 넣어야 한다.)
// 구글 연동(07)이 같은 행을 upsert 하므로 update 시 google_event_id / google_etag / google_updated_at 는 건드리지 않는다.

import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { DateRange, EventInstance, EventRow } from "./lib/recurrence";
import { planDelete, planEdit, type EventFields, type NewEvent, type Op, type Scope } from "./lib/scope";

export type CalendarRow = Tables<"calendars">;
export type EventWithReminders = EventRow & { event_reminders: { minutes_before: number }[] };

const db = () => createClient();

async function currentUserId(): Promise<string> {
  const { data } = await db().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("로그인이 필요합니다.");
  return id;
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

export async function listCalendars(): Promise<CalendarRow[]> {
  const { data, error } = await db().from("calendars").select("*").order("created_at");
  if (error) throw error;
  return data;
}

/**
 * 범위 [start, end) 에 보일 수 있는 일정 행들 (삭제되지 않은 것만).
 * 일반 일정 + 반복 마스터(시작이 범위 끝 이전) + 원래 발생이 범위 안인 예외 행.
 * 화면에 그릴 발생(인스턴스)은 expandEvents() 로 전개한다.
 */
export async function listEvents(range: DateRange): Promise<EventWithReminders[]> {
  const s = range.start.toISOString();
  const e = range.end.toISOString();
  const { data, error } = await db()
    .from("events")
    .select("*, event_reminders(minutes_before)")
    .is("deleted_at", null)
    .or(
      [
        `and(start_at.lt.${e},end_at.gte.${s})`,
        `and(rrule.not.is.null,start_at.lt.${e})`,
        `and(original_start_at.gte.${s},original_start_at.lt.${e})`,
      ].join(","),
    )
    .order("start_at");
  if (error) throw error;
  return data as unknown as EventWithReminders[];
}

/** 제목·메모 검색 (CAL-9). 통합 검색(08)이 재사용한다. 반복 일정은 마스터 1건으로 나온다. */
export async function searchEvents(opts: {
  query: string;
  start?: Date;
  end?: Date;
  calendarId?: string;
  limit?: number;
}): Promise<EventWithReminders[]> {
  const q = opts.query.trim().replace(/[%,()]/g, " ");
  let req = db()
    .from("events")
    .select("*, event_reminders(minutes_before)")
    .is("deleted_at", null)
    .is("recurring_event_id", null)
    .or(`title.ilike.%${q}%,notes.ilike.%${q}%,location.ilike.%${q}%`)
    .order("start_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.start) req = req.gte("end_at", opts.start.toISOString());
  if (opts.end) req = req.lt("start_at", opts.end.toISOString());
  if (opts.calendarId) req = req.eq("calendar_id", opts.calendarId);
  const { data, error } = await req;
  if (error) throw error;
  return data as unknown as EventWithReminders[];
}

/** 오버레이(CAL-8): 마감일이 범위 안인 할일. 읽기 전용 조회. */
export async function listTodoDeadlines(startKey: string, endKey: string) {
  const { data, error } = await db()
    .from("todos")
    .select("id, title, due_date, status, priority")
    .is("deleted_at", null)
    .gte("due_date", startKey)
    .lte("due_date", endKey);
  if (error) throw error;
  return data;
}

/** 오버레이(CAL-8): 활성 고정지출. 결제 예정일은 overlays.paymentDatesInRange 로 계산한다. */
export async function listRecurringPayments() {
  const { data, error } = await db()
    .from("recurring_payments")
    .select("id, name, amount, cycle, pay_day, pay_month")
    .eq("active", true);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// 쓰기
// ---------------------------------------------------------------------------

async function replaceReminders(eventId: string, minutes: number[]) {
  const unique = [...new Set(minutes)].filter((m) => Number.isInteger(m) && m >= 0);
  const userId = await currentUserId();
  const { error: delErr } = await db().from("event_reminders").delete().eq("event_id", eventId);
  if (delErr) throw delErr;
  if (!unique.length) return;
  const { error } = await db()
    .from("event_reminders")
    .insert(unique.map((m) => ({ event_id: eventId, user_id: userId, minutes_before: m })));
  if (error) throw error;
}

async function remindersOf(eventId: string): Promise<number[]> {
  const { data, error } = await db().from("event_reminders").select("minutes_before").eq("event_id", eventId);
  if (error) throw error;
  return data.map((r) => r.minutes_before);
}

export async function createEvent(fields: EventFields, reminders: number[]): Promise<EventRow> {
  const userId = await currentUserId();
  const row: NewEvent = {
    ...fields, recurring_event_id: null, original_start_at: null, exdates: [],
  };
  const { data, error } = await db().from("events").insert({ ...row, user_id: userId }).select().single();
  if (error) throw error;
  await replaceReminders(data.id, reminders);
  return data;
}

/** 반복이 아닌 일정(또는 반복 여부를 새로 정하는 일정)의 단순 수정 */
export async function updateEvent(id: string, fields: Partial<EventFields>, reminders?: number[]): Promise<void> {
  const { error } = await db().from("events").update(fields).eq("id", id);
  if (error) throw error;
  if (reminders) await replaceReminders(id, reminders);
}

/** 소프트 삭제 (deleted_at). 30일 뒤 pg_cron 이 영구 삭제한다. */
export async function softDeleteEvent(id: string): Promise<void> {
  const { error } = await db().from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function loadSeries(masterId: string): Promise<{ master: EventRow; exceptions: EventRow[] }> {
  const { data: master, error } = await db().from("events").select("*").eq("id", masterId).is("deleted_at", null).single();
  if (error) throw error;
  const { data: exceptions, error: e2 } = await db()
    .from("events").select("*").eq("recurring_event_id", masterId).is("deleted_at", null);
  if (e2) throw e2;
  return { master, exceptions };
}

/** 계획(Op 목록)을 순서대로 실행한다. 새 행 생성이 먼저 오도록 계획되어 있어 중간 실패 시 데이터 손실을 줄인다. */
async function runOps(ops: Op[]): Promise<void> {
  const userId = await currentUserId();
  const refs: Record<string, string> = {};
  const client = db();
  for (const op of ops) {
    if (op.op === "insert") {
      const { data, error } = await client.from("events").insert({ ...op.row, user_id: userId }).select("id").single();
      if (error) throw error;
      refs[op.ref] = data.id;
      const minutes = "minutes" in op.reminders ? op.reminders.minutes : await remindersOf(op.reminders.copyFrom);
      await replaceReminders(data.id, minutes);
    } else if (op.op === "update") {
      const { error } = await client.from("events").update(op.patch).eq("id", op.id);
      if (error) throw error;
    } else if (op.op === "softDelete") {
      await softDeleteEvent(op.id);
    } else if (op.op === "reparent") {
      const { error } = await client.from("events").update({ ...op.patch, recurring_event_id: refs[op.toRef] }).eq("id", op.id);
      if (error) throw error;
    } else if (op.op === "setReminders") {
      await replaceReminders(op.id, op.minutes);
    }
  }
}

export type SaveArgs = {
  /** 수정하는 발생. 없으면 새 일정 */
  instance?: EventInstance;
  /** 반복 일정을 수정할 때의 범위 (비반복 일정은 무시) */
  scope?: Scope;
  fields: EventFields;
  /** 생략하면 알림은 그대로 둔다 (드래그 이동 등) */
  reminders?: number[];
  /** 비반복 일정에서 시각(start_at/end_at)만 갱신 (드래그 이동·크기 조절) */
  timesOnly?: boolean;
  tz: string;
};

/** 생성 / 수정 통합 진입점 */
export async function saveEvent({ instance, scope, fields, reminders, timesOnly, tz }: SaveArgs): Promise<void> {
  if (!instance) {
    await createEvent(fields, reminders ?? []);
    return;
  }
  if (!instance.recurring) {
    const patch = timesOnly ? { start_at: fields.start_at, end_at: fields.end_at } : fields;
    await updateEvent(instance.event.id, patch, reminders);
    return;
  }
  const { master, exceptions } = await loadSeries(instance.masterId!);
  const ops = planEdit({
    master, exceptions, scope: scope ?? "all", fields, reminders, tz,
    target: { instanceStart: instance.start, exception: instance.isException ? instance.event : undefined },
  });
  await runOps(ops);
}

export type DeleteArgs = { instance: EventInstance; scope?: Scope; tz: string };

export async function deleteEvent({ instance, scope, tz }: DeleteArgs): Promise<void> {
  if (!instance.recurring) {
    await softDeleteEvent(instance.event.id);
    return;
  }
  const { master, exceptions } = await loadSeries(instance.masterId!);
  await runOps(
    planDelete({
      master, exceptions, scope: scope ?? "all", tz,
      target: { instanceStart: instance.start, exception: instance.isException ? instance.event : undefined },
    }),
  );
}
