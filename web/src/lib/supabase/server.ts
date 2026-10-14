import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** 서버 컴포넌트·Route Handler·Server Action용 클라이언트(쿠키 세션). 서비스 롤 키는 쓰지 않는다. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 미들웨어가 한다.
          }
        },
      },
    },
  );
}
