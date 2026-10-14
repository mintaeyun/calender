"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "./Header";
import { useUnreadCount } from "./useUnreadCount";

/** 헤더 없이 보여주는 경로(로그인·인증 콜백·비밀번호 재설정) */
const BARE = ["/login", "/auth", "/update-password"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const unread = useUnreadCount();

  if (BARE.some((p) => pathname === p || pathname.startsWith(p + "/"))) return <>{children}</>;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-[1340px] flex-col gap-6 px-7 pb-12 pt-[26px]">
        <Header unreadCount={unread} />
        <main>{children}</main>
      </div>
    </div>
  );
}
