// 화면 표시용 상수·헬퍼. 우선순위는 DB에 영문 코드(high/medium/low), 화면에는 상/중/하.
import type { Priority, TodoStatus } from "./due";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
export const PRI_LABEL: Record<Priority, string> = { high: "상", medium: "중", low: "하" };
/** 목업의 PRI 값: [배경, 글자] — 상=경고색, 중=회색, 하=어두운 회색 */
export const PRI_COLORS: Record<Priority, { bg: string; fg: string }> = {
  high: { bg: "var(--danger)", fg: "#1a0d0a" },
  medium: { bg: "#3a3a40", fg: "#f2f2f3" },
  low: { bg: "#26262a", fg: "#b4b4ba" },
};

export const COLUMNS: { status: TodoStatus; label: string; color: string }[] = [
  { status: "todo", label: "대기", color: "#8d8d94" },
  { status: "doing", label: "진행 중", color: "var(--purple)" },
  { status: "done", label: "완료", color: "var(--lime)" },
];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** '10월 14일 (수)' */
export function dueFull(date: string | null): string {
  if (!date) return "없음";
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAY[d.getUTCDay()]})`;
}

/** RRULE → 한국어 요약 (UI에서 만든 단순 규칙 위주). 해석 못 하면 원문. */
export function recurrenceLabel(rule: string | null): string {
  if (!rule) return "없음";
  const r = rule.replace(/^RRULE:/i, "");
  const p = Object.fromEntries(r.split(";").map((kv) => kv.split("=")));
  const by: Record<string, string> = { MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일" };
  let base: string;
  switch (p.FREQ) {
    case "DAILY": base = "매일"; break;
    case "WEEKLY": base = p.BYDAY ? `매주 ${p.BYDAY.split(",").map((d: string) => by[d] ?? d).join("·")}요일` : "매주"; break;
    case "MONTHLY": base = p.BYMONTHDAY ? `매월 ${p.BYMONTHDAY}일` : "매월"; break;
    case "YEARLY": base = "매년"; break;
    default: return rule;
  }
  if (p.COUNT) base += ` (${p.COUNT}회)`;
  if (p.UNTIL) base += ` (${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}까지)`;
  return base;
}

export type RecurrenceDraft = { freq: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; byday: string[]; until: string };

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const DAY_OPTIONS: [string, string][] = DAY_CODES.map((c) => [c, ({ MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일" } as Record<string, string>)[c]]);

/** 편집 UI 상태 → RRULE 문자열(없으면 null). until은 'YYYY-MM-DD'. */
export function buildRule(d: RecurrenceDraft, dueDate: string | null): string | null {
  if (d.freq === "NONE") return null;
  const parts = [`FREQ=${d.freq}`];
  if (d.freq === "WEEKLY" && d.byday.length) parts.push(`BYDAY=${DAY_CODES.filter((c) => d.byday.includes(c)).join(",")}`);
  if (d.freq === "MONTHLY" && dueDate) parts.push(`BYMONTHDAY=${Number(dueDate.slice(8, 10))}`);
  if (d.until) parts.push(`UNTIL=${d.until.replaceAll("-", "")}T235959Z`);
  return parts.join(";");
}

export function parseRule(rule: string | null): RecurrenceDraft {
  if (!rule) return { freq: "NONE", byday: [], until: "" };
  const p = Object.fromEntries(rule.replace(/^RRULE:/i, "").split(";").map((kv) => kv.split("=")));
  const u = p.UNTIL as string | undefined;
  return {
    freq: (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(p.FREQ) ? p.FREQ : "NONE") as RecurrenceDraft["freq"],
    byday: p.BYDAY ? p.BYDAY.split(",") : [],
    until: u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : "",
  };
}
