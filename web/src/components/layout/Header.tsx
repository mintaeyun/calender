"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useProfile } from "@/lib/profile";
import { signOut } from "@/lib/auth";

const NAV: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "대시보드", match: (p) => p === "/" },
  { href: "/calendar", label: "일정", match: (p) => p.startsWith("/calendar") },
  { href: "/todos", label: "할일", match: (p) => p.startsWith("/todos") },
  { href: "/ledger", label: "가계부", match: (p) => p.startsWith("/ledger") },
  { href: "/settings/profile", label: "설정", match: (p) => p.startsWith("/settings") },
];

const pill = "flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 text-sm hover:no-underline";

export function Header({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();
  const { data: profile } = useProfile();
  const [menu, setMenu] = useState(false);
  const initial = (profile?.display_name ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-3 text-fg hover:no-underline">
        <div className="h-[38px] w-[38px] rounded-full bg-purple" />
        <span className="font-display text-xl">라이프 매니저</span>
      </Link>

      <nav className="flex gap-1.5 text-[15px]" aria-label="주 메뉴">
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 hover:no-underline ${
                active ? "bg-white font-semibold text-black" : "bg-surface-2 text-fg-muted"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative flex items-center justify-end gap-2">
        <Link href="/search" className={`${pill} text-fg-muted`}>
          <span className="h-3 w-3 rounded-full border-2 border-fg-muted" />
          검색
        </Link>
        <Link href="/notifications" className={`${pill} text-[#d6d6da]`}>
          알림
          {unreadCount > 0 && (
            <span className="rounded-full bg-[oklch(0.65_0.2_25)] px-[7px] py-px text-[11px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </Link>
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="계정 메뉴"
          aria-expanded={menu}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#3a3a40] text-sm font-semibold"
        >
          {initial}
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-[52px] z-20 flex w-52 flex-col rounded-2xl border border-border bg-surface p-2 text-sm shadow-lg">
              <div className="truncate px-3 py-2 text-fg-subtle">{profile?.display_name ?? "내 계정"}</div>
              <Link
                href="/settings/profile"
                onClick={() => setMenu(false)}
                className="rounded-xl px-3 py-2 text-fg hover:bg-surface-3 hover:no-underline"
              >
                설정
              </Link>
              <button onClick={signOut} className="rounded-xl px-3 py-2 text-left text-fg hover:bg-surface-3">
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
