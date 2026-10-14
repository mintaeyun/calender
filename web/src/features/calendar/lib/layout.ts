// 주간·일간 그리드에서 겹치는 일정을 열로 나누는 레이아웃 (겹침 그룹 → 폭 분할).
export type Span = { start: number; end: number };
export type Placed = { col: number; cols: number };

/** 입력 순서를 유지한 채 각 항목의 열 번호와 그 겹침 그룹의 열 수를 돌려준다. */
export function layoutColumns(items: Span[]): Placed[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[b].end - items[a].end);
  const result: Placed[] = items.map(() => ({ col: 0, cols: 1 }));
  let group: number[] = [];
  let groupEnd = -Infinity;
  let colEnds: number[] = [];

  const flush = () => {
    for (const i of group) result[i].cols = colEnds.length;
    group = [];
    colEnds = [];
    groupEnd = -Infinity;
  };

  for (const i of order) {
    const it = items[i];
    if (group.length && it.start >= groupEnd) flush();
    let c = colEnds.findIndex((end) => end <= it.start);
    if (c === -1) {
      c = colEnds.length;
      colEnds.push(it.end);
    } else {
      colEnds[c] = it.end;
    }
    result[i].col = c;
    group.push(i);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return result;
}
