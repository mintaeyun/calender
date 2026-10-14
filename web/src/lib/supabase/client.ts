import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** 브라우저(클라이언트 컴포넌트)용 supabase 클라이언트. 공개(publishable/anon) 키만 사용한다. */
export function createClient() {
  return createBrowserClient<Database>(
    SUPABASE_URL!,
    SUPABASE_KEY!,
  );
}

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL && SUPABASE_KEY);
