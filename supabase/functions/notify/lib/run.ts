// 알림 스캔 실행: DB에서 사용자별 데이터를 읽어 계획(plan*)을 만들고, 멱등하게 notifications 에 넣은 뒤 푸시를 보낸다.
// service role 로 동작하므로 모든 쿼리에 대상 user_id 조건을 직접 넣는다(RLS가 보호해 주지 않는다).
// 한 사용자·한 스캔이 실패해도 다른 것은 계속한다(오류는 로그만 남기고 결과에 집계).
import type { Db } from "../../_shared/supabase.ts";
import { DEFAULT_TIMEZONE } from "../../_shared/time.ts";
import { createProvider, dbCacheStore } from "../../weather/deps.ts";
import { getForecast } from "../../weather/service.ts";
import { occurrencesBetween, planEventNotifications, type EventLike } from "./events.ts";
import { deliverPush, type PushSub } from "./push.ts";
import { atLocal, localDate, planBudgetNotifications, planPaymentNotifications, planRainNotifications, planSyncErrorNotification, planTodoNotifications, shiftDate } from "./scans.ts";
import { isQuietTime, isTypeEnabled, type NotificationSettings } from "./settings.ts";
import type { Planned, Window } from "./types.ts";

/** 스캔 창 길이. 5분마다 실행하되 15분을 훑어 한두 번 실패해도 놓치지 않는다(중복은 dedupe_key 가 막는다). */
export const LOOKBACK_MS = 15 * 60_000;
const DAY = 24 * 60 * 60_000;

export type RunResult = { users: number; created: number; pushed: number; errors: string[] };

export async function runScan(db: Db, now: Date = new Date()): Promise<RunResult> {
  const window: Window = { from: new Date(now.getTime() - LOOKBACK_MS), to: now };
  const result: RunResult = { users: 0, created: 0, pushed: 0, errors: [] };

  const { data: settingsRows, error } = await db.from("notification_settings").select("*");
  if (error) throw error;
  const { data: profiles } = await db.from("profiles").select("user_id, timezone, weather_location");
  const prof = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  for (const row of settingsRows ?? []) {
    const userId = row.user_id;
    const p = prof.get(userId);
    const tz = p?.timezone ?? DEFAULT_TIMEZONE;
    const settings: NotificationSettings = {
      enabled_types: (row.enabled_types ?? {}) as NotificationSettings["enabled_types"],
      channels: (row.channels ?? {}) as NotificationSettings["channels"],
      quiet_start: row.quiet_start, quiet_end: row.quiet_end,
    };
    result.users++;

    const planned: Planned[] = [];
    const budgetFlags: { budgetId: string; dedupe: string; flags: string[] }[] = [];
    const attempt = async (name: string, fn: () => Promise<void>) => {
      try { await fn(); } catch (e) {
        const msg = `${name} (user ${userId.slice(0, 8)}): ${e instanceof Error ? e.message : String(e)}`;
        console.error("notify scan failed:", msg);
        result.errors.push(msg);
      }
    };

    await attempt("events", async () => { planned.push(...await scanEvents(db, userId, window, tz)); });
    await attempt("todos", async () => { planned.push(...await scanTodos(db, userId, window, tz)); });
    await attempt("budgets", async () => {
      for (const b of await scanBudgets(db, userId, now, tz)) {
        planned.push(b.planned);
        budgetFlags.push({ budgetId: b.budgetId, dedupe: b.planned.dedupe_key, flags: b.flags });
      }
    });
    await attempt("payments", async () => { planned.push(...await scanPayments(db, userId, window, tz)); });
    await attempt("rain", async () => { planned.push(...await scanRain(db, userId, window, tz, p?.weather_location)); });
    await attempt("sync", async () => {
      const { data } = await db.from("google_connections").select("last_error").eq("user_id", userId).maybeSingle();
      const n = planSyncErrorNotification(data, now, tz);
      if (n) planned.push(n);
    });

    // 종류별 on/off 반영 후 멱등 삽입 (user_id, dedupe_key) 충돌은 무시
    const wanted = planned.filter((n) => isTypeEnabled(settings, n.type));
    const inserted = new Set<string>();
    if (wanted.length) {
      await attempt("insert", async () => {
        const { data, error: e } = await db
          .from("notifications")
          .upsert(
            wanted.map((n) => ({ user_id: userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupe_key: n.dedupe_key, scheduled_at: n.scheduled_at.toISOString() })),
            { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
          )
          .select("dedupe_key");
        if (e) throw e;
        for (const r of data ?? []) if (r.dedupe_key) inserted.add(r.dedupe_key);
        result.created += inserted.size;
      });
    }
    // 예산 플래그는 알림 행이 만들어졌거나 이미 있던 경우(=알림 기록 존재) 모두 갱신. 종류가 꺼져 있어도 갱신해 나중에 켜도 과거 알림이 쏟아지지 않게 한다.
    for (const f of budgetFlags) {
      await attempt("budget-flags", async () => {
        const patch: { alerted_80_at?: string; alerted_100_at?: string } = {};
        for (const c of f.flags) patch[c as "alerted_80_at" | "alerted_100_at"] = now.toISOString();
        const { error: e } = await db.from("budgets").update(patch).eq("id", f.budgetId).eq("user_id", userId);
        if (e) throw e;
      });
    }

    // 푸시: 아직 발송 안 한 최근 알림(방해금지에 걸려 미뤄진 것 포함)을 방해금지가 아닐 때 보낸다. 앱 내 기록은 위에서 항상 남겼다.
    if (settings.channels.push && !isQuietTime(now, tz, settings.quiet_start, settings.quiet_end)) {
      await attempt("push", async () => {
        const subs = (row.push_subscriptions ?? []) as unknown as PushSub[];
        if (!subs.length) return;
        const { data: pending } = await db.from("notifications").select("id, title, body, link, type")
          .eq("user_id", userId).is("delivered_at", null).lte("scheduled_at", now.toISOString())
          .gte("scheduled_at", new Date(now.getTime() - DAY).toISOString()).order("scheduled_at").limit(20);
        for (const n of pending ?? []) {
          if (!isTypeEnabled(settings, n.type as Planned["type"])) continue;
          const { sent, gone } = await deliverPush(subs, { title: n.title, body: n.body ?? "", link: n.link ?? "/notifications" });
          if (sent > 0 || subs.length === gone.length) {
            await db.from("notifications").update({ delivered_at: now.toISOString() }).eq("id", n.id).eq("user_id", userId);
            result.pushed += sent;
          }
          if (gone.length) {
            // 만료된 구독(404/410)은 자동 삭제
            const alive = subs.filter((s) => !gone.includes(s.endpoint));
            await db.from("notification_settings").update({ push_subscriptions: alive as never }).eq("user_id", userId);
            subs.splice(0, subs.length, ...alive);
          }
        }
      });
    }
  }
  return result;
}

// ── 스캔별 데이터 로딩 ─────────────────────────────────

async function scanEvents(db: Db, userId: string, window: Window, tz: string): Promise<Planned[]> {
  const lo = new Date(window.from.getTime() - 2 * DAY).toISOString();
  const hi = new Date(window.to.getTime() + 9 * DAY).toISOString(); // 최대 1주 전 알림 + 여유
  const sel = "id, title, start_at, end_at, all_day, rrule, exdates, recurring_event_id, original_start_at, deleted_at";
  const [{ data: timed, error: e1 }, { data: masters, error: e2 }] = await Promise.all([
    db.from("events").select(sel).eq("user_id", userId).is("deleted_at", null).gte("start_at", lo).lte("start_at", hi),
    db.from("events").select(sel).eq("user_id", userId).is("deleted_at", null).not("rrule", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = new Map<string, EventLike>();
  for (const e of [...(timed ?? []), ...(masters ?? [])]) byId.set(e.id, e as unknown as EventLike);
  const events = [...byId.values()];
  if (!events.length) return [];
  const { data: rem, error: e3 } = await db.from("event_reminders").select("event_id, minutes_before").eq("user_id", userId).in("event_id", events.map((e) => e.id));
  if (e3) throw e3;
  const reminders = new Map<string, number[]>();
  for (const r of rem ?? []) reminders.set(r.event_id, [...(reminders.get(r.event_id) ?? []), r.minutes_before]);
  return planEventNotifications(events, reminders, window, tz);
}

async function scanTodos(db: Db, userId: string, window: Window, tz: string): Promise<Planned[]> {
  const from = shiftDate(localDate(window.from, tz), -2);
  const to = shiftDate(localDate(window.to, tz), 1);
  const { data, error } = await db.from("todos").select("id, title, due_date, status, deleted_at")
    .eq("user_id", userId).is("deleted_at", null).neq("status", "done").gte("due_date", from).lte("due_date", to);
  if (error) throw error;
  return planTodoNotifications(data ?? [], window, tz);
}

async function scanBudgets(db: Db, userId: string, now: Date, tz: string) {
  const month = `${localDate(now, tz).slice(0, 7)}-01`;
  const [{ data: budgets, error: e1 }, { data: usage, error: e2 }, { data: cats }] = await Promise.all([
    db.from("budgets").select("id, month, category_id, amount, alerted_80_at, alerted_100_at").eq("user_id", userId).eq("month", month),
    db.rpc("budget_usage", { p_user: userId, p_month: month }),
    db.from("categories").select("id, name").eq("user_id", userId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const spent = new Map((usage ?? []).map((u) => [u.category_id, Number(u.spent)]));
  const names = new Map<string | null, string>([[null, "총예산"], ...(cats ?? []).map((c) => [c.id, c.name] as [string, string])]);
  return planBudgetNotifications((budgets ?? []).map((b) => ({ ...b, amount: Number(b.amount), spent: spent.get(b.category_id) ?? 0 })), names, now);
}

async function scanPayments(db: Db, userId: string, window: Window, tz: string): Promise<Planned[]> {
  const today = localDate(window.to, tz);
  const { data, error } = await db.from("recurring_payments").select("id, name, amount, next_run_date, active")
    .eq("user_id", userId).eq("active", true).gte("next_run_date", today).lte("next_run_date", shiftDate(today, 3));
  if (error) throw error;
  return planPaymentNotifications((data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })), window, tz);
}

async function scanRain(db: Db, userId: string, window: Window, tz: string, loc: unknown): Promise<Planned[]> {
  const l = loc as { lat?: number; lon?: number } | null;
  if (!l || typeof l.lat !== "number" || typeof l.lon !== "number") return [];
  const today = localDate(window.to, tz);
  // 알림 후보 날짜(전날 저녁/당일 아침)는 오늘·내일 → 장소 있는 일정이 있는 날을 구한다.
  const rangeStart = atLocal(today, 0, 0, tz);
  const rangeEnd = atLocal(shiftDate(today, 2), 0, 0, tz);
  const { data, error } = await db.from("events").select("id, start_at, rrule, exdates, location")
    .eq("user_id", userId).is("deleted_at", null).not("location", "is", null).neq("location", "")
    .or(`rrule.not.is.null,and(start_at.gte.${rangeStart.toISOString()},start_at.lt.${rangeEnd.toISOString()})`);
  if (error) throw error;
  const dates = new Set<string>();
  for (const e of data ?? []) {
    const occ = e.rrule
      ? occurrencesBetween(e.rrule, new Date(e.start_at), rangeStart, new Date(rangeEnd.getTime() - 1), tz)
          .filter((o) => !(e.exdates ?? []).some((x) => new Date(x).getTime() === o.getTime()))
      : [new Date(e.start_at)];
    for (const o of occ) dates.add(localDate(o, tz));
  }
  if (!dates.size) return [];
  const fc = await getForecast({ provider: createProvider(), store: dbCacheStore() }, l.lat, l.lon);
  return planRainNotifications(dates, fc.daily, window, tz);
}
