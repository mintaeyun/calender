// OAuth 2.1 엔드포인트 (함수 경로 아래): 메타데이터, 클라이언트 등록, 인가 승인(웹 동의 화면이 호출), 토큰, 폐기.
// 동의 화면 자체는 웹 앱(/oauth/authorize)이고, 이 파일은 그 화면이 호출하는 승인 API와 표준 엔드포인트만 담당한다.
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { adminClient } from "../_shared/supabase.ts";
import { exchangeCode, refreshGrant, registerClient, revoke, authorize } from "./lib/oauth-flow.ts";
import { supabaseOAuthStore } from "./lib/oauth-store.ts";
import { NO_STORE, OAuthError, protectedResourceMetadata } from "./lib/oauth.ts";

export type OAuthEnv = { fnBase: string; appBase: string };

/** 함수 기준 주소(리소스)와 웹 앱 주소(발급자). 둘 다 슬래시로 끝나지 않는다. */
export function oauthEnv(): OAuthEnv {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const appBase = (Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  return { fnBase: `${supabaseUrl}/functions/v1/mcp`, appBase };
}

export const metadataUrl = (env: OAuthEnv) => `${env.fnBase}/.well-known/oauth-protected-resource`;

/** 401 응답 헤더: 클라이언트가 메타데이터 위치를 알 수 있게 한다(함수 경로 아래라 호스트 루트 well-known 을 쓸 수 없음). */
export function challengeHeader(env: OAuthEnv, invalidToken: boolean): string {
  return `Bearer resource_metadata="${metadataUrl(env)}"${invalidToken ? ', error="invalid_token"' : ""}`;
}

const errBody = (e: OAuthError) => ({ error: e.code, error_description: e.message });

async function readParams(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return await req.json().catch(() => ({}));
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

/** 처리 대상 경로가 아니면 null. */
export async function oauthRoute(req: Request, path: string, env: OAuthEnv): Promise<Response | null> {
  try {
    if (path.startsWith("/.well-known/oauth-protected-resource") && req.method === "GET") {
      return json(protectedResourceMetadata(env.fnBase, env.appBase), 200, { "Cache-Control": "public, max-age=300" });
    }

    const store = supabaseOAuthStore(adminClient());

    if (path === "/register" && req.method === "POST") {
      return json(await registerClient(store, await readParams(req)), 201, NO_STORE);
    }

    if (path === "/token" && req.method === "POST") {
      const f = await readParams(req);
      if (f.grant_type === "authorization_code") return json(await exchangeCode(store, f), 200, NO_STORE);
      if (f.grant_type === "refresh_token") return json(await refreshGrant(store, f), 200, NO_STORE);
      throw new OAuthError("unsupported_grant_type", "authorization_code 또는 refresh_token 만 지원합니다.");
    }

    if (path === "/revoke" && req.method === "POST") {
      await revoke(store, await readParams(req));
      return new Response(null, { status: 200, headers: { ...corsHeaders, ...NO_STORE } });
    }

    // 동의 화면용: 앱 이름만 공개한다 (로그인 전에도 화면이 "누가 요청하는지" 보여줄 수 있게)
    if (path === "/oauth/client" && req.method === "GET") {
      const id = new URL(req.url).searchParams.get("client_id") ?? "";
      const c = await store.getClient(id);
      if (!c) throw new OAuthError("invalid_client", "등록되지 않은 앱입니다.", 404);
      return json({ client_name: c.client_name });
    }

    // 동의 화면의 승인/거절. 로그인한 사용자의 JWT 로만 가능하며 코드는 그 사용자(user_id)에 묶인다.
    if (path === "/oauth/authorize" && req.method === "POST") {
      const { userId } = await requireUser(req);
      const body = await req.json().catch(() => ({}));
      return json(await authorize(store, userId, body, { resourceUrl: env.fnBase }), 200, NO_STORE);
    }

    return null;
  } catch (e) {
    if (e instanceof OAuthError) return json(errBody(e), e.status, NO_STORE);
    throw e; // 그 외(예: 인증 실패 HttpError)는 index.ts 의 errorResponse 가 처리
  }
}
