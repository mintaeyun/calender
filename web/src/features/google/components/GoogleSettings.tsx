"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimezone } from "@/lib/profile";
import { useGoogleActions, useGoogleCalendars, useGoogleConnection } from "../hooks";
import { classifyGoogleError, lastSyncedLabel, oauthReturnMessage } from "../lib/errors";

const card = "flex flex-col gap-[18px] rounded-[22px] bg-surface p-6";
const primaryBtn = "rounded-full bg-fg px-[18px] py-2.5 text-sm font-semibold text-bg disabled:opacity-50";
const ghostBtn = "rounded-full border border-border-strong px-[18px] py-2.5 text-sm disabled:opacity-50";

function Panel() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tz = useTimezone();
  const conn = useGoogleConnection();
  const calendars = useGoogleCalendars(Boolean(conn.data));
  const act = useGoogleActions();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [deleteEvents, setDeleteEvents] = useState(false);
  const [confirmTwoWay, setConfirmTwoWay] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const handled = useRef(false);

  // OAuth 에서 돌아온 직후: 결과 안내 + 연결 성공이면 첫 동기화 시작, 그다음 주소의 ?google= 제거
  useEffect(() => {
    const status = params.get("google");
    if (!status || handled.current) return;
    handled.current = true;
    setNotice(oauthReturnMessage(status));
    if (status === "connected") act.sync.mutate();
    router.replace(pathname, { scroll: false });
  }, [params, pathname, router, act.sync]);

  if (conn.isLoading) return <div className={card}><span className="text-sm text-fg-subtle">불러오는 중…</span></div>;

  const connection = conn.data;
  const errorInfo = classifyGoogleError(connection?.last_error);
  const busy = act.sync.isPending;
  const syncMsg = act.sync.data;

  if (!connection) {
    return (
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fg font-bold text-bg">G</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">Google 캘린더</span>
              <span className="text-[13px] text-fg-subtle">연결되지 않음</span>
            </div>
          </div>
          <button className={primaryBtn} disabled={act.connect.isPending} onClick={() => act.connect.mutate()}>
            {act.connect.isPending ? "이동 중…" : "Google 계정 연결"}
          </button>
        </div>
        {notice && <p role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-lime-ink" : "text-danger-ink"}`}>{notice.text}</p>}
        {act.connect.isError && <p role="alert" className="text-sm text-danger-ink">{(act.connect.error as Error).message}</p>}
        <p className="rounded-[14px] bg-surface-3 px-4 py-3.5 text-[13px] leading-relaxed text-fg-muted">
          Google 캘린더의 일정을 앱으로 가져옵니다(가져오기 전용). 연결하면 과거 1개월 ~ 미래 1년의 일정이 들어오고, 이후 변경·삭제는 15분마다 또는 앱을 열 때 반영돼요.
          요청하는 권한은 캘린더 일정 읽기·쓰기와 캘린더 목록 읽기뿐이며, 할일·가계부는 동기화하지 않아요.
        </p>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fg font-bold text-bg">G</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">{connection.google_email}</span>
            <span className="text-[13px]" style={{ color: errorInfo ? "var(--danger-ink)" : "var(--lime-ink)" }}>
              {errorInfo ? "오류" : "연결됨"} · 마지막 동기화 {lastSyncedLabel(connection.last_synced_at, new Date(), tz)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={primaryBtn} disabled={busy} onClick={() => act.sync.mutate()}>{busy ? "동기화 중…" : "지금 동기화"}</button>
          <button className={`${ghostBtn} text-danger-ink`} onClick={() => setConfirmDisconnect(true)}>연결 해제</button>
        </div>
      </div>

      {notice && <p role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-lime-ink" : "text-danger-ink"}`}>{notice.text}</p>}
      {act.sync.isError && <p role="alert" className="text-sm text-danger-ink">{(act.sync.error as Error).message}</p>}
      {syncMsg && syncMsg.status === "partial" && <p role="status" className="text-sm text-fg-muted">일정이 많아 일부만 가져왔어요. 다시 동기화하면 이어서 가져옵니다.</p>}
      {syncMsg && syncMsg.status === "locked" && <p role="status" className="text-sm text-fg-muted">이미 동기화 중이에요. 잠시 후 다시 확인해 주세요.</p>}
      {syncMsg && syncMsg.status === "no_calendars" && <p role="status" className="text-sm text-fg-muted">동기화할 캘린더를 아래에서 선택해 주세요.</p>}

      {errorInfo && (
        <div role="alert" className="flex flex-col gap-2 rounded-[14px] border border-danger/50 bg-surface-3 px-4 py-3.5">
          <span className="text-sm font-semibold text-danger-ink">{errorInfo.title}</span>
          <span className="text-[13px] leading-relaxed text-fg-muted">{errorInfo.hint}</span>
          {errorInfo.reconnect && (
            <button className={`${primaryBtn} w-fit`} disabled={act.connect.isPending} onClick={() => act.connect.mutate()}>다시 연결</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5 border-t border-border pt-4">
        <span className="text-sm font-semibold">동기화 방향</span>
        <div role="radiogroup" aria-label="동기화 방향" className="flex w-fit rounded-full bg-surface-3 p-1">
          {([["import_only", "가져오기만"], ["two_way", "양방향"]] as const).map(([k, label]) => (
            <button
              key={k}
              role="radio"
              aria-checked={connection.sync_direction === k}
              disabled={act.setDirection.isPending}
              onClick={() => {
                if (connection.sync_direction === k) return;
                if (k === "two_way") setConfirmTwoWay(true);
                else act.setDirection.mutate("import_only");
              }}
              className={`rounded-full px-4 py-[7px] text-sm ${connection.sync_direction === k ? "bg-surface-5 font-semibold text-fg" : "text-fg-subtle"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {act.setDirection.isError && <p role="alert" className="text-sm text-danger-ink">{(act.setDirection.error as Error).message}</p>}
        {connection.sync_direction === "two_way" ? (
          <>
            <span className="text-[13px] text-fg-subtle">
              앱에서 만들고 수정·삭제한 일정이 Google의 mycal 캘린더에 반영되고, Google에서 바뀐 일정도 앱으로 가져옵니다. 같은 일정을 양쪽에서 고치면 나중에 수정한 쪽을 채택하고, 덮어쓴 내용은 기록에 남겨요.
            </span>
            <label className="mt-1 flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={connection.push_local}
                disabled={act.setPushLocal.isPending}
                onChange={(e) => act.setPushLocal.mutate(e.target.checked)}
                className="h-[18px] w-[18px] accent-[var(--lime)]"
              />
              앱의 모든 일정(업무·개인·운동 등)을 Google mycal 에도 만들기
            </label>
            <span className="text-xs text-fg-dim">끄면 앱에서 새로 만든 일정은 Google에 보내지 않고, 이미 Google과 연결된 일정의 변경만 반영해요.</span>
          </>
        ) : (
          <span className="text-[13px] text-fg-subtle">Google 일정을 앱으로 가져오기만 합니다. 앱에서 만든 일정은 Google에 반영되지 않아요.</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">동기화할 캘린더 (mycal)</span>
          <button className="text-[13px] text-fg-subtle hover:text-fg" disabled={act.refreshList.isPending} onClick={() => act.refreshList.mutate()}>
            {act.refreshList.isPending ? "불러오는 중…" : "목록 새로고침"}
          </button>
        </div>
        {act.refreshList.isError && <p role="alert" className="text-sm text-danger-ink">{(act.refreshList.error as Error).message}</p>}
        {calendars.data?.length === 0 && (
          <p role="status" className="rounded-xl bg-surface-3 px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
            Google 캘린더에서 이름이 <b>mycal</b> 인 캘린더를 찾지 못했어요. Google 캘린더에서 mycal 캘린더를 만들거나 이름을 확인한 뒤 '목록 새로고침'을 눌러 주세요. 이 앱은 mycal 캘린더 하나만 연동합니다.
          </p>
        )}
        {calendars.data?.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm" style={{ color: c.sync_enabled ? undefined : "var(--fg-subtle)" }}>
            <input
              type="checkbox"
              checked={c.sync_enabled}
              disabled={act.toggleCalendar.isPending}
              onChange={(e) => act.toggleCalendar.mutate({ id: c.id, enabled: e.target.checked }, { onSuccess: () => { if (e.target.checked) act.sync.mutate(); } })}
              className="h-[18px] w-[18px] accent-[var(--lime)]"
            />
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />
            {c.name}
            <span className="ml-auto text-xs text-fg-subtle">{c.read_only ? "읽기 전용 · " : ""}{c.event_count}개 일정</span>
          </label>
        ))}
      </div>

      <p className="rounded-[14px] bg-surface-3 px-4 py-3.5 text-[13px] leading-relaxed text-fg-muted">
        주기 동기화 15분 · 앱 진입 시 자동. 할일·가계부는 동기화하지 않습니다. 캘린더를 끄면 이후 변경은 반영되지 않고, 이미 가져온 일정은 그대로 남아요.
      </p>

      {confirmTwoWay && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label="양방향 동기화 확인" onClick={() => setConfirmTwoWay(false)}>
          <div className="flex w-[440px] max-w-full flex-col gap-4 rounded-[28px] border border-surface-4 bg-surface-modal p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-[22px]">양방향 동기화를 켤까요?</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-fg-muted">
              <li>앱에서 만든 일정이 <b className="text-fg">Google의 mycal 캘린더에 생성</b>됩니다.</li>
              <li>앱에서 수정한 내용이 Google에 반영되고, <b className="text-fg">앱에서 삭제한 일정은 Google에서도 삭제</b>됩니다.</li>
              <li>같은 일정을 양쪽에서 고치면 나중에 수정한 쪽을 채택합니다.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button className={ghostBtn} onClick={() => setConfirmTwoWay(false)}>취소</button>
              <button
                className={primaryBtn}
                disabled={act.setDirection.isPending}
                onClick={() => act.setDirection.mutate("two_way", { onSuccess: () => { setConfirmTwoWay(false); act.sync.mutate(); } })}
              >
                양방향으로 전환
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDisconnect && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" onClick={() => setConfirmDisconnect(false)}>
          <div className="flex w-[420px] max-w-full flex-col gap-4 rounded-[28px] border border-surface-4 bg-surface-modal p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-[22px]">Google 연결을 해제할까요?</h2>
            <p className="text-sm text-fg-muted">저장된 토큰을 즉시 삭제하고 Google 쪽 접근 권한도 취소합니다.</p>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={deleteEvents} onChange={(e) => setDeleteEvents(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--lime)]" />
              가져온 일정도 앱에서 삭제 (기본: 유지)
            </label>
            {act.disconnect.isError && <p role="alert" className="text-sm text-danger-ink">{(act.disconnect.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button className={ghostBtn} onClick={() => setConfirmDisconnect(false)}>취소</button>
              <button
                className="rounded-full bg-danger px-6 py-[11px] text-sm font-bold text-on-accent disabled:opacity-50"
                disabled={act.disconnect.isPending}
                onClick={() => act.disconnect.mutate(deleteEvents, { onSuccess: () => { setConfirmDisconnect(false); setDeleteEvents(false); } })}
              >
                {act.disconnect.isPending ? "해제 중…" : "연결 해제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 설정 > Google 캘린더 탭 (GCAL-1, 2, 5, 8, 10). 08 의 SettingsShell 이 배치한다. */
export function GoogleSettings() {
  return (
    <Suspense>
      <Panel />
    </Suspense>
  );
}
