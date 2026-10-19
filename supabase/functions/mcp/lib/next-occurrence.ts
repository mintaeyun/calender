// 반복 할일의 다음 주기 계산. web/src/features/todo/lib/nextOccurrence.ts 와 같은 로직(Edge 에서 web 코드를 import 할 수 없어 복사).
// 규칙을 바꾸면 양쪽을 함께 고친다.
import * as rruleModule from "rrule";
import type { RRule as RRuleType } from "rrule";
// deno-lint-ignore no-explicit-any
const RRule: typeof RRuleType = (rruleModule as any).RRule ?? (rruleModule as any).default.RRule;

export type Next = { dueDate: string; rule: string };

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/** 다음 마감일과 새 행 규칙. 종료 조건(UNTIL/COUNT)을 넘으면 null. 기준은 마감일과 완료일 중 늦은 날. */
export function nextOccurrence(ruleStr: string, dueDate: string, completedOn: string): Next | null {
  const src = ruleStr.replace(/^RRULE:/i, "");
  const opts = RRule.parseString(src);
  const rule = new RRule({ ...opts, dtstart: toUtc(dueDate) });
  const base = completedOn > dueDate ? completedOn : dueDate;
  const next = rule.after(toUtc(base), false);
  if (!next) return null;

  let newRule = src;
  if (opts.count != null) {
    if (opts.count <= 1) return null;
    newRule = src.replace(/COUNT=\d+/i, `COUNT=${opts.count - 1}`);
  }
  return { dueDate: next.toISOString().slice(0, 10), rule: newRule };
}
