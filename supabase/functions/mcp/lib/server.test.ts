import { test } from "vitest";
import assert from "node:assert/strict";
import { generateToken, parseBearer, safeEqual, sha256Hex } from "./token.ts";
import { scoped } from "./scoped.ts";
import { handleRpc } from "./protocol.ts";
import { callTool, summarizeInput } from "./dispatch.ts";
import { budgetUsage, groupExpense, monthRange, totals, type Tx } from "./summary.ts";
import { visibleTools } from "./tools-schema.ts";
import { ToolError } from "./resolve.ts";

test("token: 형식·해시·prefix, 원문 재현 불가", async () => {
  const t = await generateToken();
  assert.match(t.raw, /^lm_[A-Za-z0-9_-]{43}$/);
  assert.equal(t.prefix, t.raw.slice(0, 7));
  assert.equal(t.hash, await sha256Hex(t.raw));
  assert.equal(t.hash.length, 64);
  assert.ok(!t.hash.includes(t.raw));
  assert.notEqual((await generateToken()).raw, t.raw);
});

test("token: Bearer 파싱·상수 시간 비교", () => {
  assert.equal(parseBearer("Bearer lm_abc"), "lm_abc");
  assert.equal(parseBearer("bearer lm_abc"), "lm_abc");
  assert.equal(parseBearer("Bearer sk_abc"), null);
  assert.equal(parseBearer("lm_abc"), null);
  assert.equal(parseBearer(null), null);
  assert.equal(safeEqual("aa", "aa"), true);
  assert.equal(safeEqual("aa", "ab"), false);
  assert.equal(safeEqual("aa", "aaa"), false);
});

// 호출을 기록하는 가짜 쿼리 빌더
function fakeDb() {
  const calls: { table: string; op: string; arg?: unknown; eqs: [string, unknown][] }[] = [];
  const from = (table: string) => {
    const mk = (op: string, arg?: unknown) => {
      const c = { table, op, arg, eqs: [] as [string, unknown][] };
      calls.push(c);
      const b: any = new Proxy({}, { get: (_t, p) => p === "eq" ? (k: string, v: unknown) => (c.eqs.push([k, v]), b) : () => b });
      return b;
    };
    return { select: (cols: string) => mk("select", cols), insert: (row: unknown) => mk("insert", row), update: (p: unknown) => mk("update", p), delete: () => mk("delete") };
  };
  return { db: { from }, calls };
}

test("scoped: 모든 연산에 user_id 강제 (MCP-4)", () => {
  const { db, calls } = fakeDb();
  const s = scoped(db, "user-A");
  s.select("todos", "id");
  s.update("todos", { title: "x", user_id: "user-B", id: "other" });
  s.remove("transactions");
  s.insert("transactions", { amount: 1, user_id: "user-B" });
  for (const c of calls.filter((c) => c.op !== "insert")) assert.deepEqual(c.eqs, [["user_id", "user-A"]], c.op);
  assert.deepEqual(calls[1].arg, { title: "x" }); // user_id·id 변경 시도 제거
  assert.deepEqual(calls[3].arg, { amount: 1, user_id: "user-A" }); // 다른 사용자 id 덮어씀
  assert.throws(() => s.select("mcp_tokens" as never, "*"), /허용되지 않은 테이블/);
  assert.throws(() => scoped(db, ""), /userId/);
});

const handlers = {
  async listTodos() { return { ok: true }; },
  async boom() { throw new Error("SELECT secret FROM users"); },
  async amb() { throw new ToolError('카테고리 "간식"을 찾을 수 없습니다. 후보: 식비, 기타', "다시 지정"); },
};
const rw = { calendar: "write", todo: "write", ledger: "write" } as const;
const ro = { calendar: "read", todo: "read", ledger: "read" } as const;

test("dispatch: 읽기 전용 토큰으로 쓰기 도구 → denied, 핸들러 미실행", async () => {
  let ran = false;
  const out = await callTool("delete_todo", { id: "11111111-1111-1111-1111-111111111111" }, ro, {}, { delete_todo: async () => { ran = true; } });
  assert.equal(out.status, "denied");
  assert.equal(out.result.isError, true);
  assert.equal(ran, false);
});

test("dispatch: 입력 검증 오류·알 수 없는 필드", async () => {
  const out = await callTool("list_todos", { foo: 1 }, ro, {}, { list_todos: async () => ({}) });
  assert.equal(out.status, "error");
  assert.match(out.result.content[0].text, /알 수 없는 필드/);
});

test("dispatch: ToolError 는 메시지+힌트, 내부 오류는 상세 숨김", async () => {
  const origErr = console.error; console.error = () => {};
  try {
    const a = await callTool("list_todos", {}, rw, {}, { list_todos: handlers.amb });
    assert.match(a.result.content[0].text, /후보: 식비, 기타/);
    assert.match(a.result.content[0].text, /힌트/);
    const b = await callTool("list_todos", {}, rw, {}, { list_todos: handlers.boom });
    assert.ok(!b.result.content[0].text.includes("SELECT"));
    assert.equal(b.error, "internal");
  } finally { console.error = origErr; }
});

test("dispatch: 정상 호출은 JSON 텍스트", async () => {
  const out = await callTool("list_todos", {}, ro, {}, { list_todos: handlers.listTodos });
  assert.equal(out.status, "ok");
  assert.deepEqual(JSON.parse(out.result.content[0].text), { ok: true });
});

test("로그 요약: 긴 값 절단, 전체 payload 미저장", () => {
  const s = summarizeInput({ title: "가".repeat(100), amount: 5 });
  assert.ok(s.length < 80 && s.includes("…") && s.includes("amount=5"));
});

test("protocol: initialize / tools/list / ping / 알림 / 미지원", async () => {
  const h = { listTools: () => visibleTools(ro).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), callTool: async () => ({ content: [] }) };
  const init: any = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, h);
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.ok(init.result.capabilities.tools);
  const unk: any = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999" } }, h);
  assert.equal(unk.result.protocolVersion, "2025-06-18");
  const list: any = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, h);
  assert.ok(list.result.tools.length > 0 && list.result.tools.every((t: any) => !/^(create|update|delete|add)_/.test(t.name)));
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, h), null);
  assert.deepEqual(((await handleRpc({ jsonrpc: "2.0", id: 3, method: "ping" }, h)) as any).result, {});
  assert.equal(((await handleRpc({ jsonrpc: "2.0", id: 4, method: "nope" }, h)) as any).error.code, -32601);
  assert.equal(((await handleRpc({ foo: 1 }, h)) as any).error.code, -32600);
});

const tx = (o: Partial<Tx>): Tx => ({ date: "2026-10-01", amount: 1000, type: "expense", category_id: "c1", account_id: "a1", ...o });

test("summary: 합계·그룹·예산·월 범위", () => {
  const txs = [tx({ amount: 12000 }), tx({ amount: 3000, category_id: "c2" }), tx({ type: "income", amount: 50000, category_id: null }), tx({ type: "transfer", amount: 7000, category_id: null })];
  assert.deepEqual(totals(txs), { income: 50000, expense: 15000, transfer: 7000, net: 35000 });
  assert.deepEqual(groupExpense(txs, "category"), [{ id: "c1", amount: 12000 }, { id: "c2", amount: 3000 }]);
  const u = budgetUsage(txs, [{ category_id: "c1", amount: 24000 }, { category_id: null, amount: 10000 }]);
  assert.equal(u[0].percent, 50);
  assert.equal(u[1].remaining, -5000);
  assert.deepEqual(monthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.equal(monthRange("2026-13"), null);
});

test("도구 주석: 읽기=readOnly, 삭제=destructive, 날씨만 openWorld", async () => {
  const { TOOLS, annotationsOf } = await import("./tools-schema.ts");
  for (const t of TOOLS) {
    const a = annotationsOf(t);
    assert.equal(a.readOnlyHint, t.access === "read", t.name);
    assert.equal(a.destructiveHint, t.name.startsWith("delete_"), t.name);
    if (a.readOnlyHint) assert.equal(a.destructiveHint, false);
  }
  assert.deepEqual(TOOLS.filter((t) => annotationsOf(t).openWorldHint).map((t) => t.name), ["get_weather", "get_today_overview"]);
  assert.equal(annotationsOf(TOOLS.find((t) => t.name === "create_event")!).idempotentHint, false);
});

test("initialize 응답에 서버 안내(instructions): 삭제 확인 문구가 앞 512자 안에 있다", async () => {
  const { SERVER_INSTRUCTIONS } = await import("./protocol.ts");
  assert.ok(SERVER_INSTRUCTIONS.slice(0, 512).includes("삭제는"));
  assert.ok(SERVER_INSTRUCTIONS.slice(0, 512).includes("확인"));
  const h = { listTools: () => [], callTool: async () => ({ content: [] }) };
  const init: any = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, h);
  assert.equal(init.result.instructions, SERVER_INSTRUCTIONS);
});
