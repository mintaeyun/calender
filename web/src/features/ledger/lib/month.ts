// 'YYYY-MM' 월 유틸.

export const addMonths = (month: string, n: number): string => {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

export const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
export const monthOf = (date: string) => date.slice(0, 7);

/** 달의 일수 */
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** 오늘 포함 남은 일수(해당 월이 아니면 이번 월 전체/0). today는 'YYYY-MM-DD'. */
export function daysLeftInMonth(month: string, today: string): number {
  if (monthOf(today) < month) return daysInMonth(month);
  if (monthOf(today) > month) return 0;
  return daysInMonth(month) - Number(today.slice(8, 10)) + 1;
}

/** 월의 1일이 무슨 요일인지(0=일) */
export const firstWeekday = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).getUTCDay();
