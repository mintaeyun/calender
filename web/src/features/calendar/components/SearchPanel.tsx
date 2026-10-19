"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTimezone } from "@/lib/profile";
import { dateKey, endOfDayUtc, formatDateKo, formatTime, startOfDayUtc } from "@/lib/time";
import { allDayDates } from "../lib/allday";
import { searchEvents, type EventWithReminders } from "../api";
import { useCalendars } from "../hooks";
import { btnGhost } from "./Dialogs";

type Props = {
  onClose: () => void;
  /** 결과 선택: 해당 일정의 날짜로 이동 */
  onPick: (row: EventWithReminders, dateKey: string) => void;
};

/** 일정 검색 (CAL-9): 제목·메모·장소, 기간, 분류 필터. */
export function SearchPanel({ onClose, onPick }: Props) {
  const tz = useTimezone();
  const { data: calendars = [] } = useCalendars();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [calendarId, setCalendarId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const q = useQuery({
    queryKey: ["events", "search", debounced, from, to, calendarId, tz],
    enabled: debounced.length > 0,
    queryFn: () =>
      searchEvents({
        query: debounced,
        start: from ? startOfDayUtc(from, tz) : undefined,
        end: to ? endOfDayUtc(to, tz) : undefined,
        calendarId: calendarId || undefined,
      }),
  });

  const input = "rounded-xl bg-surface-3 px-3 py-2 text-sm text-fg outline-none [color-scheme:dark]";
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-surface-sunken p-4" aria-label="일정 검색">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="제목 · 메모 · 장소 검색"
          aria-label="검색어"
          className={`${input} min-w-[200px] flex-1`}
        />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="검색 시작일" className={input} />
        <span className="text-fg-subtle">~</span>
        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="검색 종료일" className={input} />
        <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} aria-label="분류" className={input}>
          <option value="">모든 분류</option>
          {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={onClose} className={btnGhost}>닫기</button>
      </div>

      {debounced === "" && <span className="text-sm text-fg-subtle">검색어를 입력하세요.</span>}
      {q.isLoading && <span className="text-sm text-fg-subtle">검색 중…</span>}
      {q.isError && <span role="alert" className="text-sm text-danger-ink">검색하지 못했습니다.</span>}
      {q.data && q.data.length === 0 && <span className="text-sm text-fg-subtle">결과가 없습니다.</span>}
      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {q.data?.map((r) => {
          const key = r.all_day ? allDayDates(r.start_at, r.end_at, tz).startDate : dateKey(r.start_at, tz);
          return (
            <li key={r.id}>
              <button onClick={() => onPick(r, key)} className="flex w-full items-center gap-3 rounded-xl bg-surface-3 px-3.5 py-2.5 text-left text-sm">
                <span className="w-36 shrink-0 text-fg-subtle">
                  {formatDateKo(key, tz)} {r.all_day ? "종일" : formatTime(r.start_at, tz)}
                </span>
                <span className="truncate">{r.rrule && "↻ "}{r.title}</span>
                {r.location && <span className="ml-auto truncate text-fg-subtle">{r.location}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
