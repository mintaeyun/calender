// 일정 색상. 일정 자체 색 > 캘린더(분류) 색 > 기본색. 글자색은 배경 밝기에 맞춰 고른다.
import type { CalendarRow } from "../api";
import type { EventRow } from "./recurrence";

export const LIME = "oklch(0.9 0.19 125)";
export const PURPLE = "oklch(0.55 0.22 290)";
export const SKY = "oklch(0.7 0.12 230)";
export const DANGER = "oklch(0.75 0.16 25)";
export const NEUTRAL = "#34343a";

/** 일정 모달의 색상 선택지 (null = 분류 색 따라가기) */
export const EVENT_COLORS: { value: string | null; label: string }[] = [
  { value: null, label: "분류 색" },
  { value: PURPLE, label: "퍼플" },
  { value: NEUTRAL, label: "회색" },
  { value: SKY, label: "하늘" },
  { value: LIME, label: "라임" },
  { value: DANGER, label: "코랄" },
];

/** 배경색 위에 올릴 글자색 (밝으면 검정, 어두우면 흰색) */
export function readableOn(color: string): string {
  const ok = /^oklch\(\s*([\d.]+)/i.exec(color);
  if (ok) return Number(ok[1]) > 0.65 ? "#0b0b0c" : "#ffffff";
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#0b0b0c" : "#ffffff";
  }
  return "#ffffff";
}

export function eventColor(ev: EventRow, calendars: CalendarRow[], masterColor?: string | null): string {
  return ev.color ?? masterColor ?? calendars.find((c) => c.id === ev.calendar_id)?.color ?? NEUTRAL;
}

/** 구글 캘린더 소속 일정은 앱에서 수정하지 않는다(가져오기 전용 기본값). 양방향 지원(07)이 생기면 이 함수만 바꾼다. */
export function isReadOnlyEvent(ev: EventRow, calendars: CalendarRow[]): boolean {
  if (ev.google_event_id) return true;
  return calendars.find((c) => c.id === ev.calendar_id)?.source === "google";
}

export function isGoogleEvent(ev: EventRow, calendars: CalendarRow[]): boolean {
  return Boolean(ev.google_event_id) || calendars.find((c) => c.id === ev.calendar_id)?.source === "google";
}
