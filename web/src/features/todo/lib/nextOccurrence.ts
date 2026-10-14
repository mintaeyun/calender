// 반복 할일의 다음 주기 계산. RFC 5545 RRULE(`rrule` 라이브러리). 순수 함수.
import { RRule } from "rrule";

export type Next = { dueDate: string; rule: string };

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * 다음 주기 마감일과 새 행에 저장할 규칙을 돌려준다. 종료 조건(UNTIL/COUNT)을 넘으면 null.
 * 기준은 현재 마감일과 완료일 중 늦은 날 — 늦게 완료해도 과거 날짜를 만들지 않는다.
 * 새 행은 DTSTART가 바뀌므로 COUNT는 한 번 소모한 만큼 줄여서 돌려준다.
 */
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
