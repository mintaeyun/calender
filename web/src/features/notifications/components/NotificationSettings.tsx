"use client";

import { useState } from "react";
import { useNotificationSettings, useUpdateNotificationSettings } from "../hooks";
import { groupEnabled, hhmm, SETTING_GROUPS, toggleGroup, type NotificationType } from "../lib/labels";
import { pushSupported, subscribePush, unsubscribePush, vapidConfigured, withoutSub, withSub, type StoredSub } from "../push";

const REMINDER_OPTIONS: [number, string][] = [[0, "정시"], [10, "10분 전"], [60, "1시간 전"], [1440, "1일 전"]];

function Switch({ on, onClick, label, disabled }: { on: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full ${disabled ? "opacity-50" : ""}`} style={{ background: on ? "var(--lime)" : "#3a3a40" }}>
      <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-fg" style={{ left: on ? 23 : 3 }} />
    </button>
  );
}

/** 설정 → 알림 탭: 종류별 on/off, 채널(앱 내 / 웹 푸시 / 이메일 준비 중), 방해금지, 기본 알림 시간. 08이 설정 화면에 배치한다. */
export function NotificationSettings() {
  const { data: s, isLoading, isError, error } = useNotificationSettings();
  const save = useUpdateNotificationSettings();
  const [msg, setMsg] = useState("");

  if (isLoading) return <div className="text-sm text-fg-subtle">불러오는 중…</div>;
  if (isError || !s) return <div className="text-sm text-danger">{(error as Error | null)?.message ?? "설정을 불러오지 못했어요"}</div>;

  const enabled = (s.enabled_types ?? {}) as Partial<Record<NotificationType, boolean>>;
  const channels = (s.channels ?? {}) as { in_app?: boolean; push?: boolean; email?: boolean };
  const subs = (s.push_subscriptions ?? []) as unknown as StoredSub[];
  const patch = (p: Parameters<typeof save.mutate>[0]["patch"]) => save.mutate({ userId: s.user_id, patch: p }, { onError: (e) => setMsg((e as Error).message) });

  const togglePush = async () => {
    setMsg("");
    if (channels.push) {
      const endpoint = await unsubscribePush();
      patch({ channels: { ...channels, push: false } as never, ...(endpoint ? { push_subscriptions: withoutSub(subs, endpoint) as never } : {}) });
      return;
    }
    const r = await subscribePush();
    if (!r.ok) {
      setMsg({ unsupported: "이 브라우저는 웹 푸시를 지원하지 않아요", "no-key": "푸시 키(VAPID)가 아직 설정되지 않았어요", denied: "알림 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요", failed: "푸시 구독에 실패했어요" }[r.reason]);
      return;
    }
    patch({ channels: { ...channels, push: true } as never, push_subscriptions: withSub(subs, r.sub) as never });
  };

  const reminders = s.default_reminder_minutes ?? [10];
  const toggleReminder = (m: number) => {
    const next = reminders.includes(m) ? reminders.filter((x) => x !== m) : [...reminders, m].sort((a, b) => a - b);
    patch({ default_reminder_minutes: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <span className="text-lg font-semibold">알림</span>

      <div className="flex flex-col">
        {SETTING_GROUPS.map((g) => (
          <div key={g.key} className="flex items-center justify-between gap-4 border-b border-border py-3.5">
            <div className="flex flex-col gap-0.5"><span className="text-[15px]">{g.label}</span><span className="text-xs text-fg-subtle">{g.desc}</span></div>
            <Switch on={groupEnabled(enabled, g)} label={g.label} onClick={() => patch({ enabled_types: toggleGroup(enabled, g, !groupEnabled(enabled, g)) as never })} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold">받는 방법</span>
        <div className="flex items-center justify-between"><span className="text-sm">앱 내 알림함 <span className="text-xs text-fg-subtle">(항상 켜짐)</span></span><Switch on label="앱 내 알림함" disabled /></div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">웹 푸시 {!pushSupported() ? <span className="text-xs text-fg-subtle">(이 브라우저는 지원하지 않아요)</span> : !vapidConfigured() ? <span className="text-xs text-fg-subtle">(푸시 키 설정 전)</span> : null}</span>
          <Switch on={!!channels.push} label="웹 푸시" onClick={() => void togglePush()} disabled={!pushSupported()} />
        </div>
        <div className="flex items-center justify-between"><span className="text-sm">이메일 <span className="text-xs text-fg-subtle">(준비 중)</span></span><Switch on={false} label="이메일" disabled /></div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">방해금지 시간대</span>
        <span className="text-xs text-fg-subtle">이 시간에는 푸시를 보내지 않고 끝난 뒤에 보내요. 알림함에는 항상 기록돼요.</span>
        <div className="flex items-center gap-2 text-sm">
          <input type="time" aria-label="시작" value={hhmm(s.quiet_start)} onChange={(e) => patch({ quiet_start: e.target.value || null })} className="rounded-xl bg-surface-3 px-3 py-2 outline-none" />
          <span>~</span>
          <input type="time" aria-label="종료" value={hhmm(s.quiet_end)} onChange={(e) => patch({ quiet_end: e.target.value || null })} className="rounded-xl bg-surface-3 px-3 py-2 outline-none" />
          {(s.quiet_start || s.quiet_end) && <button onClick={() => patch({ quiet_start: null, quiet_end: null })} className="text-xs text-fg-subtle">해제</button>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">새 일정의 기본 알림</span>
        <div className="flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map(([m, l]) => (
            <button key={m} onClick={() => toggleReminder(m)} className={`rounded-full px-3.5 py-1.5 text-sm ${reminders.includes(m) ? "bg-[var(--surface-5,#3a3a40)] font-semibold text-fg" : "bg-surface-3 text-fg-subtle"}`}>{l}</button>
          ))}
        </div>
      </div>

      {msg && <span className="text-sm text-danger" role="alert">{msg}</span>}
    </div>
  );
}
