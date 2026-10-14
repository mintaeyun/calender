"use client";

import { addMonths, monthLabel } from "../lib/month";

/** 월 이동 컨트롤 */
export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button aria-label="이전 달" onClick={() => onChange(addMonths(month, -1))} className="h-8 w-8 rounded-full bg-surface-2">‹</button>
      <span className="min-w-[110px] text-center font-semibold">{monthLabel(month)}</span>
      <button aria-label="다음 달" onClick={() => onChange(addMonths(month, 1))} className="h-8 w-8 rounded-full bg-surface-2">›</button>
    </div>
  );
}
