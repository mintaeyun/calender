// Edge Function `gcal-sync`: 구글 캘린더 가져오기 동기화.
// 경로(함수 이름 뒤): POST oauth/start · GET oauth/callback · GET|POST calendars · POST sync · POST sync-all · POST disconnect · GET health
// verify_jwt = false (config.toml): 콜백에는 Supabase JWT 가 없다. 경로별로 직접 인증한다.
//   start/calendars/sync/disconnect = 사용자 JWT, sync-all = service role 키, callback = 서명된 state.
// 필요한 secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENC_KEY(base64 32바이트), 선택: ALLOWED_RETURN_ORIGINS(쉼표 구분, 기본 http://localhost:3000)
import { requireServiceRole, requireUser } from "../_shared/auth.ts";
import { corsHeaders, handleCors, json } from "../_shared/cors.ts";
import { badRequest, errorResponse, HttpError, notFound } from "../_shared/errors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { keyRingFromEnv } from "./lib/crypto.ts";
import { DbStore } from "./lib/db.ts";
import { createGoogleApi } from "./lib/google.ts";
import { disconnect, oauthCallback, oauthStart, refreshCalendars, runSync, runSyncAll, type HandlerDeps } from "./lib/handlers.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, "not_configured", `서버 설정(${name})이 없습니다.`);
  return v;
}

function makeDeps(userId: string | null): { deps: HandlerDeps; store: DbStore } {
  const db = adminClient();
  const store = new DbStore(db, userId ?? "");
  const api = createGoogleApi({ clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") });
  const ring = keyRingFromEnv((n) => Deno.env.get(n));
  const now = () => new Date();
  const base = { api, events: store, conn: store, ring, now, budgetMs: 90_000 };
  const deps: HandlerDeps = {
    api, ring, now,
    redirectUri: `${env("SUPABASE_URL")}/functions/v1/gcal-sync/oauth/callback`,
    allowedReturnOrigins: (Deno.env.get("ALLOWED_RETURN_ORIGINS") ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
    admin: store,
    // sync-all 은 사용자마다 userId 가 다르므로 사용자별 DbStore 를 만든다.
    runDeps: (uid) => {
      const s = new DbStore(db, uid);
      return { ...base, events: s, conn: s };
    },
    syncBudgetMs: 90_000,
    syncAllBudgetMs: 100_000,
  };
  return { deps, store };
}

const redirect = (url: string) => new Response(null, { status: 302, headers: { ...corsHeaders, Location: url } });

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const route = parts.slice(parts.indexOf("gcal-sync") + 1).join("/");

    switch (route) {
      case "health":
        return json({ ok: true });

      case "oauth/start": {
        const { userId } = await requireUser(req);
        const body = await req.json().catch(() => ({})) as { return_to?: string };
        if (!body.return_to) throw badRequest("return_to 가 필요합니다.");
        const { deps } = makeDeps(userId);
        return json(await oauthStart(userId, body.return_to, deps));
      }

      case "oauth/callback": {
        const { deps } = makeDeps(null);
        const r = await oauthCallback(url.searchParams, deps);
        if ("redirect" in r) return redirect(r.redirect);
        return new Response(r.error, { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
      }

      case "calendars": {
        const { userId } = await requireUser(req);
        const { deps } = makeDeps(userId);
        return json(await refreshCalendars(userId, deps));
      }

      case "sync": {
        const { userId } = await requireUser(req);
        const { deps } = makeDeps(userId);
        return json(await runSync(userId, deps));
      }

      case "sync-all": {
        requireServiceRole(req);
        const { deps, store } = makeDeps(null);
        const all = await runSyncAll(deps, () => store.listConnectedUsers());
        return json({ users: all.users, processed: all.processed });
      }

      case "disconnect": {
        const { userId } = await requireUser(req);
        const body = await req.json().catch(() => ({})) as { delete_events?: boolean };
        const { deps } = makeDeps(userId);
        return json(await disconnect(userId, body.delete_events === true, deps));
      }

      default:
        throw notFound();
    }
  } catch (e) {
    return errorResponse(e);
  }
});
