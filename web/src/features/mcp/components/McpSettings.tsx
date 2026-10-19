"use client";

import { useState } from "react";
import { Seg } from "@/features/settings/components/Seg";
import { useTimezone } from "@/lib/profile";
import { formatDateTimeKo } from "@/lib/time";
import { MCP_URL, type McpToken } from "../api";
import { ConnectGuide } from "./ConnectGuide";
import { useCreateToken, useMcpLogs, useMcpTokens, useRevokeToken } from "../hooks";
import {
  hasAnyAccess, LEVELS, LOG_STATUS, lastUsedLabel, levelLabel, RATE_LIMIT_PER_MIN, SERVICES, tokenHint,
  type Level, type Scopes,
} from "../lib/mcp";

const card = "flex flex-col gap-4 rounded-[22px] bg-surface p-6";
const btn = "rounded-full bg-surface-3 px-4 py-2 text-sm";
const primary = "rounded-full bg-fg px-[18px] py-2.5 text-sm font-semibold text-bg disabled:opacity-40";

/** 클립보드 복사 (실패하면 사용자가 직접 복사하도록 안내) */
function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  return (
    <button
      type="button"
      className={btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("done");
        } catch {
          setState("fail");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "done" ? "복사됨 ✓" : state === "fail" ? "직접 복사해 주세요" : label}
    </button>
  );
}

/** MCP 연결 설정(06): 서버 주소, 토큰 발급·폐기, 호출 이력 */
export function McpSettings() {
  const tokens = useMcpTokens();
  const logs = useMcpLogs();
  const revoke = useRevokeToken();
  const tz = useTimezone();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<McpToken | null>(null);

  return (
    <div className="flex flex-col gap-3.5">
      <section className={card} aria-labelledby="mcp-title">
        <div className="flex flex-col gap-1">
          <h2 id="mcp-title" className="text-lg font-semibold">MCP 연결 · Claude · ChatGPT</h2>
          <span className="text-[13px] text-fg-subtle">Claude와 ChatGPT에서 일정·할일·가계부를 말로 조회하고 기록합니다</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-3 px-3.5 py-3 text-sm" aria-label="서버 주소">{MCP_URL ?? "서버 주소를 알 수 없어요"}</code>
          {MCP_URL && <CopyButton value={MCP_URL} label="주소 복사" />}
        </div>
        <ConnectGuide url={MCP_URL} />
      </section>

      <section className={card} aria-labelledby="mcp-tokens">
        <div className="flex items-center justify-between">
          <h2 id="mcp-tokens" className="text-base font-semibold">연결 목록 {tokens.data ? `· ${tokens.data.length}개` : ""}</h2>
          <button className={primary} onClick={() => setCreating(true)}>새 토큰 발급</button>
        </div>
        {tokens.isLoading && <p className="text-sm text-fg-subtle">불러오는 중…</p>}
        {tokens.isError && <p role="alert" className="text-sm text-danger-ink">{(tokens.error as Error).message}</p>}
        {tokens.data?.length === 0 && <p className="text-sm text-fg-subtle">발급한 토큰이 없어요</p>}
        <ul className="flex flex-col divide-y divide-border">
          {tokens.data?.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
              <div className="flex min-w-[140px] flex-1 flex-col">
                <span className="font-semibold">{t.name}</span>
                <span className="text-xs text-fg-subtle">{t.source === "oauth" ? `OAuth 연결${t.client_name ? ` · ${t.client_name}` : ""}` : `직접 발급 ${tokenHint(t.token_prefix)}`} · {lastUsedLabel(t.last_used_at)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {SERVICES.map(([k, name]) => (
                  <span key={k} className={`rounded-full bg-surface-3 px-2.5 py-1 ${t.scopes[k] === "write" ? "text-lime-ink" : t.scopes[k] === "read" ? "text-fg-muted" : "text-fg-subtle opacity-60"}`}>
                    {name} {levelLabel(t.scopes[k])}
                  </span>
                ))}
              </div>
              <button className="rounded-full px-3 py-1.5 text-danger-ink" onClick={() => setRevoking(t)}>{t.source === "oauth" ? "연결 끊기" : "폐기"}</button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-subtle">호출 한도는 연결(토큰)당 분당 {RATE_LIMIT_PER_MIN}회입니다. 삭제는 항상 Claude가 먼저 확인을 묻고, 일괄 삭제는 지원하지 않습니다.</p>
      </section>

      <section className={card} aria-labelledby="mcp-logs">
        <h2 id="mcp-logs" className="text-base font-semibold">최근 호출</h2>
        {logs.isError && <p role="alert" className="text-sm text-danger-ink">호출 이력을 불러오지 못했어요.</p>}
        {logs.data?.length === 0 && <p className="text-sm text-fg-subtle">아직 호출 기록이 없어요</p>}
        <ul className="flex flex-col">
          {logs.data?.map((l) => {
            const st = LOG_STATUS[l.status] ?? { label: l.status, tone: "bad" as const };
            return (
              <li key={l.id} className="grid grid-cols-[110px_130px_1fr_auto] items-center gap-3 border-b border-border py-2 text-[13px] last:border-0 max-md:grid-cols-[1fr_auto]">
                <span className="text-fg-subtle max-md:hidden">{formatDateTimeKo(l.called_at, tz)}</span>
                <code className="truncate">{l.tool}</code>
                <span className="truncate text-fg-muted max-md:hidden" title={l.error ?? l.input_summary ?? ""}>{l.error ?? l.input_summary}</span>
                <span className={st.tone === "ok" ? "text-lime-ink" : "text-danger-ink"}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {creating && <CreateTokenModal onClose={() => setCreating(false)} />}
      {revoking && (
        <Modal title={revoking.source === "oauth" ? "연결 끊기" : "토큰 폐기"} onClose={() => setRevoking(null)}>
          <p className="text-sm"><b>{revoking.name}</b> {revoking.source === "oauth" ? "연결을 끊을까요?" : "토큰을 폐기할까요?"} 이 연결을 쓰는 앱은 즉시 접근할 수 없게 되고 되돌릴 수 없어요. 앱에서 다시 연결하면 새로 승인할 수 있어요.</p>
          {revoke.isError && <p role="alert" className="text-sm text-danger-ink">{(revoke.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setRevoking(null)}>취소</button>
            <button className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-on-accent" disabled={revoke.isPending}
              onClick={() => revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}>폐기</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label={title}
      onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="flex w-[480px] max-w-full flex-col gap-4 rounded-[24px] border border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function CreateTokenModal({ onClose }: { onClose: () => void }) {
  const create = useCreateToken();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scopes>({ calendar: "read", todo: "read", ledger: "read" });
  const [issued, setIssued] = useState<string | null>(null);
  const valid = name.trim().length > 0 && hasAnyAccess(scopes);

  // 발급 후: 원문은 이 화면에서만 볼 수 있다. 닫으면 다시 볼 수 없다.
  if (issued) {
    return (
      <Modal title="토큰이 발급되었어요" onClose={onClose}>
        <p className="text-sm text-danger-ink">지금 복사해 두세요. 이 창을 닫으면 토큰을 다시 볼 수 없어요.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-surface-3 px-3.5 py-3 text-xs" data-testid="issued-token">{issued}</code>
          <CopyButton value={issued} />
        </div>
        <p className="text-xs text-fg-subtle">Claude 커넥터의 요청 헤더에는 <code>Bearer {issued.slice(0, 7)}…</code> 형태로 입력합니다.</p>
        <div className="flex justify-end"><button className={primary} onClick={onClose}>복사했어요, 닫기</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="새 토큰 발급" onClose={onClose}>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-fg-subtle">이름 (어디서 쓰는지 알 수 있게)</span>
        <input autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: Claude 데스크톱"
          className="rounded-xl bg-surface-3 px-3.5 py-3" />
      </label>
      <div className="flex flex-col gap-3">
        <span className="text-sm text-fg-subtle">서비스별 권한</span>
        {SERVICES.map(([k, label]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{label}</span>
            <Seg label={`${label} 권한`} value={scopes[k]} items={LEVELS} onChange={(v: Level) => setScopes({ ...scopes, [k]: v })} />
          </div>
        ))}
        {!hasAnyAccess(scopes) && <span className="text-xs text-danger-ink">하나 이상의 서비스에 권한을 주세요</span>}
      </div>
      {create.isError && <p role="alert" className="text-sm text-danger-ink">{(create.error as Error).message}</p>}
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={onClose}>취소</button>
        <button className={primary} disabled={!valid || create.isPending}
          onClick={() => create.mutate({ name: name.trim(), scopes }, { onSuccess: (r) => setIssued(r.token) })}>
          {create.isPending ? "발급 중…" : "발급"}
        </button>
      </div>
    </Modal>
  );
}
