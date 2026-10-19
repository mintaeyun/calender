// 동기화 대상 캘린더: 구글에서 이름이 "mycal" 인 캘린더 하나만 연동한다(사용자 요구).
// 이름 비교는 공백을 모두 지우고 소문자로 맞춰 "정확 일치" 로 본다(예: " MyCal " = "mycal"). 환경변수 GOOGLE_TARGET_CALENDAR 로 바꿀 수 있다.
export const TARGET_CALENDAR_NAME = "mycal";

export const normalizeCalendarName = (name: string | null | undefined) => (name ?? "").replace(/\s+/g, "").toLowerCase();

export const isTargetCalendar = (name: string | null | undefined, target: string = TARGET_CALENDAR_NAME) =>
  normalizeCalendarName(name) === normalizeCalendarName(target);
