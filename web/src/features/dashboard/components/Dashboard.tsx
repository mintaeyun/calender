"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useProfile, useTimezone } from "@/lib/profile";
import { addDays, endOfDayUtc, startOfDayUtc, todayKey, WEEKDAYS_KO, weekdayOf, zonedParts } from "@/lib/time";
import { useQuickAdd } from "@/components/layout/QuickAdd";
import { useEvents } from "@/features/calendar/hooks";
import { useTodos, useToggleDone } from "@/features/todo/hooks";
import { dueLabel } from "@/features/todo/lib/due";
import { useAccounts, useBudgetUsage, useCategories, useTransactions } from "@/features/ledger/hooks";
import { monthRange } from "@/features/ledger/api";
import { formatSigned, formatWon } from "@/features/ledger/lib/money";
import { daysLeftInMonth } from "@/features/ledger/lib/month";
import { monthOverMonth } from "@/features/ledger/lib/stats";
import { WeatherBadge } from "@/features/weather/components/WeatherBadge";
import { HourlyForecast } from "@/features/weather/components/HourlyForecast";
import {
  classifyToday, greeting, prevMonthOf, previousMonthSamePeriod, remainingLabel, spendingBar, todayTodos,
  type DayEvent,
} from "../lib/dashboard";
import { binLabel, busiestDay, DENSITY_BINS, weekDensity, weekStartOf } from "../lib/density";
import { topCategories, weekSentence, weekTodoStats } from "../lib/weekly";

const timeFmt = (d: Date, tz: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** 1분마다 갱신되는 현재 시각 ('다음 일정까지 남은 시간' 등) */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** 위젯 공통 틀: 한 위젯이 실패해도 나머지는 그대로 보인다(스켈레톤·오류 상태 포함). */
function Panel({ title, right, state, children }: { title: string; right?: ReactNode; state: "loading" | "error" | "ok"; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-surface p-5" aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {right}
      </div>
      {state === "loading" ? (
        <div className="flex animate-pulse flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-5 rounded bg-surface-3" />)}
        </div>
      ) : state === "error" ? (
        <p role="alert" className="text-sm text-danger-ink">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      ) : children}
    </section>
  );
}

const linkChip = "rounded-full bg-surface-3 px-2.5 py-1 text-[13px] text-fg-muted hover:no-underline";

export function Dashboard() {
  const tz = useTimezone();
  const now = useNow();
  const { openQuick } = useQuickAdd();
  const hour = zonedParts(now, tz).hour;
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, month: "long", day: "numeric", weekday: "long" }).format(now);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[38px] leading-[1.2]">
          {greeting(hour)}, <span className="whitespace-nowrap text-fg-subtle">{dateLabel}</span>
        </h1>
        <WeatherBadge />
      </div>

      <Spending onQuick={openQuick} />
      <HourlyForecast />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-3">
        <TodayEvents now={now} />
        <TodayTodos />
        <RecentTransactions />
        <WeekDensity />
        <TopCategories />
      </div>

      <WeekSummary />
    </div>
  );
}

// ── 이번 달 지출 · 예산 (DASH-3) ─────────────────────────────
function Spending({ onQuick }: { onQuick: (k: "tx" | "ev" | "todo") => void }) {
  const tz = useTimezone();
  const today = todayKey(tz);
  const month = today.slice(0, 7);
  const prev = prevMonthOf(month);
  const day = Number(today.slice(8, 10));
  const cur = useTransactions(monthRange(month));
  const prevTx = useTransactions(monthRange(prev));
  const usage = useBudgetUsage(month);
  const accounts = useAccounts();
  const cats = useCategories(undefined, true);

  const calc = useMemo(() => {
    if (!cur.data) return null;
    const exp = cur.data.filter((t) => t.type === "expense");
    const total = exp.reduce((s, t) => s + t.amount, 0);
    const byCat = new Map<string, number>();
    for (const t of exp) {
      const name = cats.data?.find((c) => c.id === t.category_id)?.name ?? "미분류";
      byCat.set(name, (byCat.get(name) ?? 0) + t.amount);
    }
    const prevSame = prevTx.data
      ? previousMonthSamePeriod(prevTx.data.filter((t) => t.type === "expense").map((t) => ({ date: t.date, amount: t.amount })), prev, day)
      : null;
    const totalBudget = usage.data?.find((u) => u.category_id === null)?.budget ?? null;
    return { total, byCat: [...byCat].map(([name, amount]) => ({ name, amount })), diff: prevSame == null ? null : monthOverMonth(total, prevSame), totalBudget };
  }, [cur.data, prevTx.data, usage.data, cats.data, prev, day]);

  const bar = calc ? spendingBar(calc.byCat, calc.total, calc.totalBudget) : null;
  const balance = accounts.data?.reduce((s, a) => s + a.balance, 0);
  const daysLeft = daysLeftInMonth(month, today);

  return (
    <div className="flex flex-wrap gap-7">
      <div className="flex w-[330px] max-w-full flex-col gap-2.5">
        <div className="text-[15px] text-fg-muted">{Number(month.slice(5, 7))}월 지출</div>
        {cur.isError ? <p role="alert" className="text-sm text-danger-ink">지출을 불러오지 못했어요.</p> : (
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[52px] font-bold leading-none tracking-tight">{calc ? formatWon(calc.total) : "…"}</span>
            <span className="text-[30px] font-semibold text-fg-subtle">원</span>
            {calc?.diff?.pct != null && (
              <span className={`text-[13px] ${calc.diff.pct > 0 ? "text-danger-ink" : "text-lime-ink"}`} title="전월 같은 기간 대비">
                {calc.diff.pct > 0 ? "+" : ""}{calc.diff.pct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        <div className="text-sm text-fg-muted">
          {bar?.remaining != null && <>남은 예산 <b className={bar.remaining < 0 ? "text-danger-ink" : "text-fg"}>{formatWon(bar.remaining)}원</b>{" · "}</>}
          {balance != null && <>잔액 {formatWon(balance)}원</>}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button onClick={() => onQuick("tx")} className="rounded-full bg-fg px-[18px] py-[11px] text-sm font-semibold text-bg">지출 추가 ↓</button>
          <button onClick={() => onQuick("ev")} className="rounded-full bg-fg px-[18px] py-[11px] text-sm font-semibold text-bg">일정 추가 +</button>
          <button onClick={() => onQuick("todo")} className="rounded-full border border-border-strong px-[18px] py-[11px] text-sm">할일 +</button>
        </div>
      </div>

      <div className="flex min-w-[280px] flex-1 flex-col gap-2">
        {bar && bar.parts.length > 0 ? (
          <>
            <div className="flex h-[88px] w-full overflow-hidden rounded-xl" role="img"
              aria-label={bar.parts.map((p) => `${p.name} ${Math.round(p.ratio * 100)}%`).join(", ")}>
              {bar.parts.map((p, i) => (
                <div key={p.name} style={{ flexGrow: p.amount, background: `oklch(${0.55 - i * 0.07} 0.2 290)` }} className="flex min-w-0 flex-col justify-end border-r border-bg px-3 py-2">
                  <span className="truncate text-xs font-semibold">{formatWon(p.amount)}</span>
                  <span className="truncate text-xs text-white/80">{Math.round(p.ratio * 100)}% {p.name}</span>
                </div>
              ))}
              {bar.remaining != null && bar.remaining > 0 && (
                <div style={{ flexGrow: bar.remaining }} className="flex min-w-0 flex-col justify-end border border-dashed border-border-strong px-3 py-2 text-fg-subtle">
                  <span className="truncate text-xs font-semibold">{formatWon(bar.remaining)}</span>
                  <span className="truncate text-xs">남은 예산 · 일 {formatWon(Math.floor(bar.remaining / Math.max(daysLeft, 1)))}원</span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-[13px] text-fg-muted">
              <span>{Number(month.slice(5, 7))}월 1일</span>
              {bar.usedRatio != null && <span>예산 {formatWon(calc!.totalBudget!)}원 중 {(bar.usedRatio * 100).toFixed(1)}%{bar.usedRatio >= 0.8 && " · 80% 알림선 도달"}</span>}
              <span>{Number(month.slice(5, 7))}월 말</span>
            </div>
          </>
        ) : (
          <p className="my-auto text-sm text-fg-subtle">{cur.isLoading ? "불러오는 중…" : "이번 달 지출이 아직 없어요"}</p>
        )}
      </div>
    </div>
  );
}

// ── 오늘의 일정 (DASH-1) ────────────────────────────────────
function TodayEvents({ now }: { now: Date }) {
  const tz = useTimezone();
  const today = todayKey(tz);
  const range = useMemo(() => ({ start: startOfDayUtc(today, tz), end: endOfDayUtc(today, tz) }), [today, tz]);
  const { instances, isLoading, error } = useEvents(range);
  const view = useMemo(() => {
    const evs: DayEvent[] = instances.map((i) => ({ key: i.key, title: i.event.title, start: i.start, end: i.end, allDay: i.event.all_day, location: i.event.location }));
    return classifyToday(evs, now);
  }, [instances, now]);
  const state = error ? "error" : isLoading ? "loading" : "ok";
  const empty = !view.allDay.length && !view.past.length && !view.next && !view.later.length;

  return (
    <Panel title="오늘의 일정" state={state} right={<Link href="/calendar" aria-label="캘린더 열기" className={linkChip}>↗</Link>}>
      {empty ? <p className="text-sm text-fg-subtle">오늘은 일정이 없어요</p> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {view.allDay.map((e) => <li key={e.key} className="py-1.5 text-fg-muted">종일 · {e.title}</li>)}
          {view.past.map((e) => (
            <li key={e.key} className="flex gap-3 py-1.5 text-fg-subtle"><span className="w-11">{timeFmt(e.start, tz)}</span><span className="truncate">{e.title}</span></li>
          ))}
          {view.next && (
            <li className="flex flex-col gap-1 rounded-[14px] bg-lime px-3.5 py-3 text-on-accent">
              <span className="text-xs font-bold">{view.next.start <= now ? "진행 중" : `다음 · ${remainingLabel(view.next.start.getTime() - now.getTime())}`}</span>
              <span className="text-base font-bold">{timeFmt(view.next.start, tz)} {view.next.title}</span>
              {view.next.location && <span className="text-xs">{view.next.location}</span>}
            </li>
          )}
          {view.later.map((e) => (
            <li key={e.key} className="flex gap-3 py-1.5"><span className="w-11 text-fg-muted">{timeFmt(e.start, tz)}</span><span className="truncate">{e.title}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── 오늘의 할일 (DASH-2) ────────────────────────────────────
function TodayTodos() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const todos = useTodos();
  const toggle = useToggleDone();
  const view = useMemo(() => todayTodos(todos.data ?? [], today), [todos.data, today]);
  const state = todos.isError ? "error" : todos.isLoading ? "loading" : "ok";

  return (
    <Panel title="오늘의 할일" state={state} right={<Link href="/todos" className={linkChip}>{view.done} / {view.total}</Link>}>
      {view.total === 0 ? <p className="text-sm text-fg-subtle">오늘 마감인 할일이 없어요</p> : (
        <ul className="flex flex-col">
          {view.items.map((t) => {
            const done = t.status === "done";
            const over = !done && !!t.due_date && t.due_date < today;
            return (
              <li key={t.id} className="flex items-center gap-2.5 border-b border-border py-[9px] last:border-0">
                <button role="checkbox" aria-checked={done} aria-label={`${t.title} ${done ? "완료 취소" : "완료"}`}
                  onClick={() => toggle.mutate(t)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] ${done ? "border-lime text-lime-ink" : over ? "border-danger" : "border-fg-muted"}`}>
                  {done ? "✓" : ""}
                </button>
                <span className={`flex-1 truncate text-sm ${done ? "text-fg-subtle line-through" : ""}`}>{t.title}</span>
                <span className={`text-xs ${over ? "text-danger-ink" : "text-fg-subtle"}`}>{dueLabel(t.due_date, today)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── 최근 거래 ──────────────────────────────────────────────
function RecentTransactions() {
  const tz = useTimezone();
  const month = todayKey(tz).slice(0, 7);
  const tx = useTransactions(monthRange(month));
  const cats = useCategories(undefined, true);
  const rows = (tx.data ?? []).slice(0, 5);
  const state = tx.isError ? "error" : tx.isLoading ? "loading" : "ok";

  return (
    <Panel title="최근 거래" state={state} right={<Link href="/ledger" className="text-xs text-fg-subtle hover:no-underline">전체 →</Link>}>
      {rows.length === 0 ? <p className="text-sm text-fg-subtle">이번 달 거래가 없어요</p> : (
        <ul className="flex flex-col gap-1">
          {rows.map((t) => {
            const cat = cats.data?.find((c) => c.id === t.category_id);
            return (
              <li key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 py-[7px] text-sm">
                <span className="truncate">{t.memo || (t.type === "transfer" ? "이체" : cat?.name ?? "거래")}</span>
                <span className="flex items-center gap-[5px] rounded-full bg-surface-3 px-2.5 py-[3px] text-xs">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat?.color ?? "var(--fg-subtle)" }} />{t.type === "transfer" ? "이체" : cat?.name ?? "미분류"}
                </span>
                <span className={`w-20 text-right font-semibold ${t.type === "income" ? "text-lime-ink" : ""}`}>{formatSigned(t.amount, t.type)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── 이번 주 일정 밀도 ───────────────────────────────────────
// 보라 비율로 단계 표현: 라이트/다크 모두 면(surface-3) 위에서 구분된다.
const HEAT = ["var(--surface-3)", ...[25, 45, 70, 100].map((p) => `color-mix(in oklch, var(--purple) ${p}%, var(--surface-3))`)];

function WeekDensity() {
  const tz = useTimezone();
  const weekStart = useProfile().data?.week_start === "sunday" ? "sunday" : "monday";
  const today = todayKey(tz);
  const first = weekStartOf(today, weekStart);
  const range = useMemo(() => ({ start: startOfDayUtc(first, tz), end: endOfDayUtc(addDays(first, 6), tz) }), [first, tz]);
  const { instances, isLoading, error } = useEvents(range);
  const { days, matrix } = useMemo(
    () => weekDensity(instances.map((i) => ({ start: i.start, end: i.end, allDay: i.event.all_day })), first, tz),
    [instances, first, tz],
  );
  const state = error ? "error" : isLoading ? "loading" : "ok";
  const cols = "grid grid-cols-[34px_repeat(7,1fr)] items-center gap-1";

  return (
    <Panel title="이번 주 일정 밀도" state={state}>
      <div className="flex flex-col gap-1" role="table" aria-label="요일과 시간대별 일정 밀도">
        <div className={`${cols} text-center text-[11px] text-fg-subtle`} role="row">
          <span />
          {days.map((d) => <span key={d} role="columnheader" className={d === today ? "font-bold text-fg" : ""}>{WEEKDAYS_KO[weekdayOf(d)]}</span>)}
        </div>
        {DENSITY_BINS.map((bin, bi) => (
          <div key={bi} className={cols} role="row">
            <span className="text-[11px] text-fg-subtle">{binLabel(bin)}</span>
            {matrix[bi].map((v, di) => (
              <div key={di} role="cell" className="h-[22px] rounded-md" style={{ background: HEAT[v] }}
                aria-label={`${days[di]} ${bin[0]}시대 ${["일정 없음", "여유", "보통", "바쁨", "매우 바쁨"][v]}`} />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── 지출 TOP3 카테고리 (DASH-6) ─────────────────────────────
function TopCategories() {
  const tz = useTimezone();
  const month = todayKey(tz).slice(0, 7);
  const tx = useTransactions(monthRange(month));
  const cats = useCategories(undefined, true);
  const top = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of tx.data ?? []) {
      if (t.type !== "expense") continue;
      const name = cats.data?.find((c) => c.id === t.category_id)?.name ?? "미분류";
      by.set(name, (by.get(name) ?? 0) + t.amount);
    }
    return topCategories([...by].map(([name, amount]) => ({ name, amount })), 3);
  }, [tx.data, cats.data]);

  return (
    <Panel title="지출 TOP3" state={tx.isError ? "error" : tx.isLoading ? "loading" : "ok"} right={<Link href="/ledger/stats" className="text-xs text-fg-subtle hover:no-underline">통계 →</Link>}>
      {top.length === 0 ? <p className="text-sm text-fg-subtle">이번 달 지출이 아직 없어요</p> : (
        <ol className="flex flex-col gap-3">
          {top.map((c, i) => (
            <li key={c.name} className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><span>{i + 1}. {c.name}</span><span className="font-semibold">{formatWon(c.amount)}원</span></div>
              <div className="h-1.5 rounded-full bg-surface-4" role="img" aria-label={`전체 지출의 ${Math.round(c.ratio * 100)}%`}>
                <div className="h-full rounded-full bg-purple" style={{ width: `${Math.max(c.ratio * 100, 2)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ── 이번 주 요약 (접이식, 규칙 기반 문구) ───────────────────
function WeekSummary() {
  const tz = useTimezone();
  const weekStart = useProfile().data?.week_start === "sunday" ? "sunday" : "monday";
  const today = todayKey(tz);
  const first = weekStartOf(today, weekStart);
  const [open, setOpen] = useState(false);
  const range = useMemo(() => ({ start: startOfDayUtc(first, tz), end: endOfDayUtc(addDays(first, 6), tz) }), [first, tz]);
  const { instances } = useEvents(range);
  const todos = useTodos();

  const timed = useMemo(() => instances.filter((i) => !i.event.all_day).map((i) => ({ start: i.start, end: i.end, allDay: false })), [instances]);
  const hours = Math.round(timed.reduce((s, e) => s + (e.end.getTime() - e.start.getTime()), 0) / 360_000) / 10;
  const stats = useMemo(() => weekTodoStats(todos.data ?? [], first, today), [todos.data, first, today]);
  const busy = useMemo(() => busiestDay(timed, first, tz), [timed, first, tz]);
  const sentence = weekSentence({ busiest: busy && { weekdayLabel: WEEKDAYS_KO[weekdayOf(busy.date)], hours: busy.hours }, stats });

  return (
    <section aria-label="이번 주 요약" className="rounded-[28px] bg-surface">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-[18px] gap-y-2 px-[22px] py-3 text-left text-sm">
        <span className="flex items-center gap-2 text-[15px] font-bold"><span className="h-2 w-2 rounded-full bg-purple" />이번 주 요약</span>
        <span className="text-fg-muted">일정 {timed.length}건 · {hours}시간</span>
        <span className="text-fg-muted">할일 {stats.done}/{stats.total}</span>
        {stats.overdue > 0 && <span className="text-danger-ink">기한초과 {stats.overdue}</span>}
        {stats.next && <span className="text-fg-muted">다음 마감 · {stats.next.title}</span>}
        <span className="ml-auto rounded-full bg-fg px-4 py-[7px] text-[13px] font-semibold text-bg">{open ? "접기 ⌄" : "펼치기 ⌃"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-[22px] py-4 text-sm text-fg-muted">
          {sentence ?? "이번 주에는 아직 요약할 내용이 없어요."}
        </div>
      )}
    </section>
  );
}
