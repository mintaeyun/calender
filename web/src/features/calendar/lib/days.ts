// 발생(인스턴스)을 날짜 칸에 배치. 여러 날에 걸친 일정은 걸친 모든 날에 들어간다.
import { addDays, dateKey } from "@/lib/time";
import type { EventInstance } from "./recurrence";

/** 인스턴스가 걸친 날짜들 (사용자 시간대 기준 'YYYY-MM-DD', 최대 400일) */
export function daysSpanned(i: EventInstance, tz: string): string[] {
  const first = dateKey(i.start, tz);
  const lastMs = i.end.getTime() > i.start.getTime() ? i.end.getTime() - 1000 : i.start.getTime();
  const last = dateKey(new Date(lastMs), tz);
  const out: string[] = [];
  for (let d = first, n = 0; d <= last && n < 400; d = addDays(d, 1), n++) out.push(d);
  return out;
}

export function instancesByDay(instances: EventInstance[], tz: string): Map<string, EventInstance[]> {
  const map = new Map<string, EventInstance[]>();
  for (const i of instances) {
    for (const d of daysSpanned(i, tz)) {
      const list = map.get(d);
      if (list) list.push(i);
      else map.set(d, [i]);
    }
  }
  // 종일 먼저, 그다음 시작 시각순
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.event.all_day) - Number(a.event.all_day) || a.start.getTime() - b.start.getTime());
  }
  return map;
}

/** 지금 이후 가장 가까운 시간 일정(종일 제외)의 key — "다음 일정" 강조용 */
export function nextUpcomingKey(instances: EventInstance[], now: Date): string | null {
  const next = instances
    .filter((i) => !i.event.all_day && i.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return next?.key ?? null;
}

/** 'YYYY-MM-DD' 두 날짜의 일수 차이 (b − a) */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
