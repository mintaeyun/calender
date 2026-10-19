// MCP 토큰 발급·폐기·조회와 호출 이력. 토큰 원문은 발급 응답에서만 받을 수 있고 어디에도 저장하지 않는다.
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { normalizeScopes, serverUrl, type Scopes } from "./lib/mcp";

export type McpToken = { id: string; name: string; token_prefix: string | null; scopes: Scopes; last_used_at: string | null; created_at: string };
export type McpLog = { id: string; called_at: string; tool: string; input_summary: string | null; status: string; error: string | null };

export const MCP_URL = serverUrl(SUPABASE_URL);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!MCP_URL) throw new Error("Supabase 주소가 설정되지 않았어요");
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new Error("로그인이 필요해요");
  const res = await fetch(`${MCP_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `요청에 실패했어요 (${res.status})`);
  return body as T;
}

export async function listTokens(): Promise<McpToken[]> {
  const r = await call<{ tokens: (Omit<McpToken, "scopes"> & { scopes: unknown })[] }>("/tokens");
  return r.tokens.map((t) => ({ ...t, scopes: normalizeScopes(t.scopes) }));
}

/** 발급. 응답의 token(원문)은 이 호출에서만 받을 수 있다. */
export async function createToken(input: { name: string; scopes: Scopes }): Promise<McpToken & { token: string }> {
  const r = await call<McpToken & { token: string; scopes: unknown }>("/tokens", { method: "POST", body: JSON.stringify(input) });
  return { ...r, scopes: normalizeScopes(r.scopes) };
}

export async function revokeToken(id: string): Promise<void> {
  await call(`/tokens/${id}`, { method: "DELETE" });
}

/** 최근 호출 이력 (RLS: 본인 것만 읽기 가능) */
export async function listLogs(limit = 50): Promise<McpLog[]> {
  const { data, error } = await createClient()
    .from("mcp_logs").select("id,called_at,tool,input_summary,status,error").order("called_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
