"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Seg } from "@/features/settings/components/Seg";
import { MCP_URL } from "../api";
import { LEVELS, SERVICES, hasAnyAccess, type Level, type Scopes } from "../lib/mcp";
import { approvalBody, parseAuthorizeQuery, redirectHost, scopeSummary } from "../lib/oauth";

type Phase = "loading" | "login" | "ready" | "working";

/** OAuth 동의 화면: Claude·ChatGPT 같은 앱이 내 일정·할일·가계부에 접근하도록 허용할지 정하고 서비스별 범위를 고른다. */
export function OAuthConsent() {
  const params = useSearchParams();
  const parsed = parseAuthorizeQuery(new URLSearchParams(params.toString()));
  const [phase, setPhase] = useState<Phase>("loading");
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(parsed.ok ? null : parsed.error);
  // 처음엔 읽기 전용을 권장한다. 쓰기는 사용자가 직접 올려야 한다.
  const [scopes, setScopes] = useState<Scopes>({ calendar: "read", todo: "read", ledger: "read" });

  useEffect(() => {
    if (!parsed.ok) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient().auth.getSession();
      if (cancelled) return;
      if (!data.session) return setPhase("login");
      try {
        const res = await fetch(`${MCP_URL}/oauth/client?client_id=${encodeURIComponent(parsed.request.client_id)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error_description ?? "등록되지 않은 앱이에요.");
        if (!cancelled) setClientName(body.client_name);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setPhase("ready");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  async function decide(decision: "approve" | "deny") {
    if (!parsed.ok) return;
    setPhase("working");
    setError(null);
    try {
      const { data } = await createClient().auth.getSession();
      const res = await fetch(`${MCP_URL}/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify(approvalBody(parsed.request, scopes, decision)),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error_description ?? body?.error?.message ?? "승인에 실패했어요.");
      window.location.assign(body.redirect);
    } catch (e) {
      setError((e as Error).message);
      setPhase("ready");
    }
  }

  const host = parsed.ok ? redirectHost(parsed.request.redirect_uri) : null;
  const card = "mx-auto flex w-full max-w-[520px] flex-col gap-5 rounded-[24px] bg-surface p-7";

  if (!parsed.ok) return <div className={card}><h1 className="text-xl font-semibold">연결할 수 없어요</h1><p role="alert" className="text-sm text-danger-ink">{error}</p></div>;

  if (phase === "login") {
    const next = `/oauth/authorize?${params.toString()}`;
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold">로그인이 필요해요</h1>
        <p className="text-sm text-fg-muted">앱 연결을 승인하려면 먼저 라이프 매니저에 로그인하세요.</p>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="w-fit rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:no-underline">로그인하고 계속</a>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold"><span className="text-lime-ink">{clientName ?? "앱"}</span>이(가) 연결을 요청해요</h1>
        <p className="text-sm text-fg-muted">내 일정·할일·가계부를 대신 읽고 기록할 수 있게 허용할지 정해 주세요. 허용 범위는 서비스별로 고를 수 있고, 언제든 설정 &gt; MCP 연결에서 끊을 수 있어요.</p>
      </div>

      <div className="flex flex-col gap-3" role="group" aria-label="허용 범위">
        {SERVICES.map(([k, label]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{label}</span>
            <Seg label={`${label} 권한`} value={scopes[k]} items={LEVELS} onChange={(v: Level) => setScopes({ ...scopes, [k]: v })} />
          </div>
        ))}
        <p className="text-xs text-fg-subtle">허용: {scopeSummary(scopes)}. 처음에는 <b>읽기</b>로 시작하는 것을 권해요. 삭제는 Claude·ChatGPT가 항상 먼저 확인을 물어요.</p>
        {!hasAnyAccess(scopes) && <p className="text-xs text-danger-ink">하나 이상의 서비스를 허용해야 연결할 수 있어요</p>}
      </div>

      {host && <p className="text-xs text-fg-subtle">승인하면 <b className="text-fg-muted">{host}</b>(으)로 돌아가요. 낯선 주소라면 승인하지 마세요.</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}

      <div className="flex justify-end gap-2">
        <button className="rounded-full bg-surface-3 px-4 py-2 text-sm" disabled={phase !== "ready"} onClick={() => decide("deny")}>거절</button>
        <button className="rounded-full bg-fg px-[18px] py-2.5 text-sm font-semibold text-bg disabled:opacity-40" disabled={phase !== "ready" || !hasAnyAccess(scopes) || !clientName} onClick={() => decide("approve")}>
          {phase === "working" ? "처리 중…" : "허용하고 연결"}
        </button>
      </div>
    </div>
  );
}
