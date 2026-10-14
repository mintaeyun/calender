import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/** 로그인 없이 접근할 수 있는 경로 */
const PUBLIC_PATHS = ["/login", "/auth"];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

/**
 * 세션 갱신 + 접근 제어(AUTH-2).
 * 비로그인은 어느 경로든 /login 으로, 로그인 상태에서 /login 은 / 로 보낸다.
 * 환경변수가 없으면 접근을 열지 않고 /login 으로 보낸다(로그인 화면이 안내 문구를 보여준다).
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const redirect = (to: string) => {
    const dest = request.nextUrl.clone();
    dest.pathname = to;
    dest.search = "";
    return NextResponse.redirect(dest);
  };

  if (!url || !key) return isPublic(pathname) ? NextResponse.next() : redirect("/login");

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser()는 토큰을 서버에서 검증한다(getSession()은 쿠키를 그대로 믿으므로 가드에 쓰지 않는다).
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) return redirect("/login");
  if (user && pathname === "/login") return redirect("/");
  return response;
}
