import { describe, expect, it } from "vitest";
import { isQuietTime, isTypeEnabled } from "./settings";
import {
  planBudgetNotifications, planPaymentNotifications, planRainNotifications, planSyncErrorNotification, planTodoNotifications,
} from "./scans";

const TZ = "Asia/Seoul";
// 서울 2026-10-14 09:00 = UTC 00:00
const w = (fromIso: string, toIso: string) => ({ from: new Date(fromIso), to: new Date(toIso) });

describe("방해금지/종류 설정", () => {
  it("23:00–07:00 자정 넘는 구간 (서울 시각 기준)", () => {
    const q = (iso: string) => isQuietTime(new Date(iso), TZ, "23:00", "07:00");
    expect(q("2026-10-14T14:30:00Z")).toBe(true);  // 서울 23:30
    expect(q("2026-10-13T20:00:00Z")).toBe(true);  // 서울 05:00
    expect(q("2026-10-13T22:00:00Z")).toBe(false); // 서울 07:00 정각 = 종료
    expect(q("2026-10-14T03:00:00Z")).toBe(false); // 서울 12:00
  });
  it("같은 날 구간·설정 없음·시작==끝", () => {
    expect(isQuietTime(new Date("2026-10-14T05:00:00Z"), TZ, "13:00", "15:00")).toBe(true); // 서울 14:00
    expect(isQuietTime(new Date("2026-10-14T05:00:00Z"), TZ, null, null)).toBe(false);
    expect(isQuietTime(new Date("2026-10-14T05:00:00Z"), TZ, "10:00:00", "10:00:00")).toBe(false);
  });
  it("종류 on/off: 키가 없으면 켜짐", () => {
    expect(isTypeEnabled({ enabled_types: { rain_forecast: false } }, "rain_forecast")).toBe(false);
    expect(isTypeEnabled({ enabled_types: {} }, "todo_due")).toBe(true);
  });
});

describe("할일 마감", () => {
  const todo = { id: "t1", title: "분기 보고서", due_date: "2026-10-14", status: "todo", deleted_at: null };
  it("마감 당일 09:00(서울) 창에서 1건, 창 밖이면 0건", () => {
    const hit = planTodoNotifications([todo], w("2026-10-13T23:55:00Z", "2026-10-14T00:05:00Z"), TZ);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ type: "todo_due", dedupe_key: "todo_due:t1:2026-10-14:today", body: "오늘이 마감이에요" });
    expect(planTodoNotifications([todo], w("2026-10-14T00:05:00Z", "2026-10-14T00:10:00Z"), TZ)).toHaveLength(0);
  });
  it("다음 날 09:00에 기한초과 1회, 완료·삭제는 제외", () => {
    const over = planTodoNotifications([todo], w("2026-10-14T23:55:00Z", "2026-10-15T00:05:00Z"), TZ);
    expect(over.map((p) => p.dedupe_key)).toEqual(["todo_due:t1:2026-10-14:over"]);
    const win = w("2026-10-13T23:55:00Z", "2026-10-14T00:05:00Z");
    expect(planTodoNotifications([{ ...todo, status: "done" }, { ...todo, id: "t2", deleted_at: "x" }, { ...todo, id: "t3", due_date: null }], win, TZ)).toHaveLength(0);
  });
  it("겹치는 창으로 두 번 스캔해도 같은 키", () => {
    const a = planTodoNotifications([todo], w("2026-10-13T23:50:00Z", "2026-10-14T00:00:00Z"), TZ);
    const b = planTodoNotifications([todo], w("2026-10-13T23:59:00Z", "2026-10-14T00:09:00Z"), TZ);
    expect(a.map((p) => p.dedupe_key)).toEqual(b.map((p) => p.dedupe_key));
  });
});

describe("예산 80%/100%", () => {
  const now = new Date("2026-10-14T05:00:00Z");
  const names = new Map<string | null, string>([[null, "총예산"], ["c1", "식비"]]);
  const b = (o = {}) => ({ id: "b1", month: "2026-10-01", category_id: "c1", amount: 100000, spent: 0, alerted_80_at: null, alerted_100_at: null, ...o });
  it("80% 도달 → 경고 1건, 플래그 80", () => {
    const r = planBudgetNotifications([b({ spent: 85000 })], names, now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ budgetId: "b1", flags: ["alerted_80_at"], planned: { type: "budget_warning", title: "식비 예산 80%에 도달했어요" } });
  });
  it("이미 알림한 단계는 다시 만들지 않는다", () => {
    expect(planBudgetNotifications([b({ spent: 85000, alerted_80_at: "x" })], names, now)).toHaveLength(0);
    expect(planBudgetNotifications([b({ spent: 120000, alerted_80_at: "x", alerted_100_at: "y" })], names, now)).toHaveLength(0);
  });
  it("100% 초과: 80% 알림이 이미 있으면 초과만, 한 번에 넘기면 초과 1건 + 두 플래그", () => {
    const a = planBudgetNotifications([b({ spent: 100000, alerted_80_at: "x" })], names, now);
    expect(a[0]).toMatchObject({ flags: ["alerted_100_at"], planned: { type: "budget_exceeded" } });
    const c = planBudgetNotifications([b({ spent: 130000 })], names, now);
    expect(c).toHaveLength(1);
    expect(c[0].flags).toEqual(["alerted_80_at", "alerted_100_at"]);
    expect(c[0].planned.body).toContain("30,000원 초과");
  });
  it("80% 미만·예산 0은 없음, 총예산 이름", () => {
    expect(planBudgetNotifications([b({ spent: 79999 }), b({ id: "b2", amount: 0, spent: 5 })], names, now)).toHaveLength(0);
    expect(planBudgetNotifications([b({ category_id: null, spent: 90000 })], names, now)[0].planned.title).toBe("총예산 예산 80%에 도달했어요");
  });
});

describe("결제 예정", () => {
  const r = { id: "r1", name: "넷플릭스", amount: 17000, next_run_date: "2026-10-16", active: true };
  it("결제 전날 20:00(서울) = UTC 11:00 창에서 1건", () => {
    const hit = planPaymentNotifications([r], w("2026-10-15T10:55:00Z", "2026-10-15T11:05:00Z"), TZ);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ title: "내일 넷플릭스 17,000원 결제", dedupe_key: "payment_due:r1:2026-10-16" });
    expect(planPaymentNotifications([r], w("2026-10-15T11:05:00Z", "2026-10-15T11:10:00Z"), TZ)).toHaveLength(0);
  });
  it("비활성 제외", () => {
    expect(planPaymentNotifications([{ ...r, active: false }], w("2026-10-15T10:55:00Z", "2026-10-15T11:05:00Z"), TZ)).toHaveLength(0);
  });
});

describe("우천", () => {
  const daily = [
    { date: "2026-10-15", precipProbMax: 80, condition: { label: "비" } },
    { date: "2026-10-16", precipProbMax: 59, condition: { label: "구름" } },
  ];
  it("장소 있는 일정이 있는 날 + 강수확률 ≥60%: 전날 20:00 / 당일 07:00", () => {
    const dates = new Set(["2026-10-15", "2026-10-16"]);
    const eve = planRainNotifications(dates, daily, w("2026-10-14T10:55:00Z", "2026-10-14T11:05:00Z"), TZ);
    expect(eve).toHaveLength(1);
    expect(eve[0]).toMatchObject({ type: "rain_forecast", dedupe_key: "rain_forecast:2026-10-15:evening", title: "내일 비 예보가 있어요" });
    const morning = planRainNotifications(dates, daily, w("2026-10-14T21:55:00Z", "2026-10-14T22:05:00Z"), TZ);
    expect(morning.map((p) => p.dedupe_key)).toEqual(["rain_forecast:2026-10-15:morning"]);
  });
  it("일정이 없거나 59%면 없음", () => {
    expect(planRainNotifications(new Set(), daily, w("2026-10-14T10:55:00Z", "2026-10-14T11:05:00Z"), TZ)).toHaveLength(0);
    expect(planRainNotifications(new Set(["2026-10-16"]), daily, w("2026-10-15T10:55:00Z", "2026-10-15T11:05:00Z"), TZ)).toHaveLength(0);
  });
});

describe("동기화 오류", () => {
  it("오류가 있으면 하루 1건 키, 없으면 null", () => {
    const now = new Date("2026-10-14T05:00:00Z");
    expect(planSyncErrorNotification({ last_error: "invalid_grant" }, now, TZ)?.dedupe_key).toBe("sync_error:2026-10-14");
    expect(planSyncErrorNotification({ last_error: null }, now, TZ)).toBeNull();
    expect(planSyncErrorNotification(null, now, TZ)).toBeNull();
  });
});
