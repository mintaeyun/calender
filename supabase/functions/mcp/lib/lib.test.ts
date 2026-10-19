import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveNamed, ToolError } from "./resolve.ts";
import { decideRate, minuteBucket } from "./rate-limit.ts";
import { findFreeTime, mergeBusy } from "./free-time.ts";
import { validate } from "./validate.ts";
import { TOOLS, visibleTools, toolAllowed } from "./tools-schema.ts";

const cats = [
  { id: "11111111-1111-1111-1111-111111111111", name: "식비" },
  { id: "22222222-2222-2222-2222-222222222222", name: "교통" },
  { id: "33333333-3333-3333-3333-333333333333", name: "식 비" },
];

test("resolve: 이름·ID 일치", () => {
  assert.equal(resolveNamed("카테고리", "교통", cats).id, cats[1].id);
  assert.equal(resolveNamed("카테고리", cats[1].id.toUpperCase(), cats).name, "교통");
});

test("resolve: 모호하면 후보 포함 오류", () => {
  assert.throws(() => resolveNamed("카테고리", "식비", cats), (e: ToolError) => e.message.includes("여러 개") && e.message.includes("식 비"));
});

test("resolve: 없으면 후보 포함 오류, 추측하지 않음", () => {
  assert.throws(() => resolveNamed("카테고리", "간", cats.slice(0, 2)), (e: ToolError) => e.message.includes("후보: 식비, 교통"));
  assert.throws(() => resolveNamed("카테고리", "식", cats.slice(0, 2)), (e: ToolError) => e.message.includes("후보: 식비"));
});

test("rate: 60회까지 허용, 61번째 거부", () => {
  const now = new Date("2026-10-14T00:00:20Z");
  assert.equal(decideRate(60, now).allowed, true);
  const d = decideRate(61, now);
  assert.equal(d.allowed, false);
  if (!d.allowed) assert.equal(d.retryAfterSec, 40);
  assert.equal(minuteBucket(now), "2026-10-14T00:00:00.000Z");
});

test("free-time: 평일 업무시간에서 일정 사이 빈 구간", () => {
  // 2026-10-14는 수요일. KST(+540) 09:00 = 00:00Z
  const z = (h: number) => Date.UTC(2026, 9, 14, h - 9, 0);
  const slots = findFreeTime({
    start: z(0), end: z(24), durationMin: 60, tzOffsetMin: 540,
    busy: [{ start: z(10), end: z(11) }, { start: z(10.5 | 0), end: z(12) }, { start: z(16), end: z(18) }],
  });
  assert.deepEqual(slots, [{ start: z(9), end: z(10) }, { start: z(12), end: z(16) }]);
});

test("free-time: 주말 제외 기본, 포함 옵션", () => {
  const sat = Date.UTC(2026, 9, 17, 0, 0) - 9 * 3600_000; // 토요일 00:00 KST
  const o = { start: sat, end: sat + 86_400_000, durationMin: 30, tzOffsetMin: 540, busy: [] };
  assert.equal(findFreeTime(o).length, 0);
  assert.equal(findFreeTime({ ...o, includeWeekends: true }).length, 1);
});

test("free-time: 병합", () => {
  assert.deepEqual(mergeBusy([{ start: 5, end: 8 }, { start: 1, end: 6 }, { start: 9, end: 9 }]), [{ start: 1, end: 8 }]);
});

test("validate: 필수·알 수 없는 필드·형식", () => {
  const add = TOOLS.find((t) => t.name === "add_transaction")!;
  assert.deepEqual(validate(add.inputSchema, { date: "2026-10-14", amount: 12000, type: "expense", category: "식비" }), []);
  const errs = validate(add.inputSchema, { date: "2026-13-40", amount: -5, type: "x", foo: 1 });
  assert.ok(errs.some((e) => e.includes("foo") && e.includes("알 수 없는")));
  assert.ok(errs.some((e) => e.includes("amount")));
  assert.ok(errs.some((e) => e.includes("date")));
  assert.ok(errs.some((e) => e.includes("type")));
  assert.ok(validate(add.inputSchema, { date: "2026-10-14", amount: 1.5, type: "expense" }).some((e) => e.includes("정수")));
});

test("tools: 삭제 도구는 확인 문구·단일 id만, 일괄 삭제 없음", () => {
  const dels = TOOLS.filter((t) => t.name.startsWith("delete_"));
  assert.equal(dels.length, 3);
  for (const t of dels) {
    assert.ok(t.description.includes("사용자에게 삭제 의사를 확인한 뒤에만 호출하세요"));
    assert.deepEqual(Object.keys(t.inputSchema.properties!), ["id"]);
    assert.equal(t.inputSchema.properties!.id.type, "string");
  }
  assert.ok(!TOOLS.some((t) => /bulk|batch|delete_all|delete_many/.test(t.name)));
});

test("scopes: 읽기 전용 토큰은 쓰기 도구 불가", () => {
  const ro = { calendar: "read", todo: "read", ledger: "none" } as const;
  const names = visibleTools(ro).map((t) => t.name);
  assert.ok(names.includes("list_events") && names.includes("list_todos"));
  assert.ok(!names.some((n) => n.startsWith("create_") || n.startsWith("delete_") || n === "add_transaction"));
  assert.ok(!names.includes("list_transactions"));
  assert.equal(toolAllowed(TOOLS.find((t) => t.name === "create_event")!, ro), false);
  assert.equal(visibleTools({ calendar: "none", todo: "none", ledger: "none" }).length, 0);
});
