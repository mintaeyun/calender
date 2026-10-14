import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** 브라우저(클라이언트 컴포넌트)용 supabase 클라이언트. anon 키만 사용한다. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
