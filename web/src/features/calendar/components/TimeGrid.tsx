"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTime, WEEKDAYS_KO, weekdayOf, zonedParts } from "@/lib/time";
import type { CalendarRow } from "../api";
import { useGoogleTwoWay } from "@/features/google/hooks";
import { eventColor, isGoogleEvent, isReadOnlyEvent, LIME, PURPLE, readableOn } from "../lib/colors";
import { daysSpanned } from "../lib/days";
import { layoutColumns } from "../lib/layout";
import { moveRange, resizeRange, snap } from "../lib/move";
import type { EventInstance } from "../lib/recurrence";
import type { DayMarker } from "./MonthView";

const HOUR_PX = 56;
const START_HOUR = 8;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const GRID_H = HOURS.length * HOUR_PX;
const DRAG_THRESHOLD = 4;

type Props = {
  days: string[];
  today: string;
  tz: string;
  instances: EventInstance[];
  calendars: CalendarRow[];
  markers: Map<string, DayMarker[]>;
  nextKey: string | null;
  now: Date;
  onCreateAt: (dateKey: string, hour: number) => void;
  onOpen: (i: EventInstance) => void;
  /** 이동·크기 조절 결과 (CAL-5). 반복 일정이면 호출 측이 범위 선택을 거친다. */
  onChangeRange: (i: EventInstance, range: { start_at: string; end_at: string }) => void;
  renderWeather?: (dateKey: string) => ReactNode;
};

type Drag = {
  inst: EventInstance;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  active: boolean;
};

/** 분 단위(자정 기준) → 그리드 y(px). 보이는 범위 밖은 잘라낸다. */
const minToY = (min: number) => ((Math.min(Math.max(min, START_HOUR * 60), END_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_PX;

export function TimeGrid({
  days, today, tz, instances, calendars, markers, nextKey, now, onCreateAt, onOpen, onChangeRange, renderWeather,
}: Props) {
  const twoWay = useGoogleTwoWay();
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // 종일(또는 날짜 단위 막대) / 시간 일정 분리
  const allDay = instances.filter((i) => i.event.all_day);
  const timed = instances.filter((i) => !i.event.all_day);

  const colWidth = () => (colsRef.current ? colsRef.current.getBoundingClientRect().width / days.length : 1);

  function begin(e: React.PointerEvent, inst: EventInstance, mode: "move" | "resize") {
    if (isReadOnlyEvent(inst.event, calendars, twoWay)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ inst, mode, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false });
  }

  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setDrag({ ...d, dx, dy, active: d.active || Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD });
  }

  function finish() {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (!d.active) {
      onOpen(d.inst);
      return;
    }
    const minutes = snap((d.dy / HOUR_PX) * 60);
    if (d.mode === "resize") {
      if (minutes !== 0) onChangeRange(d.inst, resizeRange(d.inst.start, d.inst.end, minutes));
      return;
    }
    const dayDelta = days.length > 1 ? Math.round(d.dx / colWidth()) : 0;
    if (dayDelta !== 0 || minutes !== 0) onChangeRange(d.inst, moveRange(d.inst.start, d.inst.end, dayDelta, minutes, tz));
  }

  useEffect(() => {
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  const nowParts = zonedParts(now, tz);
  const nowMin = nowParts.hour * 60 + nowParts.minute;
  const nowKey = `${nowParts.year}-${String(nowParts.month).padStart(2, "0")}-${String(nowParts.day).padStart(2, "0")}`;
  const showNow = days.includes(nowKey) && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const template = `52px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col gap-1.5 rounded-[22px] bg-surface-sunken px-4 pb-4 pt-3.5">
      {/* 날짜 머리글 + 종일/마커 행 */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: template }}>
        <span />
        {days.map((d) => {
          const isToday = d === today;
          const wd = weekdayOf(d);
          const bars = allDay.filter((i) => daysSpanned(i, tz).includes(d));
          const marks = markers.get(d) ?? [];
          return (
            <div key={d} className="flex min-w-0 flex-col gap-1.5 px-1 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-fg-subtle">{WEEKDAYS_KO[wd]}</span>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold"
                  style={{ background: isToday ? LIME : "transparent", color: isToday ? "var(--on-accent)" : d < today ? "var(--fg-dim)" : "var(--fg)" }}
                >
                  {+d.slice(8, 10)}
                </span>
                <span className="ml-auto">{renderWeather?.(d)}</span>
              </div>
              <div className="flex min-h-[44px] flex-col gap-[3px]">
                {bars.map((i) => {
                  const bg = eventColor(i.event, calendars);
                  return (
                    <button
                      key={i.key}
                      onClick={() => onOpen(i)}
                      className="flex items-center gap-1.5 truncate rounded-md px-2 py-[3px] text-left text-[11px] font-semibold"
                      style={{ background: bg || PURPLE, color: readableOn(bg) }}
                    >
                      {isGoogleEvent(i.event, calendars) && <b>G</b>}
                      {i.event.title}
                    </button>
                  );
                })}
                {marks.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 truncate rounded-full bg-surface-3 px-2 py-[3px] text-[11px]"
                    title={m.label}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.kind === "todo" ? LIME : "var(--fg-muted)" }} />
                    <span className="truncate">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 시간 그리드 */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: template }}>
        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="text-[11px] text-fg-dim" style={{ height: HOUR_PX, transform: "translateY(-7px)" }}>
              {String(h).padStart(2, "0")}
            </div>
          ))}
          {showNow && (
            <div className="absolute left-0 bg-surface-sunken text-[11px] font-bold" style={{ top: minToY(nowMin) - 7, color: "var(--lime-ink)" }}>
              {String(nowParts.hour).padStart(2, "0")}:{String(nowParts.minute).padStart(2, "0")}
            </div>
          )}
        </div>

        <div className="relative" style={{ gridColumn: `2 / span ${days.length}` }}>
          <div ref={colsRef} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const dayTimed = timed.filter((i) => daysSpanned(i, tz).includes(d));
              // 이 날짜 안에서의 분 구간 (여러 날 걸친 일정은 이 날 범위로 자른다)
              const spans = dayTimed.map((i) => {
                const s = zonedParts(i.start, tz);
                const startsToday = `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}` === d;
                const e = zonedParts(new Date(i.end.getTime() - 1000), tz);
                const endsToday = `${e.year}-${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}` === d;
                return {
                  start: startsToday ? s.hour * 60 + s.minute : 0,
                  end: endsToday ? Math.max(e.hour * 60 + e.minute + 1, (startsToday ? s.hour * 60 + s.minute : 0) + 15) : 24 * 60,
                };
              });
              const placed = layoutColumns(spans);
              return (
                <div
                  key={d}
                  className="relative rounded-xl"
                  style={{
                    height: GRID_H,
                    background: `repeating-linear-gradient(180deg,var(--border) 0 1px,transparent 1px ${HOUR_PX}px)`,
                    backgroundColor: d === today ? "var(--surface-2)" : "transparent",
                  }}
                  onClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    onCreateAt(d, Math.min(END_HOUR - 1, START_HOUR + Math.floor(y / HOUR_PX)));
                  }}
                >
                  {dayTimed.map((inst, idx) => {
                    const { start, end } = spans[idx];
                    const { col, cols } = placed[idx];
                    const top = minToY(start);
                    const height = Math.max(minToY(end) - top, 20);
                    const bg = eventColor(inst.event, calendars);
                    const fg = readableOn(bg);
                    const isDragging = drag?.inst.key === inst.key && drag.active;
                    const ro = isReadOnlyEvent(inst.event, calendars, twoWay);
                    const dy = isDragging ? snap((drag!.dy / HOUR_PX) * 60) * (HOUR_PX / 60) : 0;
                    const dx = isDragging && drag!.mode === "move" && days.length > 1 ? Math.round(drag!.dx / colWidth()) * colWidth() : 0;
                    const short = height < 44;
                    const next = inst.key === nextKey;
                    const past = inst.end.getTime() <= now.getTime();
                    return (
                      <div
                        key={inst.key}
                        onPointerDown={(e) => begin(e, inst, "move")}
                        onPointerMove={move}
                        onPointerUp={finish}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(e) => { e.stopPropagation(); if (ro) onOpen(inst); }}
                        className="absolute flex touch-none select-none flex-col overflow-hidden rounded-[10px]"
                        style={{
                          left: `calc(${(col / cols) * 100}% + 3px)`,
                          width: `calc(${100 / cols}% - 6px)`,
                          top: top + 3 + (drag?.mode === "move" ? dy : 0),
                          height: height - 5 + (isDragging && drag!.mode === "resize" ? dy : 0),
                          transform: dx ? `translateX(${dx}px)` : undefined,
                          background: bg, color: fg, opacity: past && !isDragging ? 0.45 : 1,
                          padding: short ? "3px 8px" : "6px 8px",
                          cursor: ro ? "pointer" : isDragging ? "grabbing" : "grab",
                          zIndex: isDragging ? 5 : 1,
                          outline: next ? `1.5px solid ${LIME}` : "none",
                        }}
                      >
                        <div className="flex items-baseline gap-1">
                          <span className="flex-1 truncate text-xs font-bold">{inst.recurring && "↻ "}{inst.event.title}</span>
                          {short && <span className="whitespace-nowrap text-[10px] opacity-85">{formatTime(inst.start, tz)}</span>}
                          {isGoogleEvent(inst.event, calendars) && <b className="text-[10px] opacity-80">G</b>}
                        </div>
                        {!short && <span className="whitespace-nowrap text-[11px] opacity-85">{formatTime(inst.start, tz)} – {formatTime(inst.end, tz)}</span>}
                        {!short && inst.event.location && <span className="truncate text-[11px] opacity-80">{inst.event.location}</span>}
                        {!ro && (
                          <div
                            onPointerDown={(e) => begin(e, inst, "resize")}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                            aria-label="아래로 끌어 종료 시간 조절"
                          />
                        )}
                      </div>
                    );
                  })}
                  {d === nowKey && showNow && (
                    <div className="pointer-events-none absolute inset-x-0 h-0.5" style={{ top: minToY(nowMin), background: LIME }}>
                      <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: LIME }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
