import { authorizationServerMetadata } from "@/features/mcp/lib/oauth";
import { serverUrl } from "@/features/mcp/lib/mcp";
import { SUPABASE_URL } from "@/lib/supabase/env";

// 인가 서버 메타데이터(RFC 8414). 발급자(issuer)는 이 웹 앱의 주소이며, 함수의 APP_BASE_URL 과 같아야 한다.
// 승인 화면은 이 앱의 /oauth/authorize, 토큰·등록·폐기는 mcp 함수가 처리한다.
export function GET(request: Request) {
  const fnBase = serverUrl(SUPABASE_URL);
  if (!fnBase) return Response.json({ error: "server_error" }, { status: 500 });
  const issuer = new URL(request.url).origin;
  return Response.json(authorizationServerMetadata(issuer, fnBase), { headers: { "Cache-Control": "public, max-age=300" } });
}
