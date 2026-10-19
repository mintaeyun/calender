// OAuth Store 의 Supabase(service role) 구현. 코드·토큰은 비밀값의 해시로만 조회한다.
// 사용자 소유 조건(user_id)이 필요한 곳은 없다: 모든 조회 키가 256비트 비밀값의 해시이고, 행에 user_id 가 들어 있어 이후 호출이 그 사용자로 실행된다.
import type { Client, CodeRow, NewToken, Rotation, Store, TokenRow } from "./oauth-flow.ts";

// deno-lint-ignore no-explicit-any
type AnyDb = any;

const TOKEN_COLS = "id,user_id,client_id,scopes,revoked_at,refresh_hash,prev_refresh_hash,refresh_expires_at,client_name";

function fail(what: string, error: unknown): never {
  console.error(`oauth ${what} 실패`, error);
  throw new Error(`oauth store: ${what}`);
}

export function supabaseOAuthStore(db: AnyDb): Store {
  return {
    async countClients() {
      const { count, error } = await db.from("oauth_clients").select("id", { count: "exact", head: true });
      if (error) fail("countClients", error);
      return count ?? 0;
    },
    async insertClient(c) {
      const { data, error } = await db.from("oauth_clients").insert(c).select("id,client_name,redirect_uris,created_at").single();
      if (error) fail("insertClient", error);
      return data;
    },
    async getClient(id): Promise<Client | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // uuid 가 아니면 쿼리하지 않는다
      const { data, error } = await db.from("oauth_clients").select("id,client_name,redirect_uris").eq("id", id).maybeSingle();
      if (error) fail("getClient", error);
      return data;
    },
    async touchClient(id) {
      await db.from("oauth_clients").update({ last_used_at: new Date().toISOString() }).eq("id", id);
    },
    async insertCode(c) {
      const { error } = await db.from("oauth_codes").insert(c);
      if (error) fail("insertCode", error);
    },
    async consumeCode(hash, now) {
      const { data, error } = await db.from("oauth_codes").update({ used_at: now.toISOString() }).eq("code_hash", hash).is("used_at", null).select().maybeSingle();
      if (error) fail("consumeCode", error);
      if (data) return { row: data as CodeRow, used: false };
      const { data: existing } = await db.from("oauth_codes").select().eq("code_hash", hash).maybeSingle();
      return existing ? { row: existing as CodeRow, used: true } : { row: null, used: false };
    },
    async attachTokenToCode(hash, tokenId) {
      await db.from("oauth_codes").update({ token_id: tokenId }).eq("code_hash", hash);
    },
    async insertToken(t: NewToken) {
      const { data, error } = await db.from("mcp_tokens").insert({ ...t, source: "oauth" }).select("id").single();
      if (error) fail("insertToken", error);
      return data.id as string;
    },
    async revokeToken(id) {
      const { error } = await db.from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
      if (error) fail("revokeToken", error);
    },
    async findByRefresh(hash): Promise<TokenRow | null> {
      const { data } = await db.from("mcp_tokens").select(TOKEN_COLS).eq("refresh_hash", hash).maybeSingle();
      return data;
    },
    async findByPrevRefresh(hash): Promise<TokenRow | null> {
      const { data } = await db.from("mcp_tokens").select(TOKEN_COLS).eq("prev_refresh_hash", hash).limit(1).maybeSingle();
      return data;
    },
    async findByAccess(hash): Promise<TokenRow | null> {
      const { data } = await db.from("mcp_tokens").select(TOKEN_COLS).eq("token_hash", hash).maybeSingle();
      return data;
    },
    async rotate(id, expected, next: Rotation) {
      const { data, error } = await db.from("mcp_tokens").update(next).eq("id", id).eq("refresh_hash", expected).is("revoked_at", null).select("id");
      if (error) fail("rotate", error);
      return (data?.length ?? 0) === 1;
    },
  };
}
