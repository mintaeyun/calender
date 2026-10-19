"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile, useTimezone } from "@/lib/profile";
import { useDailyWeather } from "@/features/weather/hooks";
import { ICON_EMOJI } from "@/features/weather/lib/format";
import { formatDateKo, formatTime, todayKey, zonedToUtc } from "@/lib/time";
import {
  eventsQueryOptions, useCalendars, useEventMutations, useEvents, useRecurringPayments, useTodoDeadlines,
} from "../hooks";
import { isReadOnlyEvent, LIME, SKY } from "../lib/colors";
import { diffDays, instancesByDay, nextUpcomingKey } from "../lib/days";
import { moveRange } from "../lib/move";
import { paymentDatesInRange } from "../lib/overlays";
import { rangeOfDays, shiftAnchor, viewDays, viewTitle, type ViewKind } from "../lib/range";
import type { EventFields, Scope } from "../lib/scope";
import type { EventInstance } from "../lib/recurrence";
import { Modal, ScopeDialog, btnGhost } from "./Dialogs";
import { EventDialog } from "./EventDialog";
import { MonthView, type DayMarker } from "./MonthView";
import { TimeGrid } from "./TimeGrid";
import { SearchPanel } from "./SearchPanel";

const VIEWS: [ViewKind, string][] = [["day", "일간"], ["week", "주간"], ["month", "월간"]];
const OVERLAY_KEY = "calendar.overlays";
type Overlays = { todo: boolean; pay: boolean; weather: boolean };

function readOverlays(): Overlays {
  try {
    const v = JSON.parse(localStorage.getItem(OVERLAY_KEY) ?? "null");
    if (v && typeof v.todo === "boolean" && typeof v.pay === "boolean") return { todo: v.todo, pay: v.pay, weather: v.weather !== false };
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  return { todo: true, pay: true, weather: true };
}

type Editing = { instance?: EventInstance; defaultStart?: Date } | null;
type PendingMove = { instance: EventInstance; range: { start_at: string; end_at: string } } | null;

export function CalendarScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const tz = useTimezone();
  const { data: profile } = useProfile();
  const weekStart = (profile?.week_start as "monday" | "sunday" | undefined) ?? "monday";
  const today = todayKey(tz);

  const viewParam = params.get("view");
  const view: ViewKind = viewParam === "week" || viewParam === "day" || viewParam === "month" ? viewParam : "month";
  const dateParam = params.get("date");
  const anchor = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const setUrl = useCallback(
    (next: { view?: ViewKind; date?: string }) => {
      const p = new URLSearchParams(params.toString());
      p.set("view", next.view ?? view);
      p.set("date", next.date ?? anchor);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [params, view, anchor, router, pathname],
  );

  const days = useMemo(() => viewDays(view, anchor, weekStart), [view, anchor, weekStart]);
  const range = useMemo(() => rangeOfDays(days, tz), [days, tz]);
  const { instances, rows, isLoading, error } = useEvents(range);
  const { data: calendars = [] } = useCalendars();
  const { move } = useEventMutations();

  // 이전/다음 구간 미리 불러오기 (월 전환 300ms 목표)
  useEffect(() => {
    for (const dir of [-1, 1] as const) {
      const d = viewDays(view, shiftAnchor(view, anchor, dir), weekStart);
      void qc.prefetchQuery(eventsQueryOptions(rangeOfDays(d, tz)));
    }
  }, [qc, view, anchor, weekStart, tz]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 오버레이 토글 (localStorage 는 마운트 후에만 읽어 하이드레이션 불일치를 피한다)
  const [overlays, setOverlays] = useState<Overlays>({ todo: true, pay: true, weather: true });
  useEffect(() => setOverlays(readOverlays()), []);
  const toggleOverlay = (k: keyof Overlays) =>
    setOverlays((cur) => {
      const next = { ...cur, [k]: !cur[k] };
      try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });

  const { data: todos } = useTodoDeadlines(days[0], days[days.length - 1], overlays.todo);
  const { data: payments } = useRecurringPayments(overlays.pay);
  const markers = useMemo(() => {
    const map = new Map<string, DayMarker[]>();
    const add = (d: string, m: DayMarker) => map.set(d, [...(map.get(d) ?? []), m]);
    if (overlays.todo) for (const t of todos ?? []) if (t.due_date && t.status !== "done") add(t.due_date, { id: `t${t.id}`, label: t.title, kind: "todo" });
    if (overlays.pay) {
      for (const p of payments ?? []) {
        for (const d of paymentDatesInRange({ cycle: p.cycle === "yearly" ? "yearly" : "monthly", pay_day: p.pay_day, pay_month: p.pay_month }, days[0], days[days.length - 1])) {
          add(d, { id: `p${p.id}${d}`, label: `${p.name} ${p.amount.toLocaleString("ko-KR")}`, kind: "pay" });
        }
      }
    }
    return map;
  }, [overlays, todos, payments, days]);

  const dailyWeather = useDailyWeather();
  const renderWeather = useCallback(
    (d: string) => {
      const w = overlays.weather ? dailyWeather.get(d) : undefined;
      if (!w) return null;
      const rainy = w.icon === "rain" || w.icon === "drizzle" || w.icon === "thunder" || w.icon === "snow";
      return (
        <span className="whitespace-nowrap text-[11px]" style={{ color: rainy ? "oklch(0.75 0.12 230)" : "#8d8d94" }} title={w.label}>
          <span aria-hidden>{ICON_EMOJI[w.icon]}</span> {w.text}
        </span>
      );
    },
    [overlays.weather, dailyWeather],
  );

  const nextKey = useMemo(() => nextUpcomingKey(instances, now), [instances, now]);
  const masterOf = useCallback(
    (i?: EventInstance) => (i?.masterId ? rows?.find((r) => r.id === i.masterId) ?? null : null),
    [rows],
  );

  const [editing, setEditing] = useState<Editing>(null);
  const [dayList, setDayList] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const openCreate = (dateKey: string, hour = 9) => {
    const [y, m, d] = dateKey.split("-").map(Number);
    setEditing({ defaultStart: zonedToUtc(y, m, d, hour, 0, tz) });
  };

  function commitMove(instance: EventInstance, range: { start_at: string; end_at: string }, scope?: Scope) {
    const ev = instance.event;
    const master = masterOf(instance);
    const fields: EventFields = {
      title: ev.title, ...range, all_day: ev.all_day, location: ev.location, notes: ev.notes,
      color: ev.color, calendar_id: ev.calendar_id, rrule: master?.rrule ?? ev.rrule,
    };
    setMoveError(null);
    move.mutate(
      { instance, scope, fields, timesOnly: true, tz },
      { onError: (e) => setMoveError(e instanceof Error ? e.message : "일정을 옮기지 못했습니다.") },
    );
  }

  function requestMove(instance: EventInstance, range: { start_at: string; end_at: string }) {
    if (isReadOnlyEvent(instance.event, calendars)) return;
    if (instance.recurring) setPendingMove({ instance, range });
    else commitMove(instance, range);
  }

  const title = viewTitle(view, anchor, days);
  const monthKey = anchor.slice(0, 7);
  const sub = view === "month" ? `일정 ${new Set(instances.map((i) => i.event.id)).size}개` : view === "week" ? "" : formatDateKo(anchor, tz);
  const dayInstances = dayList ? instancesByDay(instances, tz).get(dayList) ?? [] : [];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <h1 className="whitespace-nowrap font-display text-[30px] leading-[1.3]">
            {title} {sub && <span className="text-fg-subtle">{sub}</span>}
          </h1>
          <div className="flex gap-1.5">
            <button aria-label="이전" onClick={() => setUrl({ date: shiftAnchor(view, anchor, -1) })} className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface-2 text-[#d6d6da]">‹</button>
            <button aria-label="다음" onClick={() => setUrl({ date: shiftAnchor(view, anchor, 1) })} className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface-2 text-[#d6d6da]">›</button>
            <button onClick={() => setUrl({ date: today })} className="h-[38px] rounded-full border border-[#3a3a40] px-4 text-sm">오늘</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-1.5 text-[13px]">
            {([["todo", "할일 마감", LIME], ["pay", "결제일", "#d6d6da"], ["weather", "날씨", SKY]] as const).map(([k, label, c]) => (
              <button key={k} aria-pressed={overlays[k]} onClick={() => toggleOverlay(k)}
                className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2" style={{ opacity: overlays[k] ? 1 : 0.5 }}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: c }} />{label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-surface-2 p-[5px] text-sm" role="tablist">
            {VIEWS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setUrl({ view: k })}
                className="whitespace-nowrap rounded-full px-[18px] py-2" style={view === k ? { background: "#3a3a40", color: "#fff", fontWeight: 600 } : { color: "#8d8d94" }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setSearching((v) => !v)} aria-pressed={searching} className="whitespace-nowrap rounded-full border border-[#3a3a40] px-4 py-2.5 text-sm">검색</button>
          <button onClick={() => openCreate(today, Math.min(21, new Date().getHours() + 1))} className="whitespace-nowrap rounded-full bg-white px-[18px] py-2.5 text-sm font-semibold text-black">
            일정 추가 +
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-danger">일정을 불러오지 못했습니다. 새로고침해 주세요.</p>}
      {moveError && <p role="alert" className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-danger">{moveError}</p>}

      {searching && (
        <SearchPanel
          onClose={() => setSearching(false)}
          onPick={(row, key) => {
            setUrl({ date: key });
            if (!row.rrule) {
              const i: EventInstance = { key: `${row.id}@${row.start_at}`, event: row, start: new Date(row.start_at), end: new Date(row.end_at), recurring: false, masterId: null, isException: false, originalStart: null };
              setEditing({ instance: i });
            }
          }}
        />
      )}

      <div style={{ opacity: isLoading ? 0.6 : 1 }}>
        {view === "month" ? (
          <MonthView
            days={days} month={monthKey} today={today} tz={tz} weekStart={weekStart}
            instances={instances} calendars={calendars} markers={markers} nextKey={nextKey}
            onCreate={(d) => openCreate(d)}
            onOpen={(i) => setEditing({ instance: i })}
            onShowDay={setDayList}
            renderWeather={renderWeather}
            onDropOn={(i, d) => {
              const delta = diffDays(instanceDate(i, tz), d);
              if (delta !== 0) requestMove(i, moveRange(i.start, i.end, delta, 0, tz));
            }}
          />
        ) : (
          <TimeGrid
            days={days} today={today} tz={tz} instances={instances} calendars={calendars} markers={markers}
            nextKey={nextKey} now={now}
            onCreateAt={openCreate}
            onOpen={(i) => setEditing({ instance: i })}
            onChangeRange={requestMove}
            renderWeather={renderWeather}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-fg-subtle">
        {calendars.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />{c.name}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LIME }} />다음 일정</span>
        <span>G = Google 캘린더 · ↻ = 반복</span>
        <span className="ml-auto" style={{ color: SKY }}>드래그로 이동 · 아래 가장자리로 기간 조절</span>
      </div>

      {editing && (
        <EventDialog
          instance={editing.instance}
          master={masterOf(editing.instance)}
          defaultStart={editing.defaultStart}
          onDone={() => setEditing(null)}
        />
      )}

      {dayList && (
        <Modal onClose={() => setDayList(null)} width={440}>
          <h2 className="font-display text-[22px]">{formatDateKo(dayList, tz)}</h2>
          <div className="flex flex-col gap-1.5">
            {dayInstances.length === 0 && <span className="text-sm text-fg-subtle">일정이 없습니다.</span>}
            {dayInstances.map((i) => (
              <button key={i.key} onClick={() => { setDayList(null); setEditing({ instance: i }); }}
                className="flex items-center gap-3 rounded-xl bg-surface-3 px-3.5 py-2.5 text-left text-sm">
                <span className="w-24 shrink-0 text-fg-subtle">{i.event.all_day ? "종일" : `${formatTime(i.start, tz)} – ${formatTime(i.end, tz)}`}</span>
                <span className="truncate">{i.event.title}</span>
              </button>
            ))}
            {(markers.get(dayList) ?? []).map((m) => (
              <div key={m.id} className="rounded-xl border border-[#2a2a2e] px-3.5 py-2.5 text-sm text-fg-muted">{m.kind === "todo" ? "☐ 할일 마감 · " : "₩ 결제일 · "}{m.label}</div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setDayList(null)}>닫기</button>
            <button className="rounded-full bg-white px-6 py-[11px] text-sm font-bold text-black" onClick={() => { const d = dayList; setDayList(null); openCreate(d); }}>일정 추가</button>
          </div>
        </Modal>
      )}

      {pendingMove && (
        <ScopeDialog
          kind="save"
          onCancel={() => setPendingMove(null)}
          onPick={(scope) => {
            const p = pendingMove;
            setPendingMove(null);
            commitMove(p.instance, p.range, scope);
          }}
        />
      )}
    </div>
  );
}

/** 인스턴스 시작일 'YYYY-MM-DD' (사용자 시간대) */
function instanceDate(i: EventInstance, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(i.start);
}
