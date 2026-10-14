"use client";

import { useTimezone } from "@/lib/profile";
import { useTempUnit, useWeather } from "../hooks";
import { formatTemp, hourOf, ICON_EMOJI, STALE_NOTICE, updatedLabel } from "../lib/format";

/** 오늘 시간별 예보(향후 24시간). */
export function HourlyForecast() {
  const w = useWeather();
  const unit = useTempUnit();
  const tz = useTimezone();
  if (!w.hourly) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[22px] bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold">시간별 예보</span>
        {w.updatedAt && <span className="text-xs text-fg-subtle">{updatedLabel(w.updatedAt, tz)}</span>}
      </div>
      {w.stale && <span className="text-xs text-danger" role="status">{STALE_NOTICE}</span>}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {w.hourly.map((h) => (
          <div key={h.time} className="flex min-w-[54px] flex-col items-center gap-1 text-sm">
            <span className="text-xs text-fg-subtle">{hourOf(h.time)}시</span>
            <span aria-label={h.condition.label}>{ICON_EMOJI[h.condition.icon]}</span>
            <span className="font-semibold">{formatTemp(h.temp, unit)}</span>
            <span className={`text-xs ${h.precipProb >= 60 ? "text-lime" : "text-fg-subtle"}`}>{h.precipProb}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
