"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth";

/** 비밀번호 재설정 메일 링크(/auth/callback 을 거쳐 로그인된 상태)로 들어와 새 비밀번호를 정한다. */
export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    window.location.assign("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-10">
      <form onSubmit={onSubmit} className="flex w-[420px] max-w-full flex-col gap-[18px] rounded-[28px] border border-border bg-[#141416] px-9 py-10">
        <h1 className="font-display text-[26px] leading-[1.3]">새 비밀번호</h1>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-fg-muted">새 비밀번호 (6자 이상)</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[14px] border-0 bg-[#1f1f23] px-4 py-3.5 text-[15px] text-fg outline-none focus:ring-2 focus:ring-lime/60"
          />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-white p-[15px] text-[15px] font-bold text-black disabled:opacity-50">
          {busy ? "처리 중…" : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
