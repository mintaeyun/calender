"use client";

import { useRouter } from "next/navigation";
import { useDeleteNotification, useMarkAllRead, useMarkRead, useNotifications } from "../hooks";
import { relativeTime, typeMeta } from "../lib/labels";
import { useTimezone } from "@/lib/profile";

/** 알림함(NOTI-4): 종류 칩·제목·본문·시각·읽지 않음 점, 모두 읽음, 개별 읽음/삭제. 클릭하면 링크로 이동하며 읽음 처리. */
export function NotificationInbox() {
  const router = useRouter();
  const tz = useTimezone();
  const { data = [], isLoading, isError, error } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const del = useDeleteNotification();
  const unread = data.filter((n) => !n.read_at).length;

  const open = (n: (typeof data)[number]) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[30px]">알림 <span className="text-fg-subtle">{unread ? `읽지 않음 ${unread}` : "모두 읽음"}</span></h1>
        <button onClick={() => markAll.mutate(undefined)} disabled={unread === 0} className="rounded-full border border-[color:var(--border-strong,#3a3a40)] px-[18px] py-2.5 text-sm disabled:opacity-40">모두 읽음</button>
      </div>
      {isError && <div className="text-sm text-danger">{(error as Error).message}</div>}
      <ul className="flex flex-col rounded-[22px] bg-surface px-[22px] py-2">
        {isLoading && <li className="p-10 text-center text-[color:var(--fg-dim,#6c6c73)]">불러오는 중…</li>}
        {data.map((n) => {
          const m = typeMeta(n.type);
          return (
            <li key={n.id} className={`flex flex-col gap-2 border-b border-border py-4 last:border-0 ${n.read_at ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                <button onClick={() => open(n)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span className="break-words text-[15px] font-semibold">{n.title}</span>
                  {n.body && <span className="break-words text-[13px] text-fg-subtle">{n.body}</span>}
                </button>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-lime"}`} role="img" aria-label={n.read_at ? "읽음" : "읽지 않음"} />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-fg-subtle">
                <span>{relativeTime(n.scheduled_at, new Date(), tz)}</span>
                <span className="flex gap-1">
                  {!n.read_at && <button onClick={() => markRead.mutate(n.id)} className="px-2 py-1.5">읽음 처리</button>}
                  <button onClick={() => del.mutate(n.id)} aria-label={`${n.title} 알림 삭제`} className="px-2 py-1.5 hover:text-danger">삭제</button>
                </span>
              </div>
            </li>
          );
        })}
        {!isLoading && data.length === 0 && <li className="p-10 text-center text-[15px] text-[color:var(--fg-dim,#6c6c73)]">새 알림이 없어요</li>}
      </ul>
    </div>
  );
}
