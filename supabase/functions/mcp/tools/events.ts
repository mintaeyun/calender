import { resolveNamed, ToolError } from "../lib/resolve.ts";
import { expandEvents, type EventInstance, type EventRow } from "../lib/recurrence.ts";
import { allDayDates, formatLocal, offsetMinutes, parseInput } from "../lib/datetime.ts";
import { findFreeTime } from "../lib/free-time.ts";
import { must, PAGE_SIZE, type Ctx } from "./context.ts";

export const COLS = "id,title,start_at,end_at,all_day,location,notes,calendar_id,rrule,recurring_event_id,original_start_at,exdates,deleted_at";
const MAX_RANGE_MS = 400 * 86_400_000;
const MAX_ROWS = 2000;
type Named = { id: string; name: string };

function toRange(a: Record<string, unknown>, ctx: Ctx, defaults?: { start: Date; end: Date }) {
  const start = a.start ? parseInput(a.start as string, ctx.tz, "start") : defaults?.start;
  const end = a.end ? parseInput(a.end as string, ctx.tz, "end") : defaults?.end;
  if (!start || !end) throw new ToolError("start 와 end 가 필요합니다.");
  if (end <= start) throw new ToolError("end 는 start 이후여야 합니다.");
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) throw new ToolError("조회 기간은 최대 400일입니다.", "기간을 나눠서 조회해 주세요.");
  return { start, end };
}

/** 범위와 겹칠 수 있는 일정 행 + 그 반복 일정의 예외 행을 가져온다. match 는 텍스트 검색용 or 조건. */
async function fetchEvents(ctx: Ctx, range: { start: Date; end: Date }, opts: { calendarId?: string; match?: string }) {
  let q = ctx.db.select("events", COLS).is("deleted_at", null).is("recurring_event_id", null)
    .lt("start_at", range.end.toISOString())
    // 반복 일정은 시작이 범위보다 앞이어도 발생분이 걸릴 수 있어 end 조건을 걸지 않는다.
    .or(`rrule.not.is.null,end_at.gt.${range.start.toISOString()}`);
  if (opts.calendarId) q = q.eq("calendar_id", opts.calendarId);
  if (opts.match) q = q.or(opts.match);
  const masters = must(await q.order("start_at").limit(MAX_ROWS + 1), "일정") as EventRow[];
  if (masters.length > MAX_ROWS) throw new ToolError("일정이 너무 많습니다.", "기간을 줄이거나 검색어를 구체적으로 지정해 주세요.");

  const ids = masters.filter((e) => e.rrule).map((e) => e.id);
  let exceptions: EventRow[] = [];
  if (ids.length) {
    exceptions = must(
      await ctx.db.select("events", COLS).is("deleted_at", null).in("recurring_event_id", ids).limit(MAX_ROWS),
      "반복 예외 일정",
    ) as EventRow[];
  }
  return [...masters, ...exceptions];
}

export function present(i: EventInstance, tz: string, calendars: Named[]) {
  const e = i.event;
  const base = {
    id: e.id,
    series_id: i.masterId,
    title: e.title,
    all_day: e.all_day,
    location: e.location,
    notes: e.notes,
    calendar: e.calendar_id ? (calendars.find((c) => c.id === e.calendar_id)?.name ?? null) : null,
    recurring: i.recurring,
  };
  // 종일은 날짜(마지막 날 포함), 시간 일정은 사용자 시간대 오프셋이 붙은 ISO
  return e.all_day
    ? { ...base, ...(() => { const d = allDayDates(i.start, i.end, tz); return { start: d.start, end: d.end }; })() }
    : { ...base, start: formatLocal(i.start, tz), end: formatLocal(i.end, tz) };
}

export async function calendarsOf(ctx: Ctx): Promise<Named[]> {
  return must(await ctx.db.select("calendars", "id,name"), "캘린더") as Named[];
}

export async function listEvents(ctx: Ctx, a: Record<string, unknown>) {
  const range = toRange(a, ctx);
  const calendars = await calendarsOf(ctx);
  const calendarId = a.calendar ? resolveNamed("캘린더", String(a.calendar), calendars).id : undefined;
  const rows = await fetchEvents(ctx, range, { calendarId });
  const all = expandEvents(rows, range, ctx.tz);
  return { events: all.slice(0, PAGE_SIZE).map((i) => present(i, ctx.tz, calendars)), truncated: all.length > PAGE_SIZE, count: all.length };
}

// PostgREST or() 문법을 깨는 문자를 제거한다(검색어는 부분 일치용이라 영향이 작다).
const sanitize = (q: string) => q.replace(/[,()"\\%_*]/g, " ").replace(/\s+/g, " ").trim();

export async function searchEvents(ctx: Ctx, a: Record<string, unknown>) {
  const q = sanitize(String(a.query));
  if (!q) throw new ToolError("검색어가 비어 있습니다.");
  const now = Date.now();
  const range = toRange(a, ctx, { start: new Date(now - 31 * 86_400_000), end: new Date(now + 365 * 86_400_000) });
  const calendars = await calendarsOf(ctx);
  const like = `%${q}%`;
  const rows = await fetchEvents(ctx, range, { match: `title.ilike.${like},location.ilike.${like},notes.ilike.${like}` });
  const needle = q.toLowerCase();
  const hit = (e: EventRow) => [e.title, e.location, e.notes].some((s) => s?.toLowerCase().includes(needle));
  const all = expandEvents(rows, range, ctx.tz).filter((i) => hit(i.event));
  return { events: all.slice(0, PAGE_SIZE).map((i) => present(i, ctx.tz, calendars)), truncated: all.length > PAGE_SIZE, count: all.length };
}

export async function findFreeTimeTool(ctx: Ctx, a: Record<string, unknown>) {
  const range = toRange(a, ctx);
  const rows = await fetchEvents(ctx, range, {});
  // 종일 일정(공휴일·기념일 등)은 시간을 점유하지 않는 것으로 본다.
  const busy = expandEvents(rows, range, ctx.tz)
    .filter((i) => !i.event.all_day)
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }));
  const slots = findFreeTime({
    start: range.start.getTime(), end: range.end.getTime(), durationMin: a.duration_min as number, busy,
    tzOffsetMin: offsetMinutes(range.start, ctx.tz),
    workStartHour: a.work_start_hour as number | undefined, workEndHour: a.work_end_hour as number | undefined,
    includeWeekends: a.include_weekends as boolean | undefined,
  });
  return {
    free_slots: slots.slice(0, PAGE_SIZE).map((s) => ({
      start: formatLocal(new Date(s.start), ctx.tz), end: formatLocal(new Date(s.end), ctx.tz), minutes: Math.round((s.end - s.start) / 60_000),
    })),
    truncated: slots.length > PAGE_SIZE,
    note: "종일 일정은 비는 시간 계산에서 제외했습니다.",
  };
}
