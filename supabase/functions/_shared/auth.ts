import { unauthorized } from "./errors.ts";
import { userClient, type Db } from "./supabase.ts";

/** Authorization: Bearer <JWT> 를 검증하고 사용자와 RLS 적용 클라이언트를 돌려준다. */
export async function requireUser(req: Request): Promise<{ userId: string; email: string | undefined; db: Db }> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw unauthorized();
  const db = userClient(req);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw unauthorized();
  return { userId: data.user.id, email: data.user.email, db };
}

/** pg_cron 등 내부 호출 검증: service role 키를 Bearer 로 보낸 요청만 통과. */
export function requireServiceRole(req: Request): void {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || req.headers.get("Authorization") !== `Bearer ${key}`) throw unauthorized("내부 호출만 허용됩니다.");
}
