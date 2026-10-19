// find_free_time: 업무 시간대 안에서 일정과 겹치지 않는 빈 구간 계산 (순수 로직).
// 시간 값은 epoch ms(UTC). 업무 시간대는 사용자 시간대 기준 시·분이므로 고정 오프셋(분)으로 받는다.
// (Asia/Seoul은 DST가 없어 +540 고정. 다른 시간대 지원 시 오프셋 계산을 호출 측에서 주입)

export type Busy = { start: number; end: number };
export type Slot = { start: number; end: number };

export type FreeTimeOptions = {
  start: number;
  end: number;
  durationMin: number;
  busy: Busy[];
  tzOffsetMin: number; // UTC 대비 사용자 시간대 오프셋(분)
  workStartHour?: number; // 기본 9
  workEndHour?: number; // 기본 18
  includeWeekends?: boolean; // 기본 false
};

const DAY = 86_400_000;
const MIN = 60_000;

export function mergeBusy(busy: Busy[]): Busy[] {
  const sorted = busy.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

export function findFreeTime(o: FreeTimeOptions): Slot[] {
  const ws = o.workStartHour ?? 9;
  const we = o.workEndHour ?? 18;
  if (o.end <= o.start || o.durationMin <= 0 || we <= ws) return [];
  const need = o.durationMin * MIN;
  const busy = mergeBusy(o.busy);
  const off = o.tzOffsetMin * MIN;

  const slots: Slot[] = [];
  // 사용자 시간대 기준 자정부터 하루씩 순회
  let dayStartLocal = Math.floor((o.start + off) / DAY) * DAY;
  for (; dayStartLocal - off < o.end; dayStartLocal += DAY) {
    const dow = new Date(dayStartLocal).getUTCDay(); // 로컬 자정을 UTC로 읽으면 로컬 요일
    if (!o.includeWeekends && (dow === 0 || dow === 6)) continue;

    let cursor = Math.max(dayStartLocal - off + ws * 60 * MIN, o.start);
    const dayEnd = Math.min(dayStartLocal - off + we * 60 * MIN, o.end);
    for (const b of busy) {
      if (b.end <= cursor) continue;
      if (b.start >= dayEnd) break;
      if (b.start - cursor >= need) slots.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (dayEnd - cursor >= need) slots.push({ start: cursor, end: dayEnd });
  }
  return slots;
}
