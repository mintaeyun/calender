"use client";

import { useState, type FormEvent } from "react";
import { authErrorMessage, deleteAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const input = "rounded-[14px] border-0 bg-surface-3 px-4 py-3 text-[15px] text-fg outline-none focus:ring-2 focus:ring-lime/60";

/** 비밀번호 변경 (AUTH-3). 설정 > 프로필 탭(08)에 배치한다. */
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: authErrorMessage(error.message) });
    setPassword("");
    setMsg({ ok: true, text: "비밀번호를 변경했습니다." });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-fg-muted">새 비밀번호 (6자 이상)</span>
        <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </label>
      <button type="submit" disabled={busy} className="rounded-full bg-fg px-5 py-3 text-sm font-bold text-bg disabled:opacity-50">
        {busy ? "변경 중…" : "비밀번호 변경"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`w-full text-sm ${msg.ok ? "text-lime-ink" : "text-danger-ink"}`}>{msg.text}</p>}
    </form>
  );
}

/** 계정 삭제 (AUTH-3). 모든 데이터가 즉시 영구 삭제되므로 "삭제"를 직접 입력해야 활성화된다. */
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "계정을 삭제하지 못했습니다.");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-danger px-5 py-2.5 text-sm text-danger-ink">
        계정 삭제
      </button>
    );
  }
  return (
    <div className="flex max-w-md flex-col gap-3 rounded-2xl border border-danger/60 bg-surface p-4">
      <p className="text-sm text-fg-muted">
        일정 · 할일 · 가계부와 영수증 등 <b className="text-fg">모든 데이터가 즉시 영구 삭제</b>되며 되돌릴 수 없습니다. 계속하려면 &ldquo;삭제&rdquo;를 입력하세요.
      </p>
      <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="확인 문구" placeholder="삭제" className={input} />
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => { setOpen(false); setConfirm(""); }} disabled={busy} className="rounded-full border border-border-strong px-5 py-2.5 text-sm">취소</button>
        <button onClick={run} disabled={busy || confirm !== "삭제"} className="rounded-full bg-danger px-5 py-2.5 text-sm font-bold text-on-accent disabled:opacity-40">
          {busy ? "삭제 중…" : "영구 삭제"}
        </button>
      </div>
    </div>
  );
}
