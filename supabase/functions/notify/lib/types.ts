// 알림 계획(플랜) 공통 타입. 스캔 함수는 DB 없이 입력 데이터만으로 이 목록을 계산한다(순수 함수).

/** notifications.type 과 notification_settings.enabled_types 의 키 */
export type NotificationType =
  | "event_start" | "todo_due" | "budget_warning" | "budget_exceeded" | "payment_due" | "rain_forecast" | "sync_error";

export type Planned = {
  type: NotificationType;
  title: string;
  body?: string;
  /** 알림 클릭 시 이동할 앱 내 경로 */
  link?: string;
  /** (user_id, dedupe_key) 유니크 — 같은 알림이 두 번 만들어지지 않게 하는 멱등 키. 형식: `<종류>:<원본 id>:<발생/날짜>[:<변형>]` */
  dedupe_key: string;
  /** 알림이 울려야 하는 시각(UTC) */
  scheduled_at: Date;
};

/** (from, to] — 직전 실행 이후 ~ 지금. 시작은 제외, 끝은 포함. */
export type Window = { from: Date; to: Date };

export const inWindow = (t: Date, w: Window) => t.getTime() > w.from.getTime() && t.getTime() <= w.to.getTime();
