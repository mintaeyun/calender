"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth";

type Mode = "signin" | "signup" | "forgot";

const input =
  "rounded-[14px] border-0 bg-[#1f1f23] px-4 py-3.5 text-[15px] text-fg outline-none focus:ring-2 focus:ring-lime/60";

const COPY: Record<Mode, { title: string; sub: string; submit: string }> = {
  signin: { title: "다시 오셨네요", sub: "일정 · 할일 · 가계부를 한곳에서", submit: "로그인" },
  signup: { title: "처음 오셨나요", sub: "이메일로 계정을 만듭니다", submit: "가입하기" },
  forgot: { title: "비밀번호 재설정", sub: "가입한 이메일로 재설정 링크를 보내드립니다", submit: "재설정 메일 보내기" },
};

function Form() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "로그인 처리에 실패했습니다. 다시 시도해 주세요." : null);
  const [info, setInfo] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const next = params.get("next");
  const callback = `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback } });
        if (error) throw error;
        if (data.session) window.location.assign("/");
        else setInfo("인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/update-password`,
        });
        if (error) throw error;
        setInfo("재설정 메일을 보냈습니다. 받은 메일함을 확인해 주세요.");
      }
    } catch (err) {
      setError(authErrorMessage(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback } });
    if (error) setError(authErrorMessage(error.message));
  }

  const c = COPY[mode];
  return (
    <div className="flex min-h-screen items-center justify-center p-10">
      <form
        onSubmit={onSubmit}
        className="flex w-[420px] max-w-full flex-col gap-[18px] rounded-[28px] border border-border bg-[#141416] px-9 py-10"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-purple" />
          <span className="font-display text-[21px]">라이프 매니저</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <h1 className="font-display text-[30px] leading-[1.3]">{c.title}</h1>
          <span className="text-[15px] text-fg-subtle">{c.sub}</span>
        </div>

        {!configured && (
          <p role="alert" className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-danger">
            Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다. web/.env.local 을 확인하세요.
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-fg-muted">이메일</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>

        {mode !== "forgot" && (
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between">
              <span className="text-[13px] text-fg-muted">비밀번호</span>
              {mode === "signin" && (
                <button type="button" onClick={() => switchMode("forgot")} className="text-[13px] text-fg-subtle hover:text-fg">
                  비밀번호 재설정
                </button>
              )}
            </span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {info && <p role="status" className="text-sm text-lime">{info}</p>}

        <button
          type="submit"
          disabled={busy || !configured}
          className="mt-1.5 rounded-full bg-white p-[15px] text-[15px] font-bold text-black disabled:opacity-50"
        >
          {busy ? "처리 중…" : c.submit}
        </button>

        {mode !== "forgot" && (
          <>
            <div className="flex items-center gap-3 text-xs text-[#6c6c73]">
              <div className="h-px flex-1 bg-border" />또는<div className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={onGoogle}
              disabled={!configured}
              className="flex items-center justify-center gap-2.5 rounded-full border border-[#3a3a40] p-3.5 text-[15px] disabled:opacity-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-black">G</span>
              Google로 계속하기
            </button>
          </>
        )}

        <div className="text-center text-sm text-fg-subtle">
          {mode === "signin" ? (
            <>계정이 없나요? <button type="button" onClick={() => switchMode("signup")} className="text-fg underline">가입하기</button></>
          ) : (
            <button type="button" onClick={() => switchMode("signin")} className="text-fg underline">로그인으로 돌아가기</button>
          )}
        </div>
        <span className="text-center text-xs text-[#6c6c73]">허용된 이메일만 가입할 수 있습니다</span>
      </form>
    </div>
  );
}

export function LoginForm() {
  // useSearchParams 는 Suspense 경계가 필요하다
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
