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

/**
 * 앱에서 수정·삭제·드래그할 수 없는 일정인가.
 *  - 구글에서 읽기 전용 권한인 캘린더(공휴일 등, calendars.read_only)는 항상 읽기 전용
 *  - 구글 캘린더 소속 일정은 가져오기 전용일 때만 읽기 전용, 양방향(twoWay)이면 수정 가능(변경은 구글에 반영된다)
 *  - 앱 캘린더의 일정은 구글에 push 된 것(google_event_id 있음)이어도 수정 가능
 */
export function isReadOnlyEvent(ev: EventRow, calendars: CalendarRow[], twoWay = false): boolean {
  const cal = calendars.find((c) => c.id === ev.calendar_id);
  if (cal?.read_only) return true;
  if (cal?.source === "google") return !twoWay;
  return false;
}

export function isGoogleEvent(ev: EventRow, calendars: CalendarRow[]): boolean {
  return Boolean(ev.google_event_id) || calendars.find((c) => c.id === ev.calendar_id)?.source === "google";
}
