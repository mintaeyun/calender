"use client";

import { useState, type ReactNode } from "react";
import { formatTime, WEEKDAYS_KO, weekdayOf } from "@/lib/time";
import type { CalendarRow } from "../api";
import { eventColor, isGoogleEvent, isReadOnlyEvent, LIME, readableOn } from "../lib/colors";
import { instancesByDay } from "../lib/days";
import type { EventInstance } from "../lib/recurrence";
import type { WeekStart } from "../lib/range";

export type DayMarker = { id: string; label: string; kind: "todo" | "pay" };

type Props = {
  days: string[];
  /** 현재 달 'YYYY-MM' (다른 달 칸은 흐리게) */
  month: string;
  today: string;
  tz: string;
  weekStart: WeekStart;
  instances: EventInstance[];
  calendars: CalendarRow[];
  markers: Map<string, DayMarker[]>;
  nextKey: string | null;
  onCreate: (dateKey: string) => void;
  onOpen: (i: EventInstance) => void;
  onShowDay: (dateKey: string) => void;
  /** 날짜 칸으로 드래그해 이동 (CAL-5) */
  onDropOn: (i: EventInstance, dateKey: string) => void;
  /** 날씨 슬롯 (CAL-10): 05 의 useWeather 가 준비되면 채운다 */
  renderWeather?: (dateKey: string) => ReactNode;
};

const MAX_VISIBLE = 3;

export function MonthView({
  days, month, today, tz, weekStart, instances, calendars, markers, nextKey,
  onCreate, onOpen, onShowDay, onDropOn, renderWeather,
}: Props) {
  const byDay = instancesByDay(instances, tz);
  const [dragging, setDragging] = useState<EventInstance | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const order = weekStart === "monday" ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  return (
    <div className="flex flex-col gap-2 rounded-[22px] bg-[#111113] px-4 pb-4 pt-3.5">
      <div className="grid grid-cols-7 gap-1.5 px-2 text-[13px] text-fg-subtle">
        {order.map((d) => <span key={d}>{WEEKDAYS_KO[d]}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          const evs = byDay.get(d) ?? [];
          const marks = markers.get(d) ?? [];
          const total = evs.length + marks.length;
          const shown = evs.slice(0, MAX_VISIBLE);
          const room = MAX_VISIBLE - shown.length;
          const shownMarks = room > 0 ? marks.slice(0, room) : [];
          const hidden = total - shown.length - shownMarks.length;
          const wd = weekdayOf(d);
          return (
            <div
              key={d}
              onClick={() => onCreate(d)}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(d); } }}
              onDragLeave={() => setOver((cur) => (cur === d ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) onDropOn(dragging, d);
                setDragging(null);
              }}
              className="flex min-h-[118px] min-w-0 cursor-pointer flex-col gap-1 rounded-xl p-2"
              style={{
                background: isToday ? "#1c1c20" : "#161618",
                border: over === d ? `1px dashed ${LIME}` : isToday ? `1px solid ${LIME}` : "1px solid transparent",
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: isToday ? LIME : "transparent", color: isToday ? "#0b0b0c" : wd === 0 ? "oklch(0.75 0.14 25)" : "#f2f2f3" }}
                >
                  {+d.slice(8, 10)}
                </span>
                {renderWeather?.(d)}
              </div>

              {shown.map((i) => {
                const bg = eventColor(i.event, calendars);
                const fg = readableOn(bg);
                const readOnly = isReadOnlyEvent(i.event, calendars);
                const next = i.key === nextKey;
                return (
                  <div
                    key={i.key}
                    draggable={!readOnly}
                    onDragStart={(e) => { e.stopPropagation(); setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={(e) => { e.stopPropagation(); onOpen(i); }}
                    title={i.event.title}
                    className="truncate rounded-md px-1.5 py-0.5 text-[11px]"
                    style={{ background: bg, color: fg, outline: next ? `1.5px solid ${LIME}` : "none", outlineOffset: 1 }}
                  >
                    {isGoogleEvent(i.event, calendars) && <b className="mr-1 opacity-80">G</b>}
                    {i.recurring && <span className="mr-1 opacity-80" aria-label="반복">↻</span>}
                    {!i.event.all_day && <span className="mr-1 opacity-85">{formatTime(i.start, tz)}</span>}
                    {i.event.title}
                  </div>
                );
              })}

              {shownMarks.map((m) => (
                <div
                  key={m.id}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate rounded-md border px-1.5 py-0.5 text-[11px]"
                  style={m.kind === "todo" ? { borderColor: LIME, color: LIME } : { borderColor: "#3a3a40", color: "#d6d6da" }}
                  title={m.label}
                >
                  {m.kind === "todo" ? "☐ " : "₩ "}{m.label}
                </div>
              ))}

              {hidden > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onShowDay(d); }}
                  className="pl-0.5 text-left text-[11px] text-fg-subtle hover:text-fg"
                >
                  +{hidden}개
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
