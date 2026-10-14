import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "./database.types.ts";

export type Db = SupabaseClient<Database>;

const need = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`환경변수 ${name} 가 없습니다.`);
  return v;
};

/**
 * service role 클라이언트. RLS 를 우회하므로 모든 쿼리에 대상 user_id 조건을 직접 넣어야 한다.
 * (MCP·동기화·알림 등 사용자 JWT 없이 도는 코드 전용. 이 키는 어디에도 반환·로그하지 않는다.)
 */
export function adminClient(): Db {
  return createClient<Database>(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 호출자의 JWT 로 동작하는 클라이언트. RLS 가 적용된다. */
export function userClient(req: Request): Db {
  return createClient<Database>(need("SUPABASE_URL"), Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? need("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
