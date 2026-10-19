"use client";

import { useMemo, useState } from "react";
import { useTimezone } from "@/lib/profile";
import { addDays, dateKey, formatDateKo, weekdayOf, WEEKDAYS_KO, zonedParts, zonedToUtc } from "@/lib/time";
import type { EventWithReminders } from "../api";
import { useCalendars, useEventMutations } from "../hooks";
import {
  allDayDates, allDayToRange, convertReminders, reminderOptions,
} from "../lib/allday";
import { EVENT_COLORS, isReadOnlyEvent, LIME } from "../lib/colors";
import {
  buildRRule, parseRRule, summarizeRRule, type EventInstance, type EventRow, type Freq, type RecurrenceSpec,
} from "../lib/recurrence";
import type { EventFields, Scope } from "../lib/scope";
import { btnDanger, btnGhost, btnPrimary, ConfirmDelete, ScopeDialog } from "./Dialogs";

type Props = {
  /** 수정할 발생. 없으면 새 일정 */
  instance?: EventInstance;
  /** 반복 시리즈의 마스터 행 (반복 일정 수정 시) */
  master?: EventRow | null;
  /** 새 일정의 기본 시작 시각 */
  defaultStart?: Date;
  onDone: () => void;
};

const field = "flex flex-col gap-0.5 rounded-[14px] bg-[var(--surface-3)] px-3.5 py-3";
const hint = "text-xs text-fg-subtle";
const inputCls = "bg-transparent text-[15px] text-fg outline-none [color-scheme:dark] disabled:opacity-60";
const FREQS: [Freq | "none", string][] = [["none", "안 함"], ["daily", "매일"], ["weekly", "매주"], ["monthly", "매월"], ["yearly", "매년"]];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일 표시 순서 (값은 0=일)

const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (d: Date | string, tz: string) => {
  const p = zonedParts(d, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
const toUtc = (date: string, time: string, tz: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return zonedToUtc(y, m, d, hh, mm, tz);
};

function nextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function EventForm({ instance, master, defaultStart, onDone }: Props) {
  const tz = useTimezone();
  const { data: calendars = [] } = useCalendars();
  const { save, remove } = useEventMutations();
  const editing = Boolean(instance);
  const ev = instance?.event;
  const readOnly = ev ? isReadOnlyEvent(ev, calendars) : false;
  const seriesRule = master?.rrule ?? ev?.rrule ?? null;
  const parsedRule = useMemo(() => parseRRule(seriesRule, tz), [seriesRule, tz]);

  const init = useMemo(() => {
    const start = instance?.start ?? defaultStart ?? nextHour();
    const end = instance?.end ?? new Date(start.getTime() + 3600_000);
    const allDay = ev?.all_day ?? false;
    const dates = allDay && instance
      ? allDayDates(instance.start.toISOString(), instance.end.toISOString(), tz)
      : { startDate: dateKey(start, tz), lastDate: dateKey(end, tz) };
    return { start, end, allDay, ...dates };
  }, [instance, defaultStart, ev, tz]);

  const [title, setTitle] = useState(ev?.title ?? "");
  const [allDay, setAllDay] = useState(init.allDay);
  const [sDate, setSDate] = useState(init.startDate);
  const [sTime, setSTime] = useState(timeOf(init.start, tz));
  const [eDate, setEDate] = useState(init.lastDate);
  const [eTime, setETime] = useState(timeOf(init.end, tz));
  const [location, setLocation] = useState(ev?.location ?? "");
  const [notes, setNotes] = useState(ev?.notes ?? "");
  const [color, setColor] = useState<string | null>(ev?.color ?? null);
  const [calendarId, setCalendarId] = useState<string | null>(ev?.calendar_id ?? null);
  const [reminders, setReminders] = useState<number[]>(
    ((ev as EventWithReminders | undefined)?.event_reminders ?? []).map((r) => r.minutes_before),
  );
  const [freq, setFreq] = useState<Freq | "none">(parsedRule?.spec.freq ?? "none");
  const [interval] = useState(parsedRule?.spec.interval ?? 1);
  const [byDays, setByDays] = useState<number[]>(parsedRule?.spec.byDays ?? []);
  const [endType, setEndType] = useState<"never" | "until" | "count">(parsedRule?.spec.end.type ?? "never");
  const [endDate, setEndDate] = useState(parsedRule?.spec.end.type === "until" ? parsedRule.spec.end.date : addDays(init.startDate, 90));
  const [endCount, setEndCount] = useState(parsedRule?.spec.end.type === "count" ? parsedRule.spec.end.count : 10);

  const [error, setError] = useState<string | null>(null);
  const [askScope, setAskScope] = useState<null | { kind: "save" | "delete" }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = save.isPending || remove.isPending;
  const unsupportedRule = Boolean(seriesRule) && parsedRule?.supported === false;
  const recurringEdit = Boolean(instance?.recurring);

  const effectiveCalendar = calendarId ?? calendars.find((c) => c.name === "개인")?.id ?? calendars[0]?.id ?? null;

  function toggleAllDay(next: boolean) {
    setAllDay(next);
    setReminders((r) => convertReminders(r, next));
    if (!next && eDate < sDate) setEDate(sDate);
  }

  function currentSpec(): RecurrenceSpec | null {
    if (freq === "none") return null;
    const days = freq === "weekly" ? (byDays.length ? byDays : [weekdayOf(sDate)]) : [];
    return {
      freq, interval, byDays: days,
      end: endType === "never" ? { type: "never" } : endType === "until" ? { type: "until", date: endDate } : { type: "count", count: endCount },
    };
  }

  function build(): EventFields | string {
    if (!title.trim()) return "제목을 입력해 주세요.";
    let range: { start_at: string; end_at: string };
    if (allDay) {
      if (eDate < sDate) return "종료일은 시작일보다 빠를 수 없습니다.";
      range = allDayToRange(sDate, eDate, tz);
    } else {
      const s = toUtc(sDate, sTime, tz);
      const e = toUtc(eDate, eTime, tz);
      if (e.getTime() < s.getTime()) return "종료 시각은 시작 시각보다 빠를 수 없습니다.";
      range = { start_at: s.toISOString(), end_at: e.toISOString() };
    }
    if (endType === "count" && freq !== "none" && !(endCount >= 1)) return "반복 횟수는 1 이상이어야 합니다.";
    if (endType === "until" && freq !== "none" && endDate < sDate) return "반복 종료일은 시작일 이후여야 합니다.";

    // 규칙을 바꾸지 않았다면 원래 문자열을 그대로 써서 구글 RRULE 등이 변형되지 않게 한다.
    const spec = currentSpec();
    let rrule = buildRRule(spec, tz);
    if (seriesRule && parsedRule) {
      const same = spec && JSON.stringify(spec) === JSON.stringify(parsedRule.spec);
      if (unsupportedRule || same) rrule = seriesRule;
    }
    return {
      title: title.trim(), ...range, all_day: allDay,
      location: location.trim() || null, notes: notes.trim() || null,
      color, calendar_id: effectiveCalendar, rrule,
    };
  }

  async function doSave(scope?: Scope) {
    const fields = build();
    if (typeof fields === "string") { setError(fields); setAskScope(null); return; }
    setError(null);
    try {
      await save.mutateAsync({ instance, scope, fields, reminders, tz });
      onDone();
    } catch (e) {
      setAskScope(null);
      setError(e instanceof Error ? e.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function onSubmit() {
    const fields = build();
    if (typeof fields === "string") return setError(fields);
    setError(null);
    if (recurringEdit) setAskScope({ kind: "save" });
    else void doSave();
  }

  async function doDelete(scope?: Scope) {
    if (!instance) return;
    try {
      await remove.mutateAsync({ instance, scope, tz });
      onDone();
    } catch (e) {
      setAskScope(null);
      setConfirmDelete(false);
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  const summary = freq === "none" ? "반복 안 함" : summarizeRRule(buildRRule(currentSpec(), tz), toUtc(sDate, allDay ? "00:00" : sTime, tz), tz);
  const toggleReminder = (m: number) => setReminders((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m]));
  const lockRepeat = readOnly || unsupportedRule;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {readOnly && (
        <p className="rounded-xl bg-surface-3 px-4 py-3 text-fg-muted">Google 캘린더에서 가져온 일정은 여기서 수정할 수 없습니다.</p>
      )}

      <input
        autoFocus={!editing}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={readOnly}
        placeholder="제목"
        aria-label="제목"
        className="border-b border-surface-4 bg-transparent pb-3 text-2xl font-semibold text-fg outline-none placeholder:text-[var(--fg-faint)]"
      />

      <button
        type="button"
        disabled={readOnly}
        onClick={() => toggleAllDay(!allDay)}
        className={`${field} cursor-pointer flex-row items-center justify-between text-left`}
        aria-pressed={allDay}
      >
        <span className="flex flex-col gap-0.5">
          <span>종일</span>
          <span className={hint}>{allDay ? "시간 없이 날짜만 · 여러 날 가능" : "시간을 지정하는 일정"}</span>
        </span>
        <span className="relative inline-block h-6 w-11 rounded-full" style={{ background: allDay ? LIME : "var(--surface-5)" }}>
          <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-fg" style={{ left: allDay ? 23 : 3 }} />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2.5">
        <label className={field}>
          <span className={hint}>{allDay ? "시작일" : "시작"}</span>
          <span className="flex flex-wrap gap-2">
            <input type="date" value={sDate} disabled={readOnly} aria-label="시작 날짜" className={inputCls}
              onChange={(e) => { setSDate(e.target.value); if (eDate < e.target.value) setEDate(e.target.value); }} />
            {!allDay && <input type="time" value={sTime} disabled={readOnly} aria-label="시작 시각" className={inputCls} onChange={(e) => setSTime(e.target.value)} />}
          </span>
        </label>
        <label className={field}>
          <span className={hint}>{allDay ? "종료일" : "종료"}</span>
          <span className="flex flex-wrap gap-2">
            <input type="date" value={eDate} min={sDate} disabled={readOnly} aria-label="종료 날짜" className={inputCls} onChange={(e) => setEDate(e.target.value)} />
            {!allDay && <input type="time" value={eTime} disabled={readOnly} aria-label="종료 시각" className={inputCls} onChange={(e) => setETime(e.target.value)} />}
          </span>
        </label>
      </div>

      <label className={field}>
        <span className={hint}>장소</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={readOnly} className={inputCls} />
      </label>
      <label className={field}>
        <span className={hint}>메모</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={2} className={`${inputCls} resize-none`} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-fg-subtle">알림</span>
        <div className="flex flex-wrap gap-1.5">
          {reminderOptions(allDay).map((o) => {
            const on = reminders.includes(o.minutes);
            return (
              <button key={o.minutes} type="button" disabled={readOnly} aria-pressed={on} onClick={() => toggleReminder(o.minutes)}
                className="rounded-full px-3.5 py-[7px]" style={on ? { background: LIME, color: "var(--bg)", fontWeight: 600 } : { background: "var(--surface-3)" }}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl bg-[var(--surface-2)] p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-fg-subtle">반복</span>
          <span className="text-xs" style={{ color: "var(--lime-ink)" }}>{summary}</span>
        </div>
        {unsupportedRule ? (
          <span className="text-xs text-fg-subtle">이 반복 규칙(Google 등)은 앱에서 편집할 수 없어 그대로 유지됩니다.</span>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {FREQS.map(([k, label]) => (
                <button key={k} type="button" disabled={lockRepeat} onClick={() => setFreq(k)} aria-pressed={freq === k}
                  className="rounded-full px-3.5 py-[7px]"
                  style={freq === k ? { background: "var(--fg)", color: "var(--bg)", fontWeight: 600 } : { background: "var(--surface-3)", color: "var(--fg-muted)" }}>
                  {label}
                </button>
              ))}
            </div>
            {freq === "weekly" && (
              <div className="flex gap-1.5">
                {DAY_ORDER.map((d) => {
                  const on = (byDays.length ? byDays : [weekdayOf(sDate)]).includes(d);
                  return (
                    <button key={d} type="button" disabled={lockRepeat} aria-pressed={on} aria-label={`${WEEKDAYS_KO[d]}요일`}
                      onClick={() => setByDays((cur) => {
                        const base = cur.length ? cur : [weekdayOf(sDate)];
                        return base.includes(d) ? base.filter((x) => x !== d) : [...base, d];
                      })}
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={on ? { background: LIME, color: "var(--on-accent)", fontWeight: 700 } : { background: "var(--surface-3)", color: "var(--fg-muted)" }}>
                      {WEEKDAYS_KO[d]}
                    </button>
                  );
                })}
              </div>
            )}
            {freq !== "none" && (
              <div className="flex flex-wrap items-center gap-2.5 border-t border-surface-4 pt-2.5">
                <span className="text-[13px] text-fg-subtle">종료</span>
                <div className="flex rounded-full bg-[var(--surface-3)] p-[5px]">
                  {([["never", "없음"], ["until", "날짜"], ["count", "횟수"]] as const).map(([k, label]) => (
                    <button key={k} type="button" disabled={lockRepeat} onClick={() => setEndType(k)}
                      className="rounded-full px-3.5 py-1.5" style={endType === k ? { background: "var(--surface-5)", color: "var(--fg)", fontWeight: 600 } : { color: "var(--fg-subtle)" }}>
                      {label}
                    </button>
                  ))}
                </div>
                {endType === "until" && <input type="date" value={endDate} min={sDate} disabled={lockRepeat} aria-label="반복 종료일" className={`${inputCls} ml-auto rounded-xl bg-[var(--surface-3)] px-3 py-2`} onChange={(e) => setEndDate(e.target.value)} />}
                {endType === "count" && (
                  <span className="ml-auto flex items-center gap-1.5 rounded-xl bg-[var(--surface-3)] px-3 py-2">
                    <input type="number" min={1} max={999} value={endCount} disabled={lockRepeat} aria-label="반복 횟수" className={`${inputCls} w-14`} onChange={(e) => setEndCount(Number(e.target.value))} />회
                  </span>
                )}
              </div>
            )}
          </>
        )}
        {recurringEdit && <span className="text-xs text-fg-dim">저장할 때 &quot;이번만 / 이후 전체 / 전체&quot; 중에서 선택합니다.</span>}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-fg-subtle">분류</span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {calendars.map((c) => (
            <button key={c.id} type="button" disabled={readOnly} aria-pressed={effectiveCalendar === c.id} onClick={() => setCalendarId(c.id)}
              className="flex items-center gap-[7px] rounded-full px-3.5 py-[7px]"
              style={effectiveCalendar === c.id ? { background: "var(--surface-5)", color: "var(--fg)" } : { background: "var(--surface-3)", color: "var(--fg-muted)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-fg-subtle">색상</span>
        <div className="flex gap-2">
          {EVENT_COLORS.map((c) => (
            <button key={c.label} type="button" disabled={readOnly} title={c.label} aria-label={c.label} aria-pressed={color === c.value} onClick={() => setColor(c.value)}
              className="h-6 w-6 rounded-full"
              style={{ background: c.value ?? "transparent", border: c.value ? "none" : "1.5px dashed var(--fg-dim)", outline: color === c.value ? "2px solid #fff" : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {editing && !readOnly && (
            <button type="button" disabled={busy} className={btnDanger}
              onClick={() => (recurringEdit ? setAskScope({ kind: "delete" }) : setConfirmDelete(true))}>
              삭제
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} disabled={busy} className={btnGhost}>{readOnly ? "닫기" : "취소"}</button>
          {!readOnly && <button type="button" onClick={onSubmit} disabled={busy} className={btnPrimary}>{save.isPending ? "저장 중…" : "저장"}</button>}
        </div>
      </div>

      {editing && ev && (
        <span className="text-xs text-fg-dim">{formatDateKo(init.start, tz)} 일정 · 삭제한 일정은 30일 뒤 영구 삭제됩니다</span>
      )}

      {askScope && (
        <ScopeDialog
          kind={askScope.kind}
          busy={busy}
          onCancel={() => setAskScope(null)}
          onPick={(s) => (askScope.kind === "save" ? doSave(s) : doDelete(s))}
        />
      )}
      {confirmDelete && <ConfirmDelete title={ev?.title ?? ""} busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => doDelete()} />}
    </div>
  );
}
