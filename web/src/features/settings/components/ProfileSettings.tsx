"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfile, useUpdateProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth";
import { ChangePasswordForm, DeleteAccountButton } from "@/components/layout/AccountActions";
import { isValidTimezone, listTimezones, tzLabel } from "../lib/timezones";
import { applyTheme, type Theme } from "../lib/theme";
import { Seg } from "./Seg";

const SCREENS = [["dashboard", "대시보드"], ["calendar", "캘린더"], ["todos", "할일"], ["ledger", "가계부"]] as const;
const card = "flex flex-col gap-[18px] rounded-[22px] bg-surface p-6";
const field = "rounded-xl bg-surface-3 px-3.5 py-3 text-sm";

/** SET-1: 프로필·화면. 값을 바꾸면 즉시 저장하고 useProfile 캐시를 갱신한다. */
export function ProfileSettings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const user = useQuery({ queryKey: ["auth", "user"], queryFn: async () => (await createClient().auth.getUser()).data.user });
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const zones = useMemo(listTimezones, []);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name ?? "");
      setTz(profile.data.timezone);
    }
  }, [profile.data]);

  const save = async (patch: Parameters<typeof update>[0]) => {
    try {
      await update(patch);
      setMsg({ ok: true, text: "저장했어요" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  if (profile.isLoading) return <div className={card}>불러오는 중…</div>;
  if (profile.isError || !profile.data) return <div className={`${card} text-danger`}>프로필을 불러오지 못했어요. 새로고침해 주세요.</div>;
  const p = profile.data;
  const provider = user.data?.app_metadata?.provider === "google" ? "Google 로그인" : "이메일 로그인";

  return (
    <>
      <div className={card}>
        <span className="text-lg font-semibold">프로필 · 화면</span>
        <div className="grid grid-cols-1 items-center gap-x-5 gap-y-4 text-sm sm:grid-cols-[160px_1fr]">
          <label htmlFor="set-name" className="text-fg-subtle">이름</label>
          <input id="set-name" className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== (p.display_name ?? "") && save({ display_name: name.trim() || null })} />

          <span className="text-fg-subtle">이메일</span>
          <span className={`${field} text-fg-muted`}>{user.data?.email ?? "…"} · {provider}</span>

          <label htmlFor="set-tz" className="text-fg-subtle">시간대</label>
          <div className="flex flex-col gap-1">
            <input id="set-tz" className={field} list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)}
              onBlur={() => {
                if (tz === p.timezone) return;
                if (!isValidTimezone(tz)) { setMsg({ ok: false, text: "올바른 시간대가 아니에요 (예: Asia/Seoul)" }); setTz(p.timezone); return; }
                save({ timezone: tz });
              }} />
            <datalist id="tz-list">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            <span className="text-xs text-fg-subtle">{tzLabel(p.timezone)} · 일정 시각과 오늘/이번 주 기준이 바뀝니다</span>
          </div>

          <span className="text-fg-subtle">테마</span>
          <Seg label="테마" value={p.theme as Theme} items={[["light", "라이트"], ["dark", "다크"], ["system", "시스템"]]}
            onChange={(v) => { applyTheme(v); save({ theme: v }); }} />

          <span className="text-fg-subtle">주 시작 요일</span>
          <Seg label="주 시작 요일" value={p.week_start as "monday" | "sunday"} items={[["monday", "월요일"], ["sunday", "일요일"]]}
            onChange={(v) => save({ week_start: v })} />

          <label htmlFor="set-start" className="text-fg-subtle">기본 시작 화면</label>
          <select id="set-start" className={field} value={p.start_screen} onChange={(e) => save({ start_screen: e.target.value })}>
            {SCREENS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div role="status" className={`min-h-4 text-xs ${msg?.ok ? "text-fg-subtle" : "text-danger"}`}>{msg?.text}</div>
      </div>
      <AccountCard />
    </>
  );
}

/** 비밀번호 변경 · 로그아웃 · 계정 삭제(AUTH-3, 01의 컴포넌트 사용. 삭제는 확인 문구 입력 필요) */
function AccountCard() {
  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-surface px-6 py-5 text-sm">
      <span className="text-fg-subtle">계정</span>
      <ChangePasswordForm />
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button className="rounded-full bg-surface-3 px-4 py-2" onClick={() => signOut()}>로그아웃</button>
        <DeleteAccountButton />
      </div>
    </div>
  );
}
