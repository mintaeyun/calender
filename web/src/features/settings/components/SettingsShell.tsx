"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NotificationSettings } from "@/features/notifications/components/NotificationSettings";
import { GoogleSettings } from "@/features/google/components/GoogleSettings";
import { McpSettings } from "@/features/mcp/components/McpSettings";
import { WeatherSettings } from "@/features/weather/components/WeatherSettings";
import { SETTINGS_TABS, type SettingsTab } from "../lib/tabs";
import { ProfileSettings } from "./ProfileSettings";
import { CategoriesSettings } from "./CategoriesSettings";

function Soon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-surface p-6">
      <span className="text-lg font-semibold">{title}</span>
      <p className="text-sm text-fg-subtle">{children}</p>
    </div>
  );
}

function Panel({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "profile": return <ProfileSettings />;
    case "cats": return <CategoriesSettings />;
    case "noti": return <NotificationSettings />;
    case "weather": return <WeatherSettings />;
    case "google": return <GoogleSettings />;
    case "mcp": return <McpSettings />;
    // TODO(cal2): features/export 의 BackupSettings(SET-3)가 main에 들어오면 교체
    case "backup": return <Soon title="백업 · 내보내기">내보내기·가져오기는 준비 중이에요.</Soon>;
  }
}

/** 설정 7개 탭 레이아웃. 탭은 /settings/<tab> 경로. */
export function SettingsShell({ tab }: { tab: SettingsTab }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="설정 메뉴" className="flex flex-col gap-0.5">
        <h1 className="font-display px-1 pb-3.5 text-[30px]">설정</h1>
        <div className="flex gap-0.5 overflow-x-auto md:flex-col">
          {SETTINGS_TABS.map(([k, name]) => (
            <Link key={k} href={`/settings/${k}`} aria-current={k === tab ? "page" : undefined}
              className={`whitespace-nowrap rounded-xl px-3.5 py-[11px] text-[15px] ${k === tab ? "bg-surface-2 text-white" : "text-fg-muted hover:bg-surface-2/60"}`}>
              {name}
            </Link>
          ))}
        </div>
      </nav>
      <div className="flex flex-col gap-3.5 md:pt-14">
        <Panel tab={tab} />
      </div>
    </div>
  );
}
