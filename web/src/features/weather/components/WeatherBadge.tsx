"use client";

import Link from "next/link";
import { useTimezone } from "@/lib/profile";
import { useTempUnit, useWeather } from "../hooks";
import { badgeText, ICON_EMOJI, STALE_NOTICE, updatedLabel } from "../lib/format";

/** 대시보드 상단 칩: `18° 맑음 · 체감 17° · 19시 비 60%` + 업데이트 시각. 장애 시 마지막 캐시와 안내 문구. */
export function WeatherBadge() {
  const w = useWeather();
  const unit = useTempUnit();
  const tz = useTimezone();

  if (w.needsLocation) return <Link href="/settings/weather" className="rounded-full bg-surface-2 px-4 py-2 text-sm text-fg-subtle">날씨 지역 설정하기</Link>;
  if (w.isLoading) return <span className="rounded-full bg-surface-2 px-4 py-2 text-sm text-fg-subtle">날씨 불러오는 중…</span>;
  if (!w.data) return <span className="rounded-full bg-surface-2 px-4 py-2 text-sm text-danger" role="status">날씨를 불러오지 못했어요</span>;

  const t = badgeText(w.data, unit);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-fg-muted" title={w.stale ? STALE_NOTICE : undefined}>
      <span aria-hidden>{ICON_EMOJI[w.data.current.condition.icon]}</span>
      <span>{w.location?.name && `${w.location.name} · `}{t.main}</span>
      {t.rain && <span className="text-lime">· {t.rain}</span>}
      <span className={`text-xs ${w.stale ? "text-danger" : "text-fg-subtle"}`}>{updatedLabel(w.data.fetched_at, tz)}{w.stale && " · 오래된 예보"}</span>
    </span>
  );
}
