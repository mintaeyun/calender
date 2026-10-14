// 알림 설정 판정: 종류별 on/off, 방해금지 시간대(사용자 시간대 기준).
import { zonedParts } from "../../_shared/time.ts";
import type { NotificationType } from "./types.ts";

export type NotificationSettings = {
  enabled_types: Partial<Record<NotificationType, boolean>>;
  channels: { in_app?: boolean; push?: boolean; email?: boolean };
  quiet_start: string | null; // 'HH:mm' 또는 'HH:mm:ss'
  quiet_end: string | null;
};

/** 설정에 값이 없으면(키 누락) 켜진 것으로 본다. */
export const isTypeEnabled = (s: Pick<NotificationSettings, "enabled_types">, t: NotificationType) => s.enabled_types[t] !== false;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 방해금지 시간대인가. 23:00–07:00 처럼 자정을 넘는 구간과 시작==끝(없음)을 처리한다. */
export function isQuietTime(now: Date, tz: string, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;
  const s = toMinutes(quietStart);
  const e = toMinutes(quietEnd);
  if (s === e) return false;
  const p = zonedParts(now, tz);
  const m = p.hour * 60 + p.minute;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
