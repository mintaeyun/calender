// MCP 서버 (Streamable HTTP, stateless). 경로: POST / = MCP, GET /health, POST·GET /tokens, DELETE /tokens/:id (사용자 JWT).
// verify_jwt = false (config.toml): MCP 는 자체 토큰(lm_…)으로 인증하고, 그 검증이 모든 요청의 첫 단계다.
import { corsHeaders, handleCors, json } from "../_shared/cors.ts";
import { badRequest, errorResponse, HttpError, notFound } from "../_shared/errors.ts";
import { requireUser } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabase.ts";
import { DEFAULT_TIMEZONE } from "../_shared/time.ts";
import { generateToken, parseBearer, safeEqual, sha256Hex } from "./lib/token.ts";
import { scoped } from "./lib/scoped.ts";
import { decideRate } from "./lib/rate-limit.ts";
import { handleRpc, type RpcResponse } from "./lib/protocol.ts";
import { callTool, summarizeInput, type ToolHandler } from "./lib/dispatch.ts";
import { validate, type Schema } from "./lib/validate.ts";
import { visibleTools, type Scopes } from "./lib/tools-schema.ts";
import type { Ctx, WeatherAccess } from "./tools/context.ts";
import { listTodos } from "./tools/todos.ts";
import { findFreeTimeTool, listEvents, searchEvents } from "./tools/events.ts";
import { createEvent, deleteEvent, updateEvent } from "./tools/events-write.ts";
import { completeTodo, createTodo, deleteTodo, updateTodo } from "./tools/todos-write.ts";
import { addTransaction, deleteTransaction, updateTransaction } from "./tools/ledger-write.ts";
import { getTodayOverview, getWeather } from "./tools/weather.ts";
import { createProvider, dbCacheStore } from "../weather/deps.ts";
import { getForecast } from "../weather/service.ts";
import { getSummary, listAccounts, listTransactions } from "./tools/ledger.ts";

// tools-schema.ts 의 모든 도구가 여기에 등록되어야 한다(handlers.test.ts 가 확인).
const HANDLERS: Record<string, ToolHandler<Ctx>> = {
  list_events: listEvents,
  search_events: searchEvents,
  find_free_time: findFreeTimeTool,
  create_event: createEvent,
  update_event: updateEvent,
  delete_event: deleteEvent,
  create_todo: createTodo,
  update_todo: updateTodo,
  complete_todo: completeTodo,
  delete_todo: deleteTodo,
  add_transaction: addTransaction,
  update_transaction: updateTransaction,
  delete_transaction: deleteTransaction,
  get_weather: getWeather,
  get_today_overview: getTodayOverview,
  list_todos: listTodos,
  list_transactions: listTransactions,
  get_summary: getSummary,
  list_accounts: listAccounts,
};

const LEVELS = ["none", "read", "write"];
function normalizeScopes(raw: unknown): Scopes {
  const o = (typeof raw === "object" && raw ? raw : {}) as Record<string, unknown>;
  const pick = (k: string) => (LEVELS.includes(o[k] as string) ? (o[k] as "none" | "read" | "write") : "none");
  return { calendar: pick("calendar"), todo: pick("todo"), ledger: pick("ledger") };
}

const rpcHeaders = { "WWW-Authenticate": 'Bearer realm="life-manager"' };
// 날씨는 05 의 provider·캐시를 재사용한다(요청 시점에 생성해 환경변수 오류가 다른 도구에 영향을 주지 않게 함).
const weatherAccess: WeatherAccess = {
  forecast: (lat, lon) => getForecast({ provider: createProvider(), store: dbCacheStore() }, lat, lon),
  geocode: (q) => createProvider().geocode(q),
};

const reject401 = () => json({ error: { code: "unauthorized", message: "유효하지 않은 토큰입니다." } }, 401, rpcHeaders);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  try {
    const path = new URL(req.url).pathname.replace(/^\/(functions\/v1\/)?mcp/, "").replace(/\/+$/, "") || "/";
    if (path === "/health") return json({ ok: true });
    if (path === "/tokens" || path.startsWith("/tokens/")) return await tokenRoutes(req, path);
    if (path !== "/") throw notFound();
    if (req.method !== "POST") {
      // 서버 발신 스트림(SSE)은 제공하지 않는다. stateless JSON 응답만.
      return new Response("Method Not Allowed", { status: 405, headers: { ...corsHeaders, Allow: "POST, OPTIONS" } });
    }
    return await mcpRoute(req);
  } catch (e) {
    return errorResponse(e);
  }
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------
async function mcpRoute(req: Request): Promise<Response> {
  // 1) 토큰 인증 — 가장 먼저. 실패 사유는 노출하지 않는다.
  const raw = parseBearer(req.headers.get("Authorization"));
  if (!raw) return reject401();
  const admin = adminClient();
  const hash = await sha256Hex(raw);
  const { data: tok } = await admin
    .from("mcp_tokens")
    .select("id,user_id,token_hash,scopes,revoked_at")
    .eq("token_hash", hash) // 토큰 해시 조회만 user_id 조건 없이 허용되는 유일한 쿼리
    .maybeSingle();
  if (!tok || !safeEqual(tok.token_hash, hash) || tok.revoked_at) return reject401();

  const userId: string = tok.user_id;
  const scopes = normalizeScopes(tok.scopes);
  const db = scoped(admin, userId);

  // 2) 호출 제한(분당 60회): 최근 60초의 mcp_logs 수 + 이번 호출
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("mcp_logs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("token_id", tok.id).gte("called_at", since);
  const rate = decideRate((count ?? 0) + 1, new Date());

  const writeLog = async (tool: string, status: string, input: string, error?: string, ms?: number) => {
    try { // 로그 실패가 응답을 막지 않는다
      await admin.from("mcp_logs").insert({
        user_id: userId, token_id: tok.id, tool, input_summary: input || null, status, error: error?.slice(0, 300) ?? null, duration_ms: ms ?? null,
      });
    } catch (e) {
      console.error("mcp_logs 기록 실패", e);
    }
  };

  if (!rate.allowed) {
    await writeLog("(rate_limit)", "rate_limited", "", rate.message);
    return json({ error: { code: "rate_limited", message: rate.message } }, 429, { "Retry-After": String(rate.retryAfterSec) });
  }

  admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id).eq("user_id", userId)
    .then(() => {}, () => {});

  // 사용자 시간대
  const prof = await db.select("profiles", "timezone").maybeSingle();
  const ctx: Ctx = { db, tz: prof?.data?.timezone ?? DEFAULT_TIMEZONE, scopes, weather: weatherAccess };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON 을 해석할 수 없습니다." } }, 400);
  }

  const handlers = {
    listTools: () => visibleTools(scopes).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    callTool: async (name: string, args: unknown) => {
      const t0 = Date.now();
      const out = await callTool(name, args, scopes, ctx, HANDLERS);
      await writeLog(name, out.status, summarizeInput(args), out.error, Date.now() - t0);
      return out.result;
    },
  };

  const msgs = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(msgs.map((m) => handleRpc(m, handlers)))).filter((r): r is RpcResponse => r !== null);
  if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders });
  return json(Array.isArray(body) ? responses : responses[0]);
}

// ---------------------------------------------------------------------------
// 토큰 발급·조회·폐기 (사용자 JWT 인증)
// ---------------------------------------------------------------------------
const CREATE_SCHEMA: Schema = {
  type: "object", additionalProperties: false, required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 60 },
    scopes: {
      type: "object", additionalProperties: false,
      properties: {
        calendar: { type: "string", enum: LEVELS }, todo: { type: "string", enum: LEVELS }, ledger: { type: "string", enum: LEVELS },
      },
    },
  },
};

async function tokenRoutes(req: Request, path: string): Promise<Response> {
  const { userId, db } = await requireUser(req);
  const admin = adminClient();

  if (path === "/tokens" && req.method === "GET") {
    const { data, error } = await db
      .from("mcp_tokens").select("id,name,token_prefix,scopes,last_used_at,revoked_at,created_at")
      .is("revoked_at", null).order("created_at", { ascending: false });
    if (error) throw new HttpError(500, "internal", "토큰 목록을 불러오지 못했습니다.");
    return json({ tokens: data });
  }

  if (path === "/tokens" && req.method === "POST") {
    const input = await req.json().catch(() => null);
    const problems = validate(CREATE_SCHEMA, input);
    if (problems.length) throw badRequest("입력이 올바르지 않습니다.", problems);
    const scopes = normalizeScopes({ calendar: "read", todo: "read", ledger: "read", ...(input.scopes ?? {}) });
    const t = await generateToken();
    const { data, error } = await admin
      .from("mcp_tokens")
      .insert({ user_id: userId, name: input.name.trim(), token_hash: t.hash, token_prefix: t.prefix, scopes })
      .select("id,name,token_prefix,scopes,created_at").single();
    if (error) throw new HttpError(500, "internal", "토큰을 발급하지 못했습니다.");
    // 원문은 이 응답에서만 1회 반환한다.
    return json({ token: t.raw, ...data }, 201, { "Cache-Control": "no-store" });
  }

  const m = /^\/tokens\/([0-9a-f-]{36})$/i.exec(path);
  if (m && req.method === "DELETE") {
    const { data, error } = await admin
      .from("mcp_tokens").update({ revoked_at: new Date().toISOString() })
      .eq("id", m[1]).eq("user_id", userId).is("revoked_at", null).select("id");
    if (error) throw new HttpError(500, "internal", "토큰을 폐기하지 못했습니다.");
    if (!data?.length) throw notFound("폐기할 토큰을 찾을 수 없습니다.");
    return json({ revoked: true });
  }

  throw notFound();
}
