// Edge Function `notify`: pg_cron 이 5분마다 호출하는 알림 스캔. service role 키를 Bearer 로 보낸 내부 호출만 허용한다.
// 일정 시작·할일 마감·예산 80/100%·결제 예정·우천·동기화 오류 알림을 멱등하게 만들고, 웹 푸시를 보낸다.
import { requireServiceRole } from "../_shared/auth.ts";
import { handleCors, json } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { runScan } from "./lib/run.ts";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  try {
    requireServiceRole(req);
    const started = Date.now();
    const r = await runScan(adminClient());
    console.log(`notify: users=${r.users} created=${r.created} pushed=${r.pushed} errors=${r.errors.length} ${Date.now() - started}ms`);
    return json({ ok: r.errors.length === 0, ...r });
  } catch (e) {
    return errorResponse(e);
  }
});
