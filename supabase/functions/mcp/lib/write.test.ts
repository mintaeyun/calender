import { test } from "vitest";
import assert from "node:assert/strict";
import { fakeScoped } from "./fake-db.ts";
import { TOOLS } from "./tools-schema.ts";
import { callTool } from "./dispatch.ts";
import { nextOccurrence } from "./next-occurrence.ts";
import { createEvent, deleteEvent, updateEvent } from "../tools/events-write.ts";
import { completeTodo, createTodo, deleteTodo } from "../tools/todos-write.ts";
import { addTransaction, deleteTransaction, updateTransaction } from "../tools/ledger-write.ts";
import { getTodayOverview, getWeather } from "../tools/weather.ts";
import type { Ctx } from "../tools/context.ts";

const TZ = "Asia/Seoul";
const scopes = { calendar: "write", todo: "write", ledger: "write" } as const;
const mk = (f: ReturnType<typeof fakeScoped>, extra: Partial<Ctx> = {}): Ctx => ({ db: f.db, tz: TZ, scopes, ...extra });
const ID = "11111111-1111-1111-1111-111111111111";

const evRow = (o: Record<string, unknown> = {}) => ({
  id: ID, title: "치과", start_at: "2026-10-15T06:00:00Z", end_at: "2026-10-15T07:00:00Z", all_day: false, location: null, notes: null,
  calendar_id: null, rrule: null, recurring_event_id: null, original_start_at: null, exdates: [], deleted_at: null, ...o,
});

test("모든 도구 정의에 핸들러가 있다 (index.ts 등록 누락 방지)", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../index.ts", import.meta.url), "utf8"));
  for (const t of TOOLS) assert.ok(new RegExp(`\\b${t.name}:\\s*\\w+`).test(src), `${t.name} 핸들러 미등록`);
});

test("create_event: 종일은 end_at=마지막 날 다음 날 0시(exclusive), 알림 저장", async () => {
  const f = fakeScoped({
    selects: { calendars: [[{ id: "cal1" }], [{ id: "cal1", name: "개인" }]] },
    writeResult: (w) => (w.table === "events" ? { data: evRow({ title: "휴가", all_day: true, start_at: "2026-10-16T15:00:00Z", end_at: "2026-10-18T15:00:00Z" }) } : { data: [] }),
  });
  const out: any = await createEvent(mk(f), { title: " 휴가 ", start: "2026-10-17", end: "2026-10-18", all_day: true, reminders: [0, 0, 780] });
  const ins = f.writes.find((w) => w.table === "events")!.payload as Record<string, unknown>;
  assert.equal(ins.start_at, "2026-10-16T15:00:00.000Z");
  assert.equal(ins.end_at, "2026-10-18T15:00:00.000Z");
  assert.equal(ins.title, "휴가");
  assert.equal(ins.calendar_id, "cal1");
  assert.equal(ins.rrule, null);
  const rem = f.writes.find((w) => w.table === "event_reminders")!.payload as { minutes_before: number }[];
  assert.deepEqual(rem.map((r) => r.minutes_before), [0, 780]);
  assert.deepEqual([out.created.start, out.created.end], ["2026-10-17", "2026-10-18"]);
});

test("create_event: 시간 일정은 KST 로 해석, 날짜만/역순은 거부", async () => {
  const f = fakeScoped({ writeResult: () => ({ data: evRow() }) });
  await createEvent(mk(f), { title: "치과", start: "2026-10-15T15:00:00", end: "2026-10-15T16:00:00" });
  const ins = f.writes.find((w) => w.table === "events")!.payload as Record<string, unknown>;
  assert.equal(ins.start_at, "2026-10-15T06:00:00.000Z");
  await assert.rejects(() => createEvent(mk(fakeScoped()), { title: "a", start: "2026-10-15", end: "2026-10-16" }), /시각이 필요/);
  await assert.rejects(() => createEvent(mk(fakeScoped()), { title: "a", start: "2026-10-15T16:00:00", end: "2026-10-15T15:00:00" }), /이후/);
});

test("update/delete_event: 반복 일정은 거부, 없는 id 는 not found", async () => {
  const rec = fakeScoped({ selects: { events: [[evRow({ rrule: "FREQ=DAILY" })]] } });
  await assert.rejects(() => updateEvent(mk(rec), { id: ID, title: "x" }), /반복 일정/);
  const rec2 = fakeScoped({ selects: { events: [[evRow({ recurring_event_id: "m", original_start_at: "2026-10-15T06:00:00Z" })]] } });
  await assert.rejects(() => deleteEvent(mk(rec2), { id: ID }), /반복 일정/);
  assert.equal(rec.writes.length + rec2.writes.length, 0); // 거부 시 쓰기 없음
  await assert.rejects(() => deleteEvent(mk(fakeScoped({ selects: { events: [[]] } })), { id: ID }), /찾을 수 없/);
});

test("update_event: start 만 주면 기존 길이 유지, 바꿀 필드 없으면 오류", async () => {
  const f = fakeScoped({ selects: { events: [[evRow()]], calendars: [[]] }, writeResult: () => ({ data: [evRow()] }) });
  await updateEvent(mk(f), { id: ID, start: "2026-10-15T16:00:00+09:00" });
  const patch = f.writes.find((w) => w.op === "update")!.payload as Record<string, unknown>;
  assert.equal(patch.start_at, "2026-10-15T07:00:00.000Z");
  assert.equal(patch.end_at, "2026-10-15T08:00:00.000Z"); // 1시간 유지
  await assert.rejects(() => updateEvent(mk(fakeScoped({ selects: { events: [[evRow()]] } })), { id: ID }), /바꿀 필드/);
});

test("delete_event: 소프트 삭제(deleted_at)이고 제목을 응답에 포함", async () => {
  const f = fakeScoped({ selects: { events: [[evRow()]] } });
  const out: any = await deleteEvent(mk(f), { id: ID });
  const w = f.writes[0];
  assert.equal(w.op, "update");
  assert.ok((w.payload as Record<string, unknown>).deleted_at);
  assert.ok(w.calls.some(([n, a]) => n === "eq" && a[0] === "id" && a[1] === ID));
  assert.equal(out.title, "치과");
});

test("nextOccurrence: web 과 같은 결과 (매일/주간/COUNT/UNTIL)", () => {
  assert.deepEqual(nextOccurrence("FREQ=DAILY", "2026-10-14", "2026-10-14"), { dueDate: "2026-10-15", rule: "FREQ=DAILY" });
  assert.equal(nextOccurrence("FREQ=DAILY", "2026-10-14", "2026-10-20")?.dueDate, "2026-10-21"); // 늦게 완료해도 과거 날짜 안 만듦
  assert.deepEqual(nextOccurrence("FREQ=DAILY;COUNT=3", "2026-10-14", "2026-10-14"), { dueDate: "2026-10-15", rule: "FREQ=DAILY;COUNT=2" });
  assert.equal(nextOccurrence("FREQ=DAILY;COUNT=1", "2026-10-14", "2026-10-14"), null);
  assert.equal(nextOccurrence("FREQ=DAILY;UNTIL=20261014T000000Z", "2026-10-14", "2026-10-14"), null);
});

const todoRow = (o: Record<string, unknown> = {}) => ({ id: ID, title: "운동", notes: null, due_date: "2026-10-14", priority: "medium", status: "todo", project_id: null, completed_at: null, recurrence_rule: null, ...o });

test("complete_todo: 반복이면 다음 주기를 계산해 RPC 로 넘김, 비반복이면 null", async () => {
  const rec = fakeScoped({
    selects: { todos: [[todoRow({ recurrence_rule: "FREQ=WEEKLY", due_date: "2099-01-05" })], [todoRow({ status: "done" })], [todoRow({ id: "n1" })]] },
    rpc: () => ({ data: "n1" }),
  });
  const out: any = await completeTodo(mk(rec), { id: ID });
  assert.equal(rec.rpcCalls[0].fn, "complete_todo");
  assert.equal(rec.rpcCalls[0].args.p_id, ID);
  assert.equal(rec.rpcCalls[0].args.p_next_due, "2099-01-12");
  assert.equal(rec.rpcCalls[0].args.p_next_rule, "FREQ=WEEKLY");
  assert.ok(out.next_occurrence);

  const plain = fakeScoped({ selects: { todos: [[todoRow()], [todoRow({ status: "done" })]] }, rpc: () => ({ data: null }) });
  const out2: any = await completeTodo(mk(plain), { id: ID });
  assert.equal(plain.rpcCalls[0].args.p_next_due, null);
  assert.equal(out2.next_occurrence, undefined);

  const done = fakeScoped({ selects: { todos: [[todoRow({ status: "done" })]] } });
  assert.match(((await completeTodo(mk(done), { id: ID })) as any).note, /이미 완료/);
  assert.equal(done.rpcCalls.length, 0);
});

test("create_todo: 프로젝트 이름 해석(모호하면 후보 오류), position=max+1024", async () => {
  const f = fakeScoped({
    selects: { todo_projects: [[{ id: "p1", name: "집" }, { id: "p2", name: "회사" }], []], todos: [[{ position: 2048 }]] },
    writeResult: () => ({ data: todoRow({ project_id: "p1" }) }),
  });
  await createTodo(mk(f), { title: "청소", project: "집" });
  const ins = f.writes[0].payload as Record<string, unknown>;
  assert.equal(ins.project_id, "p1");
  assert.equal(ins.position, 3072);
  assert.equal(ins.priority, "medium");
  const bad = fakeScoped({ selects: { todo_projects: [[{ id: "p1", name: "집" }, { id: "p2", name: "회사" }]] } });
  await assert.rejects(() => createTodo(mk(bad), { title: "x", project: "학교" }), /후보: 집, 회사/);
  assert.equal(bad.writes.length, 0);
});

test("delete_todo: 소프트 삭제", async () => {
  const f = fakeScoped({ selects: { todos: [[todoRow()]] } });
  const out: any = await deleteTodo(mk(f), { id: ID });
  assert.equal(f.writes[0].op, "update");
  assert.ok((f.writes[0].payload as Record<string, unknown>).deleted_at);
  assert.equal(out.title, "운동");
});

const cats = [{ id: "c-exp", name: "식비", kind: "expense" }, { id: "c-inc", name: "식비", kind: "income" }, { id: "c2", name: "교통", kind: "expense" }];
const accts = [{ id: "a1", name: "신한카드" }, { id: "a2", name: "현금" }];
const txRow = (o: Record<string, unknown> = {}) => ({ id: ID, date: "2026-10-14", amount: 12000, type: "expense", category_id: "c-exp", account_id: "a1", to_account_id: null, memo: null, source: "mcp", ...o });

test("add_transaction: source=mcp, 같은 이름도 종류별로 구분, 이름→ID", async () => {
  const f = fakeScoped({
    selects: { categories: [cats, cats], accounts: [accts, accts] }, writeResult: () => ({ data: txRow() }),
  });
  const out: any = await addTransaction(mk(f), { date: "2026-10-14", amount: 12000, type: "expense", category: "식비", account: "신한카드", memo: "점심" });
  const ins = f.writes[0].payload as Record<string, unknown>;
  assert.equal(ins.source, "mcp");
  assert.equal(ins.category_id, "c-exp"); // 수입 '식비'와 헷갈리지 않음
  assert.equal(ins.account_id, "a1");
  assert.equal(ins.to_account_id, null);
  assert.equal(out.created.account, "신한카드");
});

test("add_transaction: 검증 — 금액·이체·모호한 이름·계좌 생략", async () => {
  const base = { date: "2026-10-14", type: "expense" };
  const q = () => fakeScoped({ selects: { categories: [cats], accounts: [accts], transactions: [[]] } });
  await assert.rejects(() => addTransaction(mk(q()), { ...base, amount: 0 }), /정수/);
  await assert.rejects(() => addTransaction(mk(q()), { ...base, amount: 1.5 }), /정수/);
  await assert.rejects(() => addTransaction(mk(q()), { ...base, amount: 100, category: "간식", account: "현금" }), /후보: 식비, 교통/);
  await assert.rejects(() => addTransaction(mk(q()), { ...base, amount: 100 }), /계좌를 지정/); // 계좌 2개·최근 거래 없음 → 추측 금지
  await assert.rejects(() => addTransaction(mk(q()), { ...base, type: "transfer", amount: 100, account: "현금" }), /to_account/);
  await assert.rejects(() => addTransaction(mk(q()), { ...base, type: "transfer", amount: 100, account: "현금", to_account: "현금" }), /같을 수 없/);
  await assert.rejects(() => addTransaction(mk(q()), { ...base, amount: 100, account: "현금", to_account: "신한카드" }), /이체/);
  const f = fakeScoped({ selects: { categories: [cats], accounts: [accts], transactions: [[{ account_id: "a2" }]] }, writeResult: () => ({ data: txRow({ account_id: "a2" }) }) });
  await addTransaction(mk(f), { ...base, amount: 100 }); // 최근 거래 계좌(현금) 사용
  assert.equal((f.writes[0].payload as Record<string, unknown>).account_id, "a2");
});

test("add_transaction: 이체는 카테고리 없이 to_account 저장", async () => {
  const f = fakeScoped({ selects: { categories: [cats, cats], accounts: [accts, accts] }, writeResult: () => ({ data: txRow({ type: "transfer", category_id: null, to_account_id: "a2" }) }) });
  await addTransaction(mk(f), { date: "2026-10-14", amount: 5000, type: "transfer", account: "신한카드", to_account: "현금" });
  const ins = f.writes[0].payload as Record<string, unknown>;
  assert.deepEqual([ins.type, ins.category_id, ins.to_account_id], ["transfer", null, "a2"]);
});

test("update_transaction: 수입↔지출 전환 시 카테고리 비움, 이체 전환은 to_account 필요", async () => {
  const f = fakeScoped({ selects: { transactions: [[txRow()]], categories: [cats], accounts: [accts] }, writeResult: () => ({ data: [txRow({ type: "income", category_id: null })] }) });
  await updateTransaction(mk(f), { id: ID, type: "income" });
  const patch = f.writes[0].payload as Record<string, unknown>;
  assert.equal(patch.category_id, null);
  assert.equal(patch.type, "income");
  const g = fakeScoped({ selects: { transactions: [[txRow()]], categories: [cats], accounts: [accts] } });
  await assert.rejects(() => updateTransaction(mk(g), { id: ID, type: "transfer" }), /to_account/);
  assert.equal(g.writes.length, 0);
});

test("delete_transaction: 하드 삭제, 삭제한 내용을 응답에 포함", async () => {
  const f = fakeScoped({ selects: { transactions: [[txRow({ memo: "점심" })]], accounts: [accts], categories: [cats] } });
  const out: any = await deleteTransaction(mk(f), { id: ID });
  assert.equal(f.writes[0].op, "remove");
  assert.ok(f.writes[0].calls.some(([n, a]) => n === "eq" && a[1] === ID));
  assert.deepEqual([out.deleted, out.amount, out.memo], [true, 12000, "점심"]);
  await assert.rejects(() => deleteTransaction(mk(fakeScoped({ selects: { transactions: [[]] } })), { id: ID }), /찾을 수 없/);
});

test("삭제 도구는 입력 검증에서 id 외 필드(일괄·조건 삭제)를 거부", async () => {
  for (const name of ["delete_event", "delete_todo", "delete_transaction"]) {
    const out = await callTool(name, { id: ID, all: true }, scopes, {}, { [name]: async () => ({}) });
    assert.equal(out.status, "error");
    assert.match(out.result.content[0].text, /알 수 없는 필드/);
    const arr = await callTool(name, { id: [ID, ID] }, scopes, {}, { [name]: async () => ({}) });
    assert.equal(arr.status, "error");
  }
});

const forecast = {
  current: { temp: 18.4, feelsLike: 17, condition: { icon: "clear", label: "맑음" } },
  hourly: [{ time: "2026-10-19T15:00", temp: 20, precipProb: 10, condition: { icon: "clear", label: "맑음" } }],
  daily: [{ date: "2026-10-19", tempMax: 22, tempMin: 12, precipProbMax: 30, condition: { icon: "partly", label: "구름 조금" } }],
  stale: false,
};
const weather = { forecast: async () => forecast, geocode: async (q: string) => (q === "없는곳" ? [] : [{ name: "부산", admin: "부산광역시", lat: 35.1, lon: 129 }]) };

test("get_weather: 기본 지역·화씨 변환, 지역 검색, 위치 없음/범위 밖 날짜 오류", async () => {
  const saved = { weather_location: { name: "서울", lat: 37.5, lon: 127 }, temp_unit: "F" };
  const out: any = await getWeather(mk(fakeScoped({ selects: { profiles: [[saved]] } }), { weather }), { date: "2026-10-19" });
  assert.equal(out.location, "서울");
  assert.equal(out.unit, "°F");
  assert.equal(out.day.temp_max, 72);
  assert.deepEqual(out.hourly.map((h: { time: string }) => h.time), ["15:00"]);
  const busan: any = await getWeather(mk(fakeScoped({ selects: { profiles: [[{ weather_location: null, temp_unit: "C" }]] } }), { weather }), { location: "부산", date: "2026-10-19" });
  assert.equal(busan.location, "부산, 부산광역시");
  await assert.rejects(() => getWeather(mk(fakeScoped({ selects: { profiles: [[{ weather_location: null, temp_unit: "C" }]] } }), { weather }), {}), /설정되어 있지 않/);
  await assert.rejects(() => getWeather(mk(fakeScoped({ selects: { profiles: [[saved]] } }), { weather }), { location: "없는곳" }), /찾지 못/);
  await assert.rejects(() => getWeather(mk(fakeScoped({ selects: { profiles: [[saved]] } }), { weather }), { date: "2030-01-01" }), /제공하지 않/);
});

test("get_today_overview: 권한 없는 서비스는 조회하지 않고 skipped 로 표시", async () => {
  const f = fakeScoped({ selects: { profiles: [[{ weather_location: null, temp_unit: "C" }]], todos: [[todoRow()]] } });
  const ctx = mk(f, { scopes: { calendar: "none", todo: "read", ledger: "none" }, weather });
  const out: any = await getTodayOverview(ctx, { date: "2026-10-19" });
  assert.ok(out.todos);
  assert.equal(out.events, undefined);
  assert.equal(out.spending, undefined);
  assert.deepEqual(out.skipped, ["일정(권한 없음)", "지출(권한 없음)"]);
  assert.ok(f.selectCalls.every((c) => c.table !== "events" && c.table !== "transactions"));
  assert.ok(out.weather.error); // 지역 미설정은 전체 실패가 아니라 해당 부분만 오류
});
