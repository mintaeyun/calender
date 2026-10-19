// 일정 쓰기 도구. 단일(비반복) 일정만 다룬다 — 반복 일정의 "이번만/이후/전체" 수정은 웹에서 한다(AGENTS.md 반복 규칙).
// 종일 저장 규칙은 web allday.ts 와 동일: start_at=첫날 00:00, end_at=마지막 날 다음 날 00:00(exclusive).
import { ToolError } from "../lib/resolve.ts";
import { dateKey, endOfDayUtc, startOfDayUtc } from "../../_shared/time.ts";
import { isDateOnly, parseInput } from "../lib/datetime.ts";
import { calendarsOf, COLS, present } from "./events.ts";
import { must, one, type Ctx } from "./context.ts";
import type { EventRow } from "../lib/recurrence.ts";

const RECURRING_HINT = "반복 일정의 수정·삭제는 지원하지 않습니다. 웹 앱에서 '이번만 / 이후 전체 / 전체' 중 선택해 처리해 달라고 사용자에게 안내해 주세요.";

/** all_day 일정의 첫날/마지막 날(포함) 입력 → 저장 시각 */
function allDayRange(start: string, end: string, tz: string) {
  const first = isDateOnly(start) ? start : dateKey(parseInput(start, tz), tz);
  const last = isDateOnly(end) ? end : dateKey(parseInput(end, tz), tz);
  if (last < first) throw new ToolError("종일 일정의 end 는 start 이후(같은 날 가능)여야 합니다.");
  return { start_at: startOfDayUtc(first, tz).toISOString(), end_at: endOfDayUtc(last, tz).toISOString() };
}

function timedRange(start: string, end: string, tz: string) {
  if (isDateOnly(start) || isDateOnly(end)) {
    throw new ToolError("시간 일정은 start/end 에 시각이 필요합니다.", "하루 종일이면 all_day=true 로, 아니면 2026-10-15T15:00:00+09:00 형식으로 주세요.");
  }
  const s = parseInput(start, tz), e = parseInput(end, tz);
  if (e < s) throw new ToolError("end 는 start 이후여야 합니다.");
  return { start_at: s.toISOString(), end_at: e.toISOString() };
}

async function defaultCalendarId(ctx: Ctx): Promise<string | null> {
  const rows = must(
    await ctx.db.select("calendars", "id").eq("source", "local").order("created_at").limit(1), "캘린더",
  ) as { id: string }[];
  return rows[0]?.id ?? null;
}

async function replaceReminders(ctx: Ctx, eventId: string, minutes: number[]) {
  const unique = [...new Set(minutes)];
  if (!unique.length) return;
  const { error } = await ctx.db.insert("event_reminders", unique.map((m) => ({ event_id: eventId, minutes_before: m })) as never);
  if (error) throw new ToolError("알림을 저장하지 못했습니다. 일정은 만들어졌습니다.");
}

async function show(ctx: Ctx, row: EventRow, reminders: number[]) {
  const calendars = await calendarsOf(ctx);
  const s = new Date(row.start_at), e = new Date(row.end_at);
  return {
    ...present({ key: row.id, event: row, start: s, end: e, recurring: false, masterId: null, isException: false, originalStart: null }, ctx.tz, calendars),
    reminders_minutes_before: reminders,
  };
}

export async function createEvent(ctx: Ctx, a: Record<string, unknown>) {
  const title = String(a.title).trim();
  if (!title) throw new ToolError("제목이 비어 있습니다.");
  const allDay = a.all_day === true;
  const range = allDay ? allDayRange(a.start as string, a.end as string, ctx.tz) : timedRange(a.start as string, a.end as string, ctx.tz);
  const reminders = (a.reminders as number[] | undefined) ?? [];
  const { data, error } = await ctx.db
    .insert("events", {
      title, ...range, all_day: allDay, location: a.location ?? null, notes: a.notes ?? null,
      calendar_id: await defaultCalendarId(ctx), rrule: null, recurring_event_id: null, original_start_at: null, exdates: [],
    })
    .select(COLS).single();
  if (error) {
    console.error("create_event 실패", error);
    throw new ToolError("일정을 만들지 못했습니다.");
  }
  await replaceReminders(ctx, data.id, reminders);
  return { created: await show(ctx, data as EventRow, reminders) };
}

async function load(ctx: Ctx, id: string): Promise<EventRow> {
  const row = one(must(await ctx.db.select("events", COLS).eq("id", id).is("deleted_at", null).limit(1), "일정") as EventRow[], "일정");
  if (row.rrule || row.recurring_event_id) throw new ToolError(`'${row.title}'은(는) 반복 일정입니다.`, RECURRING_HINT);
  return row;
}

export async function updateEvent(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const patch: Record<string, unknown> = {};
  if (a.title !== undefined) {
    if (!String(a.title).trim()) throw new ToolError("제목이 비어 있습니다.");
    patch.title = String(a.title).trim();
  }
  if (a.location !== undefined) patch.location = a.location;
  if (a.notes !== undefined) patch.notes = a.notes;

  const allDay = (a.all_day as boolean | undefined) ?? cur.all_day;
  const touchesTime = a.start !== undefined || a.end !== undefined || allDay !== cur.all_day;
  if (touchesTime) {
    const curStart = new Date(cur.start_at), curEnd = new Date(cur.end_at);
    if (allDay) {
      const curFirst = dateKey(curStart, ctx.tz), curLast = dateKey(new Date(curEnd.getTime() - 1000), ctx.tz);
      Object.assign(patch, allDayRange((a.start as string | undefined) ?? curFirst, (a.end as string | undefined) ?? (a.start as string | undefined) ?? curLast, ctx.tz));
    } else if (allDay !== cur.all_day && (a.start === undefined || a.end === undefined)) {
      throw new ToolError("종일 ↔ 시간 일정으로 바꿀 때는 start 와 end 를 모두 주세요.");
    } else {
      for (const k of ["start", "end"]) {
        if (typeof a[k] === "string" && isDateOnly(a[k] as string)) throw new ToolError("시간 일정은 start/end 에 시각이 필요합니다.", "예: 2026-10-15T15:00:00+09:00");
      }
      // start 만 바꾸면 기존 길이를 유지한다.
      const s = a.start ? parseInput(a.start as string, ctx.tz) : curStart;
      const e = a.end ? parseInput(a.end as string, ctx.tz) : a.start ? new Date(s.getTime() + (curEnd.getTime() - curStart.getTime())) : curEnd;
      if (e < s) throw new ToolError("end 는 start 이후여야 합니다.");
      patch.start_at = s.toISOString();
      patch.end_at = e.toISOString();
    }
    patch.all_day = allDay;
  }
  if (!Object.keys(patch).length) throw new ToolError("바꿀 필드가 없습니다.", "title, start, end, all_day, location, notes 중 하나 이상을 주세요.");

  const { data, error } = await ctx.db.update("events", patch).eq("id", cur.id).is("deleted_at", null).select(COLS);
  if (error) {
    console.error("update_event 실패", error);
    throw new ToolError("일정을 수정하지 못했습니다.");
  }
  const updated = one(data as EventRow[], "일정");
  return { updated: await show(ctx, updated, []) };
}

export async function deleteEvent(ctx: Ctx, a: Record<string, unknown>) {
  const cur = await load(ctx, a.id as string);
  const { data, error } = await ctx.db
    .update("events", { deleted_at: new Date().toISOString() })
    .eq("id", cur.id).is("deleted_at", null).select("id");
  if (error) {
    console.error("delete_event 실패", error);
    throw new ToolError("일정을 삭제하지 못했습니다.");
  }
  one(data, "일정");
  return { deleted: true, id: cur.id, title: cur.title, start: cur.start_at, note: "휴지통으로 이동했으며 30일 뒤 영구 삭제됩니다." };
}
