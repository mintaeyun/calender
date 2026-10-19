// 알림 종류 표시 정보와 시간 표기. 순수 로직.

export type NotificationType = "event_start" | "todo_due" | "budget_warning" | "budget_exceeded" | "payment_due" | "rain_forecast" | "sync_error";

/** 종류 칩: 라벨과 색(목업의 칩 색 규칙: 일정=퍼플, 할일=라임, 예산·오류=경고, 날씨=하늘, 결제=회색) */
export const TYPE_META: Record<NotificationType, { label: string; bg: string; fg: string }> = {
  event_start: { label: "일정", bg: "var(--purple)", fg: "#fff" },
  todo_due: { label: "할일", bg: "var(--lime)", fg: "var(--on-accent, #0b0b0c)" },
  budget_warning: { label: "예산", bg: "var(--lime)", fg: "var(--on-accent, #0b0b0c)" },
  budget_exceeded: { label: "예산", bg: "var(--danger)", fg: "var(--on-accent, #1a0d0a)" },
  payment_due: { label: "결제", bg: "var(--surface-5, #34343a)", fg: "var(--fg)" },
  rain_forecast: { label: "날씨", bg: "var(--sky)", fg: "var(--on-accent, #0b0b0c)" },
  sync_error: { label: "동기화", bg: "var(--danger)", fg: "var(--on-accent, #1a0d0a)" },
};

export const typeMeta = (t: string) => TYPE_META[t as NotificationType] ?? { label: "알림", bg: "var(--surface-5, #34343a)", fg: "var(--fg)" };

/** 설정 화면의 토글 6개. 예산은 80%·100% 두 종류를 함께 켜고 끈다. */
export const SETTING_GROUPS: { key: string; label: string; desc: string; types: NotificationType[] }[] = [
  { key: "event", label: "일정 시작", desc: "일정마다 지정한 시간에 알려요", types: ["event_start"] },
  { key: "todo", label: "할일 마감", desc: "마감 당일 오전 9시와 기한이 지난 다음 날", types: ["todo_due"] },
  { key: "budget", label: "예산 임박/초과", desc: "예산의 80%에 도달하거나 100%를 넘을 때", types: ["budget_warning", "budget_exceeded"] },
  { key: "pay", label: "결제 예정", desc: "고정지출 결제 전날 저녁 8시", types: ["payment_due"] },
  { key: "rain", label: "우천 알림", desc: "장소가 있는 일정이 있는 날 비·눈 예보(강수확률 60% 이상)", types: ["rain_forecast"] },
  { key: "sync", label: "동기화 오류", desc: "구글 캘린더 연결이 끊겼을 때", types: ["sync_error"] },
];

/** 'N분 전' / 'N시간 전' / '어제' / 'M/D' */
export function relativeTime(iso: string, now: Date = new Date(), tz = "Asia/Seoul"): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const yesterday = day(new Date(now.getTime() - 86_400_000));
  if (day(new Date(iso)) === yesterday) return "어제";
  const [, m, d] = day(new Date(iso)).split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 설정 그룹이 켜져 있는가(그룹의 모든 종류가 꺼져 있지 않을 때) */
export const groupEnabled = (enabled: Partial<Record<NotificationType, boolean>>, g: (typeof SETTING_GROUPS)[number]) =>
  g.types.every((t) => enabled[t] !== false);

export function toggleGroup(enabled: Partial<Record<NotificationType, boolean>>, g: (typeof SETTING_GROUPS)[number], on: boolean) {
  const next = { ...enabled };
  for (const t of g.types) next[t] = on;
  return next;
}

/** 'HH:mm:ss' → 'HH:mm' (input[type=time] 값) */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
