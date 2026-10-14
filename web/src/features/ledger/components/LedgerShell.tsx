"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useQuickAdd } from "@/components/layout/QuickAdd";

const TABS: [string, string][] = [["/ledger", "내역"], ["/ledger/calendar", "달력"], ["/ledger/stats", "통계"], ["/ledger/budget", "예산"], ["/ledger/recurring", "고정지출"], ["/ledger/accounts", "계좌"]];

/** 가계부 공통 헤더: 제목, 탭(라우트), 거래 추가 버튼. */
export function LedgerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { openQuick } = useQuickAdd();
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-[18px]">
          <h1 className="font-display text-[30px]">가계부</h1>
          <nav className="flex overflow-x-auto rounded-full bg-surface-2 p-[5px] text-sm" aria-label="가계부 메뉴">
            {TABS.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap rounded-full px-4 py-2 no-underline hover:no-underline ${path === href ? "bg-[#3a3a40] font-semibold text-white" : "text-fg-subtle"}`}>{label}</Link>
            ))}
          </nav>
        </div>
        <button onClick={() => openQuick("tx")} className="rounded-full bg-white px-[18px] py-2.5 text-sm font-semibold text-black">거래 추가 +</button>
      </div>
      {children}
    </div>
  );
}
